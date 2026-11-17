import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Button } from '../../components/Button/index.js';
import { expectAccessible } from '../../testing/accessible.js';
import { PageHeader } from './PageHeader.js';

it('gives the screen its level 1 heading and its description', () => {
  render(<PageHeader title="Listings" description="Every property on the site." />);
  expect(screen.getByRole('heading', { level: 1, name: 'Listings' })).toBeTruthy();
  expect(screen.getByText('Every property on the site.')).toBeTruthy();
});

it('holds the screen\'s actions', () => {
  render(<PageHeader title="Listings" actions={<Button>New listing</Button>} />);
  expect(within(screen.getByRole('banner')).getByRole('button', { name: 'New listing' })).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(<PageHeader title="Listings" description="Every property." actions={<Button>New listing</Button>} />);
  await expectAccessible(container);
});
