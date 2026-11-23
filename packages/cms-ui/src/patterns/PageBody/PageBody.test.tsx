import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { PageBody } from './PageBody.js';

it('draws what it holds inside the gutter, in the width it is given', () => {
  const { container } = render(
    <PageBody width="narrow">
      <p>Your details</p>
    </PageBody>,
  );
  const inner = screen.getByText('Your details').parentElement;
  expect(inner?.className).toContain('max-w-4xl');
  expect(container.firstElementChild?.className).toContain('px-4');
});

it('is wide unless told otherwise, and leaves the gutter to the area around it when inset', () => {
  const { container } = render(
    <PageBody isInset>
      <p>Listings</p>
    </PageBody>,
  );
  expect(container.firstElementChild?.className).toContain('max-w-7xl');
  expect(container.firstElementChild?.className).not.toContain('px-4');
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <PageBody>
      <p>Listings</p>
    </PageBody>,
  );
  await expectAccessible(container);
});
