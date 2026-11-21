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

it('shows what stands beside the title and what can be done with the card', () => {
  render(
    <Card title="SEO" description="Titles for search engines." actions={<span>Active</span>} footer={<button type="button">Settings</button>}>
      <p>Version 1.1.0</p>
    </Card>,
  );
  const card = within(screen.getByRole('region', { name: 'SEO' }));
  expect(card.getByText('Active')).toBeTruthy();
  expect(card.getByRole('button', { name: 'Settings' })).toBeTruthy();
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

it('runs what it holds to its edges when flush, for a table or a list of rows', () => {
  const { container, rerender } = render(<Card title="Recent changes">Rows</Card>);
  const body = () => container.querySelector('section > div:last-child')?.getAttribute('class') ?? '';
  expect(body()).toContain('p-6');
  rerender(
    <Card title="Recent changes" isFlush>
      Rows
    </Card>,
  );
  expect(body()).not.toContain('p-6');
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <Card title="Address">
      <p>6214 Lakeshore Drive</p>
    </Card>,
  );
  await expectAccessible(container);
});
