import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type * as Boot from './boot.js';

let boot: typeof Boot;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  boot = await import('./boot.js');
  const mark = document.createElement('div');
  mark.id = 'cms-boot';
  document.body.append(mark);
});

afterEach(() => {
  document.getElementById('cms-boot')?.remove();
  vi.useRealTimers();
});

const mark = () => document.getElementById('cms-boot');

it('fades the page\'s mark once the editor has drawn, and then takes it away', () => {
  boot.bootDrawn();
  vi.advanceTimersByTime(0);
  expect(mark()?.dataset['ending']).toBe('true');
  vi.advanceTimersByTime(300);
  expect(mark()).toBeNull();
});

it('keeps the mark up while a screen is still finding out what to show', () => {
  const letGo = boot.holdBoot();
  boot.bootDrawn();
  vi.advanceTimersByTime(1000);
  expect(mark()?.dataset['ending']).toBeUndefined();
  letGo();
  vi.advanceTimersByTime(0);
  expect(mark()?.dataset['ending']).toBe('true');
});

it('waits for a screen that takes over from another at once', () => {
  boot.bootDrawn();
  const first = boot.holdBoot();
  first();
  // The next screen holds it before the first one's letting go is looked at.
  const second = boot.holdBoot();
  vi.advanceTimersByTime(0);
  expect(mark()?.dataset['ending']).toBeUndefined();
  second();
  second();
  vi.advanceTimersByTime(0);
  expect(mark()?.dataset['ending']).toBe('true');
});
