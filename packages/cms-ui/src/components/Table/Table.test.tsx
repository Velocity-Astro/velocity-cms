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

it('chooses a row on a press and opens it on Enter, when rows can be chosen', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  const opened: string[] = [];
  render(
    <Table
      label="Listings"
      columns={[{ id: 'title', label: 'Title' }]}
      rows={[
        { id: 'a', cells: { title: '6214 Lakeshore Drive' } },
        { id: 'b', cells: { title: '18 Alder Court' } },
      ]}
      selectedId="a"
      onSelect={(id) => chosen.push(id)}
      onRowAction={(id) => opened.push(id)}
    />,
  );
  expect(screen.getByRole('row', { name: /6214 Lakeshore Drive/ }).getAttribute('aria-selected')).toBe('true');
  await user.click(screen.getByRole('row', { name: /18 Alder Court/ }));
  expect(chosen).toEqual(['b']);
  expect(opened).toEqual([]);
  await user.keyboard('{Enter}');
  expect(opened).toEqual(['b']);
  await user.dblClick(screen.getByRole('row', { name: /6214 Lakeshore Drive/ }));
  expect(opened).toEqual(['b', 'a']);
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

it('has no accessibility violations', async () => {
  const { container } = render(<Table label="Listings" columns={columns} rows={rows} />);
  await expectAccessible(container);
});
