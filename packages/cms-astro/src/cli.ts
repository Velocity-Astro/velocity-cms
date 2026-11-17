import { CmsAuth } from '@velocity/cms-auth';
import { CmsError } from '@velocity/cms-core';
import { connect } from './connection.js';
import { LogMailer } from './editor.js';

export interface CliEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly print: (line: string) => void;
}

const USAGE = `Usage:
  velocity-cms owner <email> <name>   Create the site's first owner and print a link that signs them in.
  velocity-cms link <email>           Print a new sign-in link for someone who already has access.

Reads VELOCITY_CMS_SECRET, VELOCITY_CMS_ORIGIN (the site's address, such as https://example.com)
and VELOCITY_CMS_DATABASE_URL from the environment or from a .env file in this folder.`;

/** The `velocity-cms` command. Returns the exit code. */
export async function runCli(args: readonly string[], { env, print }: CliEnvironment): Promise<number> {
  const [command, email, ...nameParts] = args;
  const name = nameParts.join(' ');
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
      print(`${user.name} <${user.email}> is the site's owner.\n\nOpen this link to sign in. It works once, for 10 minutes:\n\n${link}\n`);
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
