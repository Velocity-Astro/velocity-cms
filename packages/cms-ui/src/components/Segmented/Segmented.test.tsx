import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Segmented } from './Segmented.js';
import { Monitor, Smartphone } from 'lucide-react';

const options = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'drafts', label: 'Drafts' },
];

it('shows which option is chosen, and tells of a new choice', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  render(<Segmented label="Show" options={options} selected="all" onChange={(id) => chosen.push(id)} />);
  expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true');
  await user.click(screen.getByRole('radio', { name: 'Drafts' }));
  expect(chosen).toEqual(['drafts']);
});

it('always keeps one chosen: pressing the chosen one changes nothing', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  render(<Segmented label="Show" options={options} selected="all" onChange={(id) => chosen.push(id)} />);
  await user.click(screen.getByRole('radio', { name: 'All' }));
  expect(chosen).toEqual([]);
});

it('moves between options with the arrow keys', async () => {
  const user = userEvent.setup();
  render(<Segmented label="Show" options={options} selected="all" onChange={() => undefined} />);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'All' }));
  await user.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Published' }));
});

it('shows a sample of a colour beside a choice, and sits in a form with its label and help', async () => {
  const swatches = [
    { id: 'default', label: 'White', swatch: '#ffffff' },
    { id: 'secondary', label: 'Warm stone', swatch: '#f4f1ec' },
  ];
  const { container, rerender } = render(<Segmented label="Background" options={swatches} selected="default" onChange={() => undefined} isLabelShown description="From the template." />);
  expect([...container.querySelectorAll('circle')].map((circle) => circle.getAttribute('fill'))).toEqual(['#ffffff', '#f4f1ec']);
  // The sample adds nothing to the choice's name.
  expect(screen.getByRole('radio', { name: 'Warm stone' })).toBeTruthy();
  expect(screen.getByText('Background')).toBeTruthy();
  expect(screen.getByText('From the template.')).toBeTruthy();
  await expectAccessible(container);
  rerender(<Segmented label="Background" options={swatches} selected="default" onChange={() => undefined} isLabelShown description="From the template." errorMessage="Choose one." />);
  expect(screen.getByText('Choose one.')).toBeTruthy();
  expect(screen.queryByText('From the template.')).toBeNull();
});

it('shows each choice as its icon alone, named for screen readers and in a tooltip', async () => {
  const user = userEvent.setup();
  render(
    <Segmented
      label="Width"
      areLabelsHidden
      selected="full"
      onChange={() => undefined}
      options={[
        { id: 'phone', label: 'Phone', icon: Smartphone },
        { id: 'full', label: 'Desktop', icon: Monitor },
      ]}
    />,
  );
  const phone = screen.getByRole('radio', { name: 'Phone' });
  expect(phone.textContent).toBe('Phone');
  await user.tab();
  expect((await screen.findByRole('tooltip')).textContent).toBe('Phone');
});

it('has no accessibility violations', async () => {
  const { container } = render(<Segmented label="Show" options={options} selected="all" onChange={() => undefined} />);
  await expectAccessible(container);
});
