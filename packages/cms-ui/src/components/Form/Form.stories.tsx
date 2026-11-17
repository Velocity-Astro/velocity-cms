import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/index.js';
import { TextField } from '../TextField/index.js';
import { Form } from './Form.js';

const meta = {
  title: 'Components/Forms/Form',
  component: Form,
  args: {
    onSubmit: () => undefined,
    children: (
      <>
        <TextField label="Email" type="email" width="md" isRequired />
        <Button type="submit">Email me a sign-in link</Button>
      </>
    ),
  },
} satisfies Meta<typeof Form>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loose: Story = { args: { gap: 8 } };
