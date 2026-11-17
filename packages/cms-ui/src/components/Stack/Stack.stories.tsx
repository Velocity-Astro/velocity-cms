import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '../Box/index.js';
import { Text } from '../Text/index.js';
import { Stack } from './Stack.js';

const items = ['First', 'Second', 'Third'].map((name) => (
  <Box key={name} surface="subtle" radius="md" padding={3}>
    <Text>{name}</Text>
  </Box>
));

const meta = {
  title: 'Components/Layout/Stack',
  component: Stack,
  args: { children: items },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Tight: Story = { args: { gap: 1 } };
export const Loose: Story = { args: { gap: 8 } };
export const Centered: Story = { args: { align: 'center' } };
