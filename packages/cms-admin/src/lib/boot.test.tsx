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

it('keeps the mark up while the first screen\'s content is on its way, so the editor opens finished', () => {
  boot.bootDrawn();
  const content = boot.holdBootForScreen();
  vi.advanceTimersByTime(1000);
  expect(mark()?.dataset['ending']).toBeUndefined();
  content();
  vi.advanceTimersByTime(0);
  expect(mark()?.dataset['ending']).toBe('true');
});

it('shows the screen with its shapes when its content is slow, rather than keep the mark up', () => {
  boot.bootDrawn();
  boot.holdBootForScreen();
  vi.advanceTimersByTime(0);
  vi.advanceTimersByTime(boot.SCREEN_WAIT_MS - 1);
  expect(mark()?.dataset['ending']).toBeUndefined();
  vi.advanceTimersByTime(1);
  expect(mark()?.dataset['ending']).toBe('true');
});

it('lets the frame keep the mark up for as long as it needs, whatever a screen waits for', () => {
  const frame = boot.holdBoot();
  boot.holdBootForScreen();
  boot.bootDrawn();
  vi.advanceTimersByTime(boot.SCREEN_WAIT_MS * 3);
  expect(mark()?.dataset['ending']).toBeUndefined();
  frame();
  vi.advanceTimersByTime(boot.SCREEN_WAIT_MS);
  expect(mark()?.dataset['ending']).toBe('true');
});

it('holds nothing once the mark has gone', () => {
  boot.bootDrawn();
  vi.advanceTimersByTime(300);
  expect(mark()).toBeNull();
  const late = document.createElement('div');
  late.id = 'cms-boot';
  document.body.append(late);
  boot.holdBootForScreen()();
  vi.advanceTimersByTime(5000);
  expect(mark()?.dataset['ending']).toBeUndefined();
});
