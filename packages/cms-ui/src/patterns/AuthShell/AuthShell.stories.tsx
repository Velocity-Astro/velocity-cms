import type { Meta, StoryObj } from '@storybook/react-vite';
import { KeyRound } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { Form } from '../../components/Form/index.js';
import { Text } from '../../components/Text/index.js';
import { TextField } from '../../components/TextField/index.js';
import { AuthShell } from './AuthShell.js';

const meta = {
  title: 'Patterns/Page/AuthShell',
  component: AuthShell,
  parameters: { layout: 'fullscreen' },
  args: {
    brand: <Text weight="semibold">Lakeshore Realty</Text>,
    title: 'Sign in',
    description: 'Use a passkey, or get a sign-in link by email.',
    children: (
      <Form onSubmit={() => undefined}>
        <TextField label="Email" type="email" isRequired />
        <Button type="submit" fullWidth>
          Email me a sign-in link
        </Button>
        <Button variant="secondary" icon={KeyRound} fullWidth>
          Sign in with a passkey
        </Button>
      </Form>
    ),
  },
} satisfies Meta<typeof AuthShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};
export const WithFooter: Story = {
  args: {
    footer: (
      <Text size="sm" tone="muted">
        No password needed.
      </Text>
    ),
  },
};
