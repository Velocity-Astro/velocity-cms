import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { Button } from '../Button/index.js';
import { Inline } from '../Inline/index.js';
import { Toast, toast, type ToastMessage, type ToastProps } from './Toast.js';

const messages: Record<string, ToastMessage> = {
  neutral: { title: 'Link copied' },
  success: { title: 'Listing published', description: 'It is on the site now.', tone: 'success' },
  danger: { title: 'Could not save', description: 'Check your connection and try again.', tone: 'danger' },
};

/** Buttons that send messages, and the place they appear. `showing` sends them straight away. */
function Example({ showing = false, ...props }: ToastProps & { readonly showing?: boolean }) {
  useEffect(() => {
    if (!showing) return undefined;
    const close = Object.values(messages).map((message) => toast(message));
    return () => close.forEach((done) => done());
  }, [showing]);
  return (
    <>
      <Inline gap={2}>
        <Button variant="secondary" onPress={() => toast(messages['neutral'] as ToastMessage)}>
          Copy link
        </Button>
        <Button onPress={() => toast(messages['success'] as ToastMessage)}>Publish</Button>
        <Button variant="danger" onPress={() => toast(messages['danger'] as ToastMessage)}>
          Fail to save
        </Button>
      </Inline>
      <Toast {...props} />
    </>
  );
}

const meta = {
  title: 'Components/Overlays/Toast',
  component: Toast,
  render: (args) => <Example {...args} />,
  args: { label: 'Notifications', closeLabel: 'Dismiss' },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PressToShow: Story = {};
export const Showing: Story = { tags: ['!autodocs', 'overlay'], render: (args) => <Example {...args} showing /> };
