/**
 * Opens every story of the built Storybook in a real browser, in light and in dark, and fails on
 * any WCAG 2.1 A or AA violation, including colour contrast, which needs the real styles.
 *
 *   pnpm --filter @velocity/cms-ui check:stories     (builds Storybook first)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'storybook-static');
const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const server = createServer(async (request, response) => {
  const file = path.join(site, decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  try {
    if (!file.startsWith(site)) throw new Error('outside');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const index = JSON.parse(await readFile(path.join(site, 'index.json'), 'utf8'));
const stories = Object.values(index.entries).filter((entry) => entry.type === 'story');
const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];

for (const story of stories) {
  for (const theme of ['light', 'dark']) {
    await page.goto(`${origin}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`);
    await page.waitForFunction(() => document.querySelector('#storybook-root')?.childElementCount > 0);
    await page.waitForFunction((dark) => document.documentElement.classList.contains('dark') === dark, theme === 'dark');
    // A story tagged `overlay` opens something (a dialog, a list, a tooltip) and is checked once that has appeared.
    if (story.tags?.includes('overlay')) await page.waitForSelector('[role=dialog], [role=alertdialog], [role=listbox], [role=menu], [role=tooltip]', { timeout: 10_000 }).catch(() => {
      throw new Error(`${story.title} / ${story.name} (${theme}) is tagged overlay, but nothing opened.`);
    });
    // Colours on their way from one theme to the other, or a part still fading in, are not what
    // people read: wait for whatever is moving to arrive (a spinner that never ends is left alone).
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      // The whole page, because dialogs and lists are drawn outside the story's own element.
      // Storybook's own accessibility panel runs axe on the same page; wait for it to finish.
      const run = async (attempt = 0) => {
        try {
          return await globalThis.axe.run(document.body, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          });
        } catch (error) {
          if (attempt > 50 || !String(error).includes('already running')) throw error;
          await new Promise((resolve) => setTimeout(resolve, 100));
          return run(attempt + 1);
        }
      };
      const results = await run();
      return results.violations.map((violation) => ({
        id: violation.id,
        help: violation.help,
        nodes: violation.nodes.map((node) => `${node.html}\n      ${node.failureSummary?.split('\n').slice(1).join(' ').trim() ?? ''}`),
      }));
    });
    for (const violation of violations) failures.push({ story: `${story.title} / ${story.name}`, theme, ...violation });
  }
}

await browser.close();
server.close();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`✗ ${failure.story} (${failure.theme})\n  ${failure.id}: ${failure.help}\n    ${failure.nodes.join('\n    ')}\n`);
  }
  console.error(`${failures.length} accessibility ${failures.length === 1 ? 'violation' : 'violations'} in ${stories.length} stories.`);
  process.exit(1);
}
console.log(`Stories: ${stories.length} stories pass WCAG 2.1 AA in light and dark.`);
