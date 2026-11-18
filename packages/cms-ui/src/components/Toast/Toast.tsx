import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import {
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastList as ToastList,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
} from 'react-aria-components';
import { IconButton } from '../IconButton/index.js';
import {
  toastClass,
  toastContentClass,
  toastDescriptionClass,
  toastDuration,
  toastIconSize,
  toastIconVariants,
  toastListClass,
  toastRegionClass,
  toastTitleClass,
  type ToastTone,
} from './Toast.variants.js';

export interface ToastMessage {
  /** What happened, in a few words: "Listing published". */
  readonly title: string;
  /** One more sentence, when the title is not enough. */
  readonly description?: string;
  /** `danger` messages stay until they are dismissed. */
  readonly tone?: ToastTone;
}

export interface ToastProps {
  /** Names the place messages appear for screen readers, such as "Notifications". */
  readonly label: string;
  /** The name of each message's close button, such as "Dismiss". */
  readonly closeLabel: string;
}

const ICONS = { neutral: Info, success: CircleCheck, danger: CircleAlert } as const;

/**
 * One list of messages for the whole editor, so they stack in one place whoever sends them. Three
 * show as a stack; a fourth waits behind them and is seen when the stack is fanned out.
 */
const queue = new ToastQueue<ToastMessage>({ maxVisibleToasts: 4 });

/** A message as the list hands it over: its content, and the key that closes it. */
type QueuedMessage = (typeof queue)['visibleToasts'][number];

/** Shows a message. Returns a function that takes it away early. */
export function toast(message: ToastMessage): () => void {
  const key = queue.add(message, message.tone === 'danger' ? {} : { timeout: toastDuration });
  return () => queue.close(key);
}

/** Closes every message at once. For when what they were about is gone, such as after signing out. */
export function dismissToasts(): void {
  queue.clear();
}

/** Where messages from `toast()` appear. Put exactly one in the app. */
export function Toast({ label, closeLabel }: ToastProps) {
  return (
    <ToastRegion queue={queue} aria-label={label} className={toastRegionClass}>
      <ToastList className={toastListClass}>
        {({ toast: item }: { toast: QueuedMessage }) => {
          const tone = item.content.tone ?? 'neutral';
          const Icon = ICONS[tone];
          return (
            <AriaToast toast={item} className={toastClass}>
              <Icon aria-hidden size={toastIconSize} className={toastIconVariants({ tone })} />
              <ToastContent className={toastContentClass}>
                <Text slot="title" className={toastTitleClass}>
                  {item.content.title}
                </Text>
                {item.content.description !== undefined && (
                  <Text slot="description" className={toastDescriptionClass}>
                    {item.content.description}
                  </Text>
                )}
              </ToastContent>
              <IconButton label={closeLabel} icon={X} size="sm" onPress={() => queue.close(item.key)} />
            </AriaToast>
          );
        }}
      </ToastList>
    </ToastRegion>
  );
}
