import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Button } from '../Button/index.js';
import { TextField } from '../TextField/index.js';
import { Form } from './Form.js';

const example = (onSubmit: () => void) => (
  <Form onSubmit={onSubmit} label="Sign in">
    <TextField label="Email" />
    <Button type="submit">Send</Button>
  </Form>
);

it('is a named form that is sent by its submit button', async () => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(example(onSubmit));
  expect(screen.getByRole('form', { name: 'Sign in' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Send' }));
  expect(onSubmit).toHaveBeenCalledOnce();
});

it('is sent by Enter in a field', async () => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(example(onSubmit));
  await user.type(screen.getByRole('textbox'), 'dana@example.com{Enter}');
  expect(onSubmit).toHaveBeenCalledOnce();
});

it('has no accessibility violations', async () => {
  const { container } = render(example(() => undefined));
  await expectAccessible(container);
});
