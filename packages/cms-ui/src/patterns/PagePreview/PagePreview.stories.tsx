import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Segmented } from '../../components/Segmented/index.js';
import { Text } from '../../components/Text/index.js';
import { Workbench } from '../Workbench/index.js';
import { PagePreview, type PagePreviewProps } from './PagePreview.js';

const widths = [
  { id: 'phone', label: 'Phone' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'full', label: 'Desktop' },
] as const;

/** The preview with its choice of width, as a screen would use it. */
function Example({ width: startsAt, ...props }: PagePreviewProps) {
  const [width, setWidth] = useState(startsAt ?? 'full');
  // It fills the height it is given, so it is shown where a screen puts it.
  return (
    <Workbench
      paneLabel="The page"
      pane={
        <PagePreview
          {...props}
          width={width}
          toolbar={<Segmented label="Width" selected={width} onChange={(id) => setWidth(id as typeof width)} options={[...widths]} />}
        />
      }
    >
      <Text tone="muted">The form that builds the page.</Text>
    </Workbench>
  );
}

const meta = {
  title: 'Patterns/Page/PagePreview',
  component: PagePreview,
  render: (args) => <Example {...args} />,
  args: {
    label: 'Why list with us, as it would look',
    // A real screen gives the page's own address. Here there is no site to ask.
    address: 'about:blank',
    draft: '{}',
    note: 'Shows the form as it is now, saved or not.',
    emptyText: 'Save the page once to see it here.',
  },
} satisfies Meta<typeof PagePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
export const Tablet: Story = { args: { width: 'tablet' } };
export const Phone: Story = { args: { width: 'phone' } };
export const NoPageYet: Story = { args: { address: undefined } };
