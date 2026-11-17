import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SearchField } from './SearchField.js';

const meta = {
  title: 'Components/Forms/SearchField',
  component: SearchField,
  args: { label: 'Search listings', placeholder: 'Search by title', clearLabel: 'Clear search', value: '', onChange: () => undefined },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <SearchField {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithText: Story = { args: { value: 'Lakeshore' } };
