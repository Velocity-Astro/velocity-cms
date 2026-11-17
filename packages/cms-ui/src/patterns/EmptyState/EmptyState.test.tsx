import { render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { expect, it } from 'vitest';
import { Button } from '../../components/Button/index.js';
import { expectAccessible } from '../../testing/accessible.js';
import { EmptyState } from './EmptyState.js';

it('says what is missing in a heading, level 2 unless told otherwise', () => {
  const { rerender } = render(<EmptyState title="No listings yet" />);
  expect(screen.getByRole('heading', { level: 2, name: 'No listings yet' })).toBeTruthy();
  rerender(<EmptyState title="No listings yet" level={3} />);
  expect(screen.getByRole('heading', { level: 3 })).toBeTruthy();
});

it('shows its description and the next thing to do, and hides its icon from screen readers', () => {
  const { container } = render(
    <EmptyState icon={House} title="No listings yet" description="They appear on the site." action={<Button>New listing</Button>} />,
  );
  expect(screen.getByText('They appear on the site.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'New listing' })).toBeTruthy();
  expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
});

it('has no accessibility violations', async () => {
  const { container } = render(<EmptyState icon={House} title="No listings yet" action={<Button>New listing</Button>} />);
  await expectAccessible(container);
});
