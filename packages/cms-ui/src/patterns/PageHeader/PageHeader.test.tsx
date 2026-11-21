import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FileUp, Plus } from 'lucide-react';
import { expect, it, vi } from 'vitest';
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

it('offers the other actions as buttons from md up, and as one menu on a phone', async () => {
  const importing = vi.fn();
  const user = userEvent.setup();
  render(
    <PageHeader
      title="Contacts"
      secondary={{ moreLabel: 'More actions', actions: [{ id: 'import', label: 'Import', icon: FileUp, onPress: importing }] }}
      actions={<Button icon={Plus} collapses>New contact</Button>}
    />,
  );
  const header = within(screen.getByRole('banner'));
  await user.click(header.getByRole('button', { name: 'Import' }));
  expect(importing).toHaveBeenCalledTimes(1);
  await user.click(header.getByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Import' }));
  expect(importing).toHaveBeenCalledTimes(2);
  // The main button is its icon alone on a phone, and still says what it does.
  expect(header.getByRole('button', { name: 'New contact' })).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(<PageHeader title="Listings" description="Every property." actions={<Button>New listing</Button>} />);
  await expectAccessible(container);
});
