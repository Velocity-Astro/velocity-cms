import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Card } from './Card.js';

it('is a region named by its title, which is a level 2 heading', () => {
  render(
    <Card title="Address" description="Shown on the listing.">
      <p>6214 Lakeshore Drive</p>
    </Card>,
  );
  const card = within(screen.getByRole('region', { name: 'Address' }));
  expect(card.getByRole('heading', { level: 2, name: 'Address' })).toBeTruthy();
  expect(card.getByText('Shown on the listing.')).toBeTruthy();
  expect(card.getByText('6214 Lakeshore Drive')).toBeTruthy();
});

it('shows only what it holds when it has no title', () => {
  render(
    <Card>
      <p>6214 Lakeshore Drive</p>
    </Card>,
  );
  expect(screen.queryByRole('heading')).toBeNull();
  expect(screen.getByText('6214 Lakeshore Drive')).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <Card title="Address">
      <p>6214 Lakeshore Drive</p>
    </Card>,
  );
  await expectAccessible(container);
});
