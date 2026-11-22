import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Avatar, initialsOf } from './Avatar.js';

const photo = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

it('shows the first letters of up to two names while there is no photo', () => {
  const { container } = render(<Avatar name="Maya  Ellison Park" />);
  expect(container.textContent).toBe('ME');
  expect(initialsOf('ángel')).toBe('Á');
});

it('shows the photo as decoration, hidden from screen readers', () => {
  const { container } = render(<Avatar name="Maya Ellison" src={photo} />);
  expect(container.querySelector('img')?.getAttribute('src')).toBe(photo);
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
});

it('has nothing to do with a keyboard or a pointer', () => {
  const { container } = render(<Avatar name="Maya Ellison" />);
  expect(container.querySelector('[tabindex], button, a')).toBeNull();
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <>
      <Avatar name="Maya Ellison" />
      <Avatar name="Maya Ellison" src={photo} size="lg" />
    </>,
  );
  await expectAccessible(container);
});
