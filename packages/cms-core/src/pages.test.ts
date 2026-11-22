import { describe, expect, it } from 'vitest';
import { PageHeads, isPageAddress } from './pages.js';

const page = { path: '/', locale: 'en' };

describe('what a rule may put in a page\'s head', () => {
  it('takes a share image, the owner\'s codes and the ids the site is measured with', async () => {
    const heads = new PageHeads();
    heads.add(() => ({ image: 'share.png', verification: { google: 'abc-123', bing: 'B1NG' }, analytics: { googleAnalytics: 'G-ABC1234', tagManager: 'GTM-XYZ12', consent: 'strict', privacyUrl: '/privacy/' } }));
    expect(await heads.run(page, { title: 'Home' })).toEqual({
      title: 'Home',
      image: 'share.png',
      verification: { google: 'abc-123', bing: 'B1NG' },
      analytics: { googleAnalytics: 'G-ABC1234', tagManager: 'GTM-XYZ12', consent: 'strict', privacyUrl: '/privacy/' },
    });
  });

  it('leaves out anything that could become markup or a script', async () => {
    const heads = new PageHeads();
    heads.add(() => ({ image: '"><img src=x>', verification: { google: '"><script>' }, analytics: { googleAnalytics: 'G-1"><script>', tagManager: 'alert(1)', consent: 'always', privacyUrl: 'javascript:alert(1)' } }) as never);
    expect(await heads.run(page, { title: 'Home' })).toEqual({ title: 'Home' });
  });

  it('knows an address a page can hold', () => {
    expect(isPageAddress('/privacy/')).toBe(true);
    expect(isPageAddress('https://example.com/a')).toBe(true);
    expect(isPageAddress('//example.com/')).toBe(false);
    expect(isPageAddress('http://example.com/')).toBe(false);
    expect(isPageAddress('/a b')).toBe(false);
  });
});

describe('moves for an address with no page', () => {
  it('answers with the first fit move, never one to the same address or an unfit one', async () => {
    const heads = new PageHeads();
    heads.add(() => undefined);
    const stop = heads.addRedirect((path) => (path === '/same/' ? { to: '/same', permanent: true } : path === '/bad/' ? { to: 'javascript:x', permanent: true } : undefined));
    heads.addRedirect((path) => (path === '/old/' || path === '/same/' ? { to: '/new/', permanent: false } : undefined));
    expect(await heads.redirect('/old/')).toEqual({ to: '/new/', permanent: false });
    expect(await heads.redirect('/same/')).toEqual({ to: '/new/', permanent: false });
    expect(await heads.redirect('/bad/')).toBeUndefined();
    stop();
    expect(await heads.redirect('/nothing/')).toBeUndefined();
  });
});
