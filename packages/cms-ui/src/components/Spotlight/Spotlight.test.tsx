import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { TextField } from '../TextField/index.js';
import { Spotlight } from './Spotlight.js';

const example = (at?: number) => (
  <Spotlight at={at}>
    <TextField label="Title" />
  </Spotlight>
);
const holder = () => screen.getByRole('textbox', { name: 'Title' }).closest('[data-lit]');

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('shows what it holds and does nothing until it is pointed at', () => {
  const scroll = (Element.prototype.scrollIntoView = vi.fn());
  render(example());
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeTruthy();
  expect(holder()).toBeNull();
  expect(scroll).not.toHaveBeenCalled();
});

it('brings what it holds into view and marks it for a moment, each time it is pointed at', () => {
  vi.useFakeTimers();
  const scroll = (Element.prototype.scrollIntoView = vi.fn());
  const { rerender } = render(example());
  rerender(example(1));
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  expect(holder()).not.toBeNull();
  act(() => void vi.advanceTimersByTime(2000));
  expect(holder()).toBeNull();
  rerender(example(2));
  expect(scroll).toHaveBeenCalledTimes(2);
  expect(holder()).not.toBeNull();
});

it('is no longer marked once something else is pointed at', () => {
  Element.prototype.scrollIntoView = vi.fn();
  const { rerender } = render(example(1));
  expect(holder()).not.toBeNull();
  rerender(example(undefined));
  expect(holder()).toBeNull();
});

it('moves no focus', () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(example(1));
  expect(document.activeElement).toBe(document.body);
});

it('is accessible', async () => {
  const { container } = render(example(1));
  await expectAccessible(container);
});
