import fs from 'node:fs';
import path from 'node:path';
import { AccessTokens, CmsAuth } from '@velocity-astro/cms-auth';
import { CmsError, TOKEN_ROLES, type Actor, type ContentTypeDef, type Role } from '@velocity-astro/cms-core';
import { installAgentFiles } from './agent-files.js';
import { checkSite, formatCheck } from './check.js';
import { CONTENT_COMMANDS, CONTENT_USAGE, parseArgs, runContentCommand, type Parsed } from './cli-content.js';
import { connect } from './connection.js';
import { LogMailer } from './editor.js';
import { initSite, readEnvFile, runScript } from './init.js';

export interface CliEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly print: (line: string) => void;
  /** The folder the command is run in. Defaults to the process's own. */
  readonly dir?: string;
  /** Lines read from an agent, for `mcp`. Defaults to standard input. */
  readonly input?: AsyncIterable<string>;
  readonly fetch?: typeof fetch;
}

const USAGE = `Usage:
  velocity-cms init [<email> <name>]  Set this site up for the CMS: a secret in .env, the integration in the
                                      Astro config. With an email and a name, also create the first owner.
  velocity-cms owner <email> <name>   Create the site's first owner and print a link that signs them in.
  velocity-cms link <email>           Print a new sign-in link for someone who already has access.
  velocity-cms token "<what it is for>" [--role editor|author] [--publish] [--personal-data] [--days n] [--save]
                                      Make an access token for an AI agent or a script. --save writes it to
                                      .env as VELOCITY_CMS_TOKEN instead of printing it.
  velocity-cms check [--json]         Check the site against the CMS's rules: live pages, blocks, forms, setup.
  velocity-cms agents                 Bring .agents/cms.md and the cms-* skills up to date with this version.

${CONTENT_USAGE}

Reads VELOCITY_CMS_SECRET, VELOCITY_CMS_ORIGIN (the site's address, such as https://example.com)
and VELOCITY_CMS_DATABASE_URL from the environment or from a .env file in this folder.`;

/** The `velocity-cms` command. Returns the exit code. */
export async function runCli(args: readonly string[], environment: CliEnvironment): Promise<number> {
  const { print } = environment;
  const dir = environment.dir ?? process.cwd();
  const [head] = args;
  if (head === 'token' || head === 'check' || head === 'agents' || (head !== undefined && CONTENT_COMMANDS.has(head))) {
    const parsed = parseArgs(args.slice(1));
    if (parsed.flags['help'] === true) {
      print(USAGE);
      return 0;
    }
    if (head === 'agents') {
      installAgentFiles(dir, print);
      return 0;
    }
    if (head === 'check') return check(parsed, dir, environment.env, print);
    if (head === 'token') return makeToken(parsed, dir, environment.env, print);
    return runContentCommand(head, parsed, { env: environment.env, print, dir, ...(environment.input && { input: environment.input }), ...(environment.fetch && { fetch: environment.fetch }) });
  }
  let { env } = environment;
  const [asked, email, ...nameParts] = args;
  const name = nameParts.join(' ');
  let command = asked;
  const dev = runScript(dir, 'dev');
  if (command === 'init') {
    if (email && !name) {
      print(`Give the owner's name after the address, or leave both out.\n\n${USAGE}`);
      return 1;
    }
    const done = initSite({ dir, print });
    if (done.code !== 0) return done.code;
    installAgentFiles(dir, print);
    if (!email) {
      print(`\nNext, make the first owner:\n\n  npx velocity-cms owner <email> <name>\n\nThen start the site (\`${dev}\`) and open /admin.`);
      return 0;
    }
    // What init wrote is used at once; what the environment already said still wins.
    env = { ...done.env, ...Object.fromEntries(Object.entries(env).filter(([, value]) => value)) };
    command = 'owner';
    print('');
  }
  const understood = (command === 'owner' && email && name) || (command === 'link' && email && !name);
  if (!understood || !email) {
    print(USAGE);
    return command === undefined || command === 'help' ? 0 : 1;
  }
  const secret = env.VELOCITY_CMS_SECRET;
  const origin = env.VELOCITY_CMS_ORIGIN;
  if (!secret || !origin) {
    print(`${secret ? 'VELOCITY_CMS_ORIGIN' : 'VELOCITY_CMS_SECRET'} is not set.\n\n${USAGE}`);
    return 1;
  }

  const connection = await connect({
    ...(env.VELOCITY_CMS_DATABASE_URL && { url: env.VELOCITY_CMS_DATABASE_URL }),
    ...(env.VELOCITY_CMS_DATABASE_TOKEN && { authToken: env.VELOCITY_CMS_DATABASE_TOKEN }),
  });
  try {
    const auth = new CmsAuth({ db: connection.db, secret, origin, siteName: 'Velocity CMS', mailer: new LogMailer(print), access: connection.cms.access });
    if (command === 'owner') {
      const { user, link } = await auth.createFirstOwner({ email, name });
      print(`${user.name} <${user.email}> is the site's owner.\n\nOpen this link to sign in. It works once, for 10 minutes:\n\n${link}\n${origin.includes('localhost') ? `\nStart the site first (\`${dev}\`), so the link has somewhere to land.\n` : ''}`);
    } else {
      // Whoever holds the link is that person, so it is only ever printed here, for whoever runs the site.
      print(`Open this link to sign in as ${email}. It works once, for 10 minutes:\n\n${await auth.createSignInLink(email)}\n`);
    }
    return 0;
  } catch (error) {
    if (!(error instanceof CmsError)) throw error;
    print(error.message);
    return 1;
  } finally {
    connection.close();
  }
}

/** Where the site's database is, for the commands that open it on this computer. */
function databaseUrl(dir: string, env: CliEnvironment['env']): string {
  return env.VELOCITY_CMS_DATABASE_URL ?? `file:${path.join(dir, 'cms', 'data.db')}`;
}

/** Whether a database can be opened without making it: a file that is not there is not opened. */
function databaseThere(url: string): boolean {
  const file = /^file:(?!:memory:)([^?]+)/.exec(url)?.[1];
  return file === undefined || fs.existsSync(file);
}

async function check(parsed: Parsed, dir: string, env: CliEnvironment['env'], print: (line: string) => void): Promise<number> {
  const url = databaseUrl(dir, env);
  let types: ContentTypeDef[] | undefined;
  let typesSkipped: string | undefined;
  if (!databaseThere(url)) {
    typesSkipped = 'the database has not been made yet: run the seed, or start the site once';
  } else {
    try {
      const connection = await connect({ url, ...(env.VELOCITY_CMS_DATABASE_TOKEN && { authToken: env.VELOCITY_CMS_DATABASE_TOKEN }) });
      try {
        types = await connection.cms.schema.list();
      } finally {
        connection.close();
      }
    } catch {
      typesSkipped = 'the database could not be opened from here';
    }
  }
  const result = checkSite({ dir, env, ...(types && { types }), ...(typesSkipped && { typesSkipped }) });
  print(parsed.flags['json'] === true ? JSON.stringify(result, null, 2) : formatCheck(result));
  return result.findings.some((finding) => finding.level === 'error') ? 1 : 0;
}

const isTokenRole = (role: string): role is Role => (TOKEN_ROLES as readonly string[]).includes(role);

async function makeToken(parsed: Parsed, dir: string, env: CliEnvironment['env'], print: (line: string) => void): Promise<number> {
  const name = parsed.positional.join(' ').trim();
  const role = typeof parsed.flags['role'] === 'string' ? parsed.flags['role'] : 'editor';
  const days = typeof parsed.flags['days'] === 'string' ? Number(parsed.flags['days']) : 90;
  if (name === '') {
    print(`Say what the token is for, such as: velocity-cms token "Claude on my laptop" --save\n\n${USAGE}`);
    return 1;
  }
  if (!isTokenRole(role)) {
    print(`A token acts as ${TOKEN_ROLES.join(' or ')}.`);
    return 1;
  }
  const url = databaseUrl(dir, env);
  if (!databaseThere(url)) {
    print("The site's database has not been made yet. Run the seed, or start the site once, then make the token.");
    return 1;
  }
  const connection = await connect({ url, ...(env.VELOCITY_CMS_DATABASE_TOKEN && { authToken: env.VELOCITY_CMS_DATABASE_TOKEN }) });
  try {
    // Whoever runs this on the site's own computer holds its database, so they act as its owner.
    const owner: Actor = { kind: 'cli', id: 'velocity-cms', role: 'owner' };
    const made = await new AccessTokens(connection.db, connection.cms.access).createToken(owner, { name, role, publish: parsed.flags['publish'] === true, personalData: parsed.flags['personal-data'] === true, days });
    const what = `"${made.token.name}" acts as ${role}${made.token.publish ? ', may publish' : ''}${made.token.personalData ? ', may read personal data' : ''}, and works until ${made.token.expiresAt.slice(0, 10)}.`;
    if (parsed.flags['save'] === true) {
      saveEnvValue(dir, 'VELOCITY_CMS_TOKEN', made.secret);
      print(`Made a token: ${what}\nIt is in .env as VELOCITY_CMS_TOKEN. Take it away in the editor under Settings, Access tokens.`);
      if (!ignoresEnv(dir)) print('.gitignore does not leave out .env: add it, so the token stays out of git.');
    } else {
      print(`Made a token: ${what}\n\n${made.secret}\n\nIt is shown this once. Keep it like a password, and take it away in the editor under Settings, Access tokens.`);
    }
    return 0;
  } catch (error) {
    if (!(error instanceof CmsError)) throw error;
    print(error.message);
    return 1;
  } finally {
    connection.close();
  }
}

/** Sets one value in the site's .env, replacing the line that holds it or adding one. */
function saveEnvValue(dir: string, name: string, value: string): void {
  const file = path.join(dir, '.env');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const next = name in readEnvFile(text) && pattern.test(text) ? text.replace(pattern, line) : `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`;
  fs.writeFileSync(file, next);
}

function ignoresEnv(dir: string): boolean {
  const file = path.join(dir, '.gitignore');
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').split(/\r?\n/).some((line) => ['.env', '/.env', '.env*'].includes(line.trim()));
}
