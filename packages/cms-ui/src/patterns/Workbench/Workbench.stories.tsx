import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../components/Button/index.js';
import { Card } from '../../components/Card/index.js';
import { Text } from '../../components/Text/index.js';
import { TextField } from '../../components/TextField/index.js';
import { Outline } from '../Outline/index.js';
import { Workbench } from './Workbench.js';

const meta = {
  title: 'Patterns/Layout/Workbench',
  component: Workbench,
  parameters: { layout: 'fullscreen' },
  args: {
    paneLabel: 'The page',
    children: (
      <>
        <Card title="Page">
          <TextField label="Title" value="Why list with us" onChange={() => undefined} />
        </Card>
        <Card title="Sections">
          <Text tone="muted">The sections of the page.</Text>
        </Card>
      </>
    ),
    pane: (
      <Card title="The page">
        <Text tone="muted">What the form makes, kept in view.</Text>
      </Card>
    ),
  },
} satisfies Meta<typeof Workbench>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const bar = <Button variant="secondary">Back to the form</Button>;

const outline = (
  <Outline
    title="Sections"
    emptyText="No sections yet."
    currentId="s1"
    onChoose={() => undefined}
    items={[
      { id: 's1', label: 'Page opening' },
      { id: 's2', label: 'Text' },
    ]}
  />
);

/** With the whole window: the bar across the top, the outline on the left, the form a panel on the right. */
export const Whole: Story = { tags: ['!autodocs'], args: { view: 'whole', bar, outline, outlineLabel: 'Sections of the page' } };

/** The panel put away, so the pane has everything. */
export const WholeWithTheFormAway: Story = { tags: ['!autodocs'], args: { view: 'whole', bar, isFormAway: true } };
