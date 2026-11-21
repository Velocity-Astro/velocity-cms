#!/usr/bin/env node
/**
 * Makes someone an owner of a demo, for the Demo workflow run by hand with "Add an owner". A demo
 * sends no email and everyone else signs in as the shared editor, so an owner is how a person who
 * runs the demo reaches People, Settings and Plugins there. The nightly reset keeps owners.
 *
 * It prints no sign-in link: this repository is public, and so are its workflow logs. The owner
 * signs in at the demo's /admin by asking for a link, which a site that sends no email writes to
 * its own log (the Vercel project's logs, which only its team can read), then adds a passkey.
 *
 * The address is read from the run's own event, never from the step's environment (which the log
 * prints), and masked before anything else is written.
 *
 *   VELOCITY_CMS_DATABASE_URL, VELOCITY_CMS_DATABASE_TOKEN, VELOCITY_CMS_SECRET and SITE_URL
 *   come from .github/scripts/demo-site.sh; GITHUB_EVENT_PATH from GitHub.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
const email = String(event.inputs?.owner ?? '').trim().toLowerCase();
if (email === '') process.exit(0);
console.log(`::add-mask::${email}`);
const name = String(event.inputs?.owner_name ?? '').trim() || email.split('@')[0];
if (name !== email.split('@')[0]) console.log(`::add-mask::${name}`);

const packages = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages');
const { connect } = await import(pathToFileURL(path.join(packages, 'cms-astro/dist/connection.js')).href);
const { CmsAuth } = await import(pathToFileURL(path.join(packages, 'cms-auth/dist/index.js')).href);

// Nothing is sent from here: the owner asks the demo for a sign-in link themselves.
const quiet = { sendSignInLink: async () => {}, sendInvitation: async () => {} };
const actor = { kind: 'cli', id: 'demo-owner', role: 'owner' };
const connection = await connect({ url: process.env.VELOCITY_CMS_DATABASE_URL, authToken: process.env.VELOCITY_CMS_DATABASE_TOKEN });
try {
  const auth = new CmsAuth({
    db: connection.db,
    secret: process.env.VELOCITY_CMS_SECRET,
    origin: process.env.SITE_URL,
    siteName: 'Velocity CMS demo',
    mailer: quiet,
    access: connection.cms.access,
  });
  const known = (await auth.listUsers(actor)).find((user) => user.email === email);
  if (known?.role === 'owner') console.log('That address is an owner of this demo already.');
  else if (known) {
    await auth.changeRole(actor, known.id, 'owner');
    console.log('That address was on this demo already, and is an owner now.');
  } else {
    await auth.invite(actor, { email, name, role: 'owner' });
    console.log('That address is an owner of this demo now.');
  }
  console.log(`To sign in: open ${process.env.SITE_URL}/admin, ask for a link with that address, and open the link from this project's logs in Vercel (it sends no email). Then add a passkey under your name, so the next sign-in needs no link.`);
} finally {
  connection.close();
}
