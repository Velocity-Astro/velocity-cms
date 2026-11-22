import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, MousePointer2 } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { Welcome } from './Welcome.js';

const meta = {
  title: 'Patterns/Page/Welcome',
  component: Welcome,
  parameters: { layout: 'fullscreen' },
  args: {
    eyebrow: 'Saturday, 21 November',
    title: 'Good morning,',
    name: 'Dana Whitfield',
    description: '3 drafts are waiting. Here is where Lakeshore Realty stands.',
    actions: (
      <>
        <Button icon={ArrowRight}>Continue “18 Alder Court”</Button>
        <Button variant="secondary" icon={MousePointer2}>
          Edit the home page
        </Button>
      </>
    ),
  },
} satisfies Meta<typeof Welcome>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const EverythingPublished: Story = { args: { description: 'Everything is published. Here is where Lakeshore Realty stands.' } };
export const LongName: Story = { args: { name: 'Alexandra Montgomery-Fitzwilliam' } };
export const NoName: Story = { args: { title: 'Home', name: '' } };
