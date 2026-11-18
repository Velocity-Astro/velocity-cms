import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Skeleton, SkeletonGroup } from './Skeleton.js';

it('is skipped by screen readers', () => {
  const { container } = render(<Skeleton />);
  expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
});

it('takes the shape and width it is given', () => {
  const { container } = render(<Skeleton shape="title" width="1/3" />);
  expect(container.firstElementChild?.className).toContain('h-8');
  expect(container.firstElementChild?.className).toContain('w-1/3');
});

it('says once what a group of shapes stands for', () => {
  render(
    <SkeletonGroup label="Loading listings">
      <Skeleton />
      <Skeleton width="1/2" />
    </SkeletonGroup>,
  );
  expect(screen.getByRole('status').textContent).toBe('Loading listings');
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <SkeletonGroup label="Loading listings">
      <Skeleton />
    </SkeletonGroup>,
  );
  await expectAccessible(container);
});
