import type { Meta, StoryObj } from '@storybook/react-vite';
import { BarChart } from './BarChart.js';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const counts = [2, 4, 1, 6, 3, 0, 5];

const meta = {
  title: 'Components/Data/BarChart',
  component: BarChart,
  args: {
    label: 'Submissions in the last 7 days',
    highlightId: 'Sun',
    bars: days.map((day, index) => ({ id: day, label: day, value: counts[index] ?? 0, valueText: `${counts[index] ?? 0} submissions` })),
  },
} satisfies Meta<typeof BarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Columns: Story = {};
export const Rows: Story = {
  args: {
    label: 'Entries by type',
    layout: 'rows',
    highlightId: '',
    bars: [
      { id: 'listings', label: 'Listings', value: 16, valueText: '16' },
      { id: 'agents', label: 'Agents', value: 6, valueText: '6' },
      { id: 'pages', label: 'Pages', value: 9, valueText: '9' },
      { id: 'guides', label: 'Guides', value: 0, valueText: '0' },
    ],
  },
};
