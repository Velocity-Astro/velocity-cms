import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from '../../components/Card/index.js';
import { TextField } from '../../components/TextField/index.js';
import { Split } from './Split.js';

const meta = {
  title: 'Patterns/Page/Split',
  component: Split,
  parameters: { layout: 'fullscreen' },
  args: {
    asideLabel: 'Publishing',
    children: (
      <>
        <Card title="Overview">
          <TextField label="Headline" defaultValue="Restored 1928 farmhouse" />
        </Card>
        <Card title="Location">
          <TextField label="Street" defaultValue="6214 Lakeshore Drive" />
        </Card>
      </>
    ),
    aside: (
      <Card title="On the site">
        <TextField label="Web address" defaultValue="lakeshore-farmhouse" />
      </Card>
    ),
  },
} satisfies Meta<typeof Split>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
