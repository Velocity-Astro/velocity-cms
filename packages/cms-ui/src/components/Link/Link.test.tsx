import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Link } from './Link.js';

it('is a link named by its words, pointing at its address', () => {
  render(<Link href="/admin/listings/42">Edit listing</Link>);
  expect(screen.getByRole('link', { name: 'Edit listing' }).getAttribute('href')).toBe('/admin/listings/42');
});

it('opens another site safely in a new tab', () => {
  render(
    <Link href="https://example.com" opensInNewTab>
      View on site
    </Link>,
  );
  const link = screen.getByRole('link');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
});

it('can be reached with the keyboard, unless disabled', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Link href="/a">First</Link>);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('link'));
  rerender(
    <Link href="/a" isDisabled>
      First
    </Link>,
  );
  expect(screen.getByRole('link').getAttribute('aria-disabled')).toBe('true');
});

it('has no accessibility violations', async () => {
  const { container } = render(<Link href="/a">Edit listing</Link>);
  await expectAccessible(container);
});
