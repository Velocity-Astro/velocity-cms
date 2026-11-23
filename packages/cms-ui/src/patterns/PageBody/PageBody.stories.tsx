import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from '../../components/Card/index.js';
import { TextField } from '../../components/TextField/index.js';
import { PageBody } from './PageBody.js';

const meta = {
  title: 'Patterns/Page/PageBody',
  component: PageBody,
  parameters: { layout: 'fullscreen' },
  args: {
    children: (
      <Card title="Your details">
        <TextField label="Name" defaultValue="Dana" />
      </Card>
    ),
  },
} satisfies Meta<typeof PageBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Wide: Story = {};
export const Narrow: Story = { args: { width: 'narrow' } };
