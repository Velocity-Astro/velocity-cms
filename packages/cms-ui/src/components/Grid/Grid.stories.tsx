import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '../Box/index.js';
import { Text } from '../Text/index.js';
import { Grid } from './Grid.js';

const items = ['First', 'Second', 'Third', 'Fourth'].map((name) => (
  <Box key={name} surface="subtle" radius="md" padding={3}>
    <Text>{name}</Text>
  </Box>
));

const meta = {
  title: 'Components/Layout/Grid',
  component: Grid,
  args: { children: items },
} satisfies Meta<typeof Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoColumns: Story = {};
export const FourColumns: Story = { args: { columns: 4 } };
export const Loose: Story = { args: { columns: 2, gap: 8 } };
