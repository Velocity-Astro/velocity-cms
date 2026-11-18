import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '../Box/index.js';
import { Inline } from '../Inline/index.js';
import { Stack } from '../Stack/index.js';
import { Skeleton, SkeletonGroup } from './Skeleton.js';

const meta = {
  title: 'Components/Status/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Title: Story = { args: { shape: 'title', width: '1/3' } };
export const Control: Story = { args: { shape: 'control', width: '1/2' } };
export const Block: Story = { args: { shape: 'block' } };

export const Row: Story = {
  render: () => (
    <SkeletonGroup label="Loading listings">
      <Inline gap={3}>
        <Skeleton shape="square" />
        <Box grow>
          <Stack gap={2}>
            <Skeleton width="1/3" />
            <Skeleton width="1/4" />
          </Stack>
        </Box>
      </Inline>
    </SkeletonGroup>
  ),
};
