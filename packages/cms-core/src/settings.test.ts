import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError, createCms, senderFrom, storageEndpointFrom, type Actor } from './index.js';
import { InMemoryEntryRepository, InMemorySchemaRepository, InMemorySettingsStore } from './testing/index.js';

const owner: Actor = { kind: 'user', id: 'u1', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'u2', role: 'editor' };
const SECRET = 's'.repeat(32);

const site = (secret: string | null = SECRET, settings = new InMemorySettingsStore()) =>
  createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), settings, ...(secret !== null && { secret }) });

describe('SettingsService: email', () => {
  it('reads a sender as an address or a name with one', () => {
    expect(senderFrom(' hello@example.com ')).toBe('hello@example.com');
    expect(senderFrom('Lakeshore Realty  <hello@example.com>')).toBe('Lakeshore Realty <hello@example.com>');
    for (const wrong of ['', 'hello', 'hello@example', '<hello@example.com>', 'A <b@c.d> <e@f.g>', 'A\n<b@c.dd>', 'a b@example.com']) expect(senderFrom(wrong)).toBeNull();
  });

  it('seals the key before it is kept, and only the site itself can open it', async () => {
    const store = new InMemorySettingsStore();
    const cms = site(SECRET, store);
    const saved = await cms.settings.saveEmail(owner, { from: 'hello@example.com', apiKey: ' re_live_123 ', expectedRevision: 0 });
    expect(saved).toEqual({ provider: 'resend', from: 'hello@example.com', hasKey: true, sending: true, canTest: false, revision: 1 });
    expect(JSON.stringify(await store.get('email'))).not.toContain('re_live_123');
    expect(await cms.settings.mailAccount()).toEqual({ provider: 'resend', apiKey: 're_live_123', from: 'hello@example.com' });
    // Another secret opens nothing: the key is asked for again rather than sent wrong.
    const moved = site('t'.repeat(32), store);
    expect(await moved.settings.mailAccount()).toBeNull();
    expect(await moved.settings.email(owner)).toMatchObject({ hasKey: false, sending: false, from: 'hello@example.com' });
  });

  it('keeps the saved key when none is sent, and takes it away when asked', async () => {
    const cms = site();
    await cms.settings.saveEmail(owner, { from: 'hello@example.com', apiKey: 're_1', expectedRevision: 0 });
    expect(await cms.settings.saveEmail(owner, { from: 'team@example.com', expectedRevision: 1 })).toMatchObject({ from: 'team@example.com', hasKey: true, revision: 2 });
    expect((await cms.settings.mailAccount())?.apiKey).toBe('re_1');
    expect(await cms.settings.saveEmail(owner, { from: 'team@example.com', apiKey: null, expectedRevision: 2 })).toMatchObject({ hasKey: false, sending: false });
    expect(await cms.settings.mailAccount()).toBeNull();
  });

  it('refuses what it cannot use, naming the field, and a save from an old revision', async () => {
    const cms = site();
    await expect(cms.settings.saveEmail(owner, { from: 'nobody', apiKey: 'two words', expectedRevision: 0 })).rejects.toMatchObject({ issues: [{ path: ['from'] }, { path: ['apiKey'] }] });
    await expect(cms.settings.saveEmail(owner, { from: 'a@b.co', apiKey: ' ', expectedRevision: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(cms.settings.saveEmail(owner, { from: 'a@b.co', expectedRevision: 3 })).rejects.toBeInstanceOf(ConflictError);
    expect((await cms.settings.email(owner)).revision).toBe(0);
  });

  it('cannot save a key on a site with no secret to seal it with', async () => {
    const cms = site(null);
    await expect(cms.settings.saveEmail(owner, { from: 'a@b.co', apiKey: 're_1', expectedRevision: 0 })).rejects.toThrow(/VELOCITY_CMS_SECRET/);
    expect(await cms.settings.email(owner)).toMatchObject({ hasKey: false, revision: 0 });
  });

  it('is for owners, and announces a save without the key', async () => {
    const cms = site();
    const heard: unknown[] = [];
    cms.events.on('settings.saved', (event) => void heard.push(event));
    await expect(cms.settings.email(editor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.settings.saveEmail(editor, { from: 'a@b.co', expectedRevision: 0 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.settings.testEmail(editor)).rejects.toBeInstanceOf(ForbiddenError);
    await cms.settings.saveEmail(owner, { from: 'a@b.co', apiKey: 're_1', expectedRevision: 0 });
    expect(heard).toEqual([{ area: 'email', actor: owner }]);
  });

  it('says who else decides how email is sent, and sends a test only when the host can', async () => {
    const cms = site();
    await expect(cms.settings.testEmail(owner)).rejects.toBeInstanceOf(ConflictError);
    const tested: string[] = [];
    let fixed: 'server' | null = 'server';
    cms.settings.useMail({ fixedBy: () => fixed, canTest: async () => true, sendTest: async (actor) => void tested.push(actor.id) });
    expect(await cms.settings.email(owner)).toEqual({ provider: 'resend', from: '', hasKey: false, fixedBy: 'server', sending: true, canTest: true, revision: 0 });
    await cms.settings.testEmail(owner);
    expect(tested).toEqual(['u1']);
    fixed = null;
    expect(await cms.settings.email(owner)).toMatchObject({ sending: false });
    expect(await cms.settings.email(owner)).not.toHaveProperty('fixedBy');
  });
});

describe('SettingsService: storage', () => {
  const bucket = { endpoint: 'https://acct.r2.example.com/', bucket: 'photos', region: 'EU-West-1', accessKeyId: 'AKIA123', secretAccessKey: 'shh-secret', expectedRevision: 0 };

  it('takes a storage service\'s address only over https, by name, with nothing that could lead elsewhere', () => {
    expect(storageEndpointFrom(' https://ACCT.r2.example.com/ ')).toBe('https://acct.r2.example.com');
    expect(storageEndpointFrom('https://s3.eu-west-1.amazonaws.com')).toBe('https://s3.eu-west-1.amazonaws.com');
    for (const wrong of ['', 'acct.r2.example.com', 'http://acct.r2.example.com', 'https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://storage', 'https://minio.internal', 'https://printer.local', 'https://user:pass@acct.example.com', 'https://acct.example.com:9000', 'https://acct.example.com/?x=1', 'https://2130706433']) {
      expect(storageEndpointFrom(wrong), wrong).toBeNull();
    }
  });

  it('seals the secret key, shows the rest, and hands the whole only to the site itself', async () => {
    const store = new InMemorySettingsStore();
    const cms = site(SECRET, store);
    expect(await cms.settings.storage(owner)).toEqual({ endpoint: '', bucket: '', region: '', accessKeyId: '', hasSecret: false, keeping: 'none', revision: 0 });
    expect(await cms.settings.saveStorage(owner, bucket)).toEqual({ endpoint: 'https://acct.r2.example.com', bucket: 'photos', region: 'eu-west-1', accessKeyId: 'AKIA123', hasSecret: true, keeping: 'bucket', revision: 1 });
    expect(JSON.stringify(await store.get('storage'))).not.toContain('shh-secret');
    expect(await cms.settings.bucketAccount()).toEqual({ endpoint: 'https://acct.r2.example.com', bucket: 'photos', region: 'eu-west-1', accessKeyId: 'AKIA123', secretAccessKey: 'shh-secret' });
    expect(await cms.settings.saveStorage(owner, { endpoint: bucket.endpoint, bucket: bucket.bucket, region: '', accessKeyId: bucket.accessKeyId, expectedRevision: 1 })).toMatchObject({ region: '', hasSecret: true, revision: 2 });
    expect(await cms.settings.bucketAccount()).not.toHaveProperty('region');
    expect(await site('t'.repeat(32), store).settings.bucketAccount()).toBeNull();
    expect(await cms.settings.saveStorage(owner, { ...bucket, secretAccessKey: null, expectedRevision: 2 })).toMatchObject({ hasSecret: false, keeping: 'none' });
    expect(await cms.settings.bucketAccount()).toBeNull();
    // Email is another part: it knows nothing of this.
    expect((await cms.settings.email(owner)).revision).toBe(0);
  });

  it('refuses what it cannot use, naming each field, and is for owners', async () => {
    const cms = site();
    await expect(cms.settings.saveStorage(owner, { endpoint: 'http://x', bucket: 'My Bucket', region: 'eu west', accessKeyId: ' ', secretAccessKey: ' ', expectedRevision: 0 })).rejects.toMatchObject({
      issues: [{ path: ['endpoint'] }, { path: ['bucket'] }, { path: ['region'] }, { path: ['accessKeyId'] }, { path: ['secretAccessKey'] }],
    });
    await expect(cms.settings.saveStorage(owner, { ...bucket, expectedRevision: 2 })).rejects.toBeInstanceOf(ConflictError);
    await expect(cms.settings.storage(editor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.settings.saveStorage(editor, bucket)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.settings.testStorage(editor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.settings.testStorage(owner)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('SettingsService: forms', () => {
  const keys = { siteKey: '0x4AAAAAAAsitekey', secretKey: '0x4AAAAAAAsecretkey', postsPerAddress: 8, expectedRevision: 0 };

  it('asks for no challenge and takes eight posts from an address until an owner says otherwise', async () => {
    const cms = site();
    expect(await cms.settings.forms(owner)).toEqual({ provider: 'turnstile', siteKey: '', hasSecret: false, checking: false, postsPerAddress: 8, revision: 0 });
    expect(await cms.settings.challengeAccount()).toBeNull();
    expect(await cms.settings.challengeSiteKey()).toBeNull();
    expect(await cms.settings.formPostsPerAddress()).toBe(8);
  });

  it('seals the secret key, opens it only for the server, and never shows it again', async () => {
    const store = new InMemorySettingsStore();
    const cms = site(SECRET, store);
    const saved = await cms.settings.saveForms(owner, { ...keys, siteKey: ` ${keys.siteKey} ` });
    expect(saved).toEqual({ provider: 'turnstile', siteKey: keys.siteKey, hasSecret: true, checking: true, postsPerAddress: 8, revision: 1 });
    expect(JSON.stringify(saved)).not.toContain('secretkey');
    expect(JSON.stringify(await store.get('forms'))).not.toContain('secretkey');
    expect(await cms.settings.challengeAccount()).toEqual({ provider: 'turnstile', siteKey: keys.siteKey, secretKey: keys.secretKey });
    expect(await cms.settings.challengeSiteKey()).toBe(keys.siteKey);
    // A change of the limit leaves both keys as they are.
    expect(await cms.settings.saveForms(owner, { siteKey: keys.siteKey, postsPerAddress: 30, expectedRevision: 1 })).toMatchObject({ checking: true, postsPerAddress: 30, revision: 2 });
    expect(await cms.settings.formPostsPerAddress()).toBe(30);
    // A site whose secret changed can no longer open the key: no challenge is asked, rather than every post marked.
    expect(await site('t'.repeat(32), store).settings.challengeSiteKey()).toBeNull();
    expect(await cms.settings.saveForms(owner, { siteKey: '', secretKey: null, postsPerAddress: 30, expectedRevision: 2 })).toMatchObject({ siteKey: '', hasSecret: false, checking: false });
    expect(await cms.settings.challengeAccount()).toBeNull();
  });

  it('refuses keys that are not keys, a secret key with no site key, a limit out of range and a stale revision', async () => {
    const cms = site();
    const refused = async (changes: Partial<typeof keys>) => {
      const error: unknown = await cms.settings.saveForms(owner, { ...keys, ...changes }).catch((thrown: unknown) => thrown);
      return error instanceof ValidationError ? error.issues.map((issue) => issue.path[0]) : error;
    };
    expect(await refused({ siteKey: 'a key"><script>' })).toEqual(['siteKey']);
    expect(await refused({ secretKey: 'two words' })).toEqual(['secretKey']);
    expect(await refused({ secretKey: '' })).toEqual(['secretKey']);
    expect(await refused({ siteKey: '' })).toEqual(['siteKey']);
    for (const postsPerAddress of [0, 101, 2.5]) expect(await refused({ postsPerAddress })).toEqual(['postsPerAddress']);
    await expect(cms.settings.saveForms(owner, { ...keys, expectedRevision: 3 })).rejects.toBeInstanceOf(ConflictError);
    // A site key alone is kept, and checks nothing until the secret key is there.
    expect(await cms.settings.saveForms(owner, { siteKey: keys.siteKey, postsPerAddress: 8, expectedRevision: 0 })).toMatchObject({ siteKey: keys.siteKey, checking: false });
    expect(await cms.settings.challengeSiteKey()).toBeNull();
  });

  it('checks the keys only once both are saved, through the host, and is for owners only', async () => {
    const cms = site();
    const asked: string[] = [];
    cms.settings.useChallenge({ test: async () => void asked.push('test') });
    await expect(cms.settings.testForms(owner)).rejects.toBeInstanceOf(ConflictError);
    await cms.settings.saveForms(owner, keys);
    await cms.settings.testForms(owner);
    expect(asked).toEqual(['test']);
    await expect(cms.settings.forms(editor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.settings.saveForms(editor, { ...keys, expectedRevision: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cms.settings.testForms(editor)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
