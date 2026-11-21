import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Table, type TableColumn } from './Table.js';

const columns: TableColumn[] = [
  { id: 'title', label: 'Title', isSortable: true },
  { id: 'price', label: 'Price', align: 'end' },
];
const rows = [
  { id: 'a', cells: { title: 'Alder Court', price: '$412,500' } },
  { id: 'b', cells: { title: 'Lakeshore Drive', price: '$845,000' } },
];

it('is a named table whose first column names each row', () => {
  render(<Table label="Listings" columns={columns} rows={rows} />);
  const table = screen.getByRole('grid', { name: 'Listings' });
  expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Title', 'Price']);
  expect(within(table).getAllByRole('rowheader').map((header) => header.textContent)).toEqual(['Alder Court', 'Lakeshore Drive']);
  expect(within(table).getByText('$845,000').className).toContain('text-right');
});

it('opens a row on a press and on Enter', async () => {
  const onRowAction = vi.fn();
  const user = userEvent.setup();
  render(<Table label="Listings" columns={columns} rows={rows} onRowAction={onRowAction} />);
  await user.click(screen.getByText('Lakeshore Drive'));
  expect(onRowAction).toHaveBeenLastCalledWith('b');
  await user.keyboard('{ArrowUp}{Enter}');
  expect(onRowAction).toHaveBeenLastCalledWith('a');
});

it('shows how it is sorted and asks for a new sort when a heading is pressed', async () => {
  const onSortChange = vi.fn();
  const user = userEvent.setup();
  render(<Table label="Listings" columns={columns} rows={rows} sort={{ column: 'title', direction: 'ascending' }} onSortChange={onSortChange} />);
  const heading = screen.getByRole('columnheader', { name: 'Title' });
  expect(heading.getAttribute('aria-sort')).toBe('ascending');
  await user.click(heading);
  expect(onSortChange).toHaveBeenCalledWith({ column: 'title', direction: 'descending' });
});

it('shows its empty message when there are no rows', () => {
  render(<Table label="Listings" columns={columns} rows={[]} empty="No listings yet." />);
  expect(screen.getByText('No listings yet.')).toBeTruthy();
});

it('draws no frame of its own inside a card that frames it', () => {
  const { container, rerender } = render(<Table label="Listings" columns={columns} rows={rows} />);
  expect(container.firstElementChild?.getAttribute('class')).toContain('border');
  rerender(<Table label="Listings" columns={columns} rows={rows} frame="none" />);
  expect(container.firstElementChild?.getAttribute('class')).not.toContain('border');
});

it('leaves a secondary column out of a narrow window, never the one that names the rows', () => {
  render(
    <Table
      label="Listings"
      columns={[{ id: 'title', label: 'Title', isSecondary: true }, { id: 'price', label: 'Price', isSecondary: true }]}
      rows={rows}
    />,
  );
  expect(screen.getByRole('columnheader', { name: 'Price' }).className).toContain('hidden md:table-cell');
  expect(screen.getByText('$845,000').className).toContain('hidden md:table-cell');
  expect(screen.getByRole('columnheader', { name: 'Title' }).className).not.toContain('hidden');
});

it('has no accessibility violations', async () => {
  const { container } = render(<Table label="Listings" columns={columns} rows={rows} />);
  await expectAccessible(container);
});
