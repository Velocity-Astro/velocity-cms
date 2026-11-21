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
    title: 'Good morning, Dana. 3 drafts are waiting.',
    highlight: 'Dana',
    description: 'One has changes that are not on the site yet, and two people wrote in since yesterday.',
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
export const NothingToHighlight: Story = { args: { title: 'Good morning, Dana. Everything is published.', highlight: '' } };
