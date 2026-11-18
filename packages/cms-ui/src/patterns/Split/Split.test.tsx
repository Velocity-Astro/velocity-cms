import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Split } from './Split.js';

const example = (
  <Split asideLabel="Publishing" aside={<p>On the site</p>}>
    <p>Overview</p>
  </Split>
);

it('puts the side column in a landmark named by its label, after the main column', () => {
  render(example);
  const aside = screen.getByRole('complementary', { name: 'Publishing' });
  expect(within(aside).getByText('On the site')).toBeTruthy();
  expect(screen.getByText('Overview').compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(example);
  await expectAccessible(container);
});
