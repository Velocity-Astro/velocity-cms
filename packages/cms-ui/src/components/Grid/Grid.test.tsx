import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Grid } from './Grid.js';

it('lays its children out in two columns with a gap by default', () => {
  render(<Grid>Inside</Grid>);
  for (const name of ['grid', 'grid-cols-2', 'gap-4']) expect(screen.getByText('Inside').className).toContain(name);
});

it('takes its columns and gap from the scales, and can be a list', () => {
  render(
    <Grid as="ul" columns={3} gap={2}>
      <li>One</li>
    </Grid>,
  );
  const list = screen.getByRole('list');
  for (const name of ['grid-cols-3', 'gap-2']) expect(list.className).toContain(name);
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <Grid as="ul">
      <li>One</li>
    </Grid>,
  );
  await expectAccessible(container);
});
