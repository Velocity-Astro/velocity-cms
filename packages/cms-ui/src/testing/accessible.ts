import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Fails the test when the rendered markup breaks a WCAG 2.1 A or AA rule.
 * Colour contrast is checked in Storybook instead, where real styles are loaded, and the
 * landmark rule is off because a component on its own is not a whole page. What a frame holds is
 * another page, checked where it is made: the frame itself must still have a name.
 */
export async function expectAccessible(container: Element): Promise<void> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    iframes: false,
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}
