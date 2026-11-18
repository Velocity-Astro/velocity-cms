/**
 * The editor as a site serves it: the whole app, talking to the real API and the real sign-in.
 * `pnpm --filter @velocity-astro/cms-admin build:app` builds this into `app-dist/`, and the Velocity
 * CMS integration serves those files at `/admin`.
 */
import '@velocity-astro/cms-ui/styles.css';
import { createAuthClient } from '@velocity-astro/cms-auth/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from '../app/AdminApp.js';
import { HttpAdminClient } from '../client/http-client.js';
import { EDITOR_CONFIG_ID, parseEditorConfig } from './config.js';

const config = parseEditorConfig(document.getElementById(EDITOR_CONFIG_ID)?.textContent);
document.title = config.siteName;

// The editor follows the person's light or dark setting, and changes with it.
const dark = matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', dark.matches);
dark.addEventListener('change', applyTheme);
applyTheme();

const client = new HttpAdminClient({
  baseUrl: config.apiPath,
  auth: createAuthClient({ basePath: config.authPath, adminPath: config.adminPath }),
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AdminApp client={client} siteName={config.siteName} basePath={config.adminPath} />
  </StrictMode>,
);
