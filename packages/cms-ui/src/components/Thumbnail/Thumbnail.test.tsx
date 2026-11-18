import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Thumbnail } from './Thumbnail.js';

const picture = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

it('shows the picture as decoration, with no name of its own', () => {
  const { container } = render(<Thumbnail src={picture} />);
  const image = container.querySelector('img');
  expect(image?.getAttribute('src')).toBe(picture);
  expect(image?.getAttribute('alt')).toBe('');
});

it('keeps its place with an empty frame when there is no picture', () => {
  const { container } = render(<Thumbnail />);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
});

it('has nothing to do with a keyboard or a pointer', () => {
  const { container } = render(<Thumbnail src={picture} />);
  expect(container.querySelector('[tabindex], button, a')).toBeNull();
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <>
      <Thumbnail src={picture} />
      <Thumbnail />
    </>,
  );
  await expectAccessible(container);
});
