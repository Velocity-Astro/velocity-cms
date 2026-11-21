import { useRef, useState, type ReactNode } from 'react';
import { FocusScope, UNSAFE_PortalProvider, useFocusRing, useMove } from 'react-aria';
import {
  WORKBENCH_FORM_DEFAULT,
  WORKBENCH_OUTLINE_DEFAULT,
  workbenchBodyVariants,
  workbenchFormVariants,
  workbenchFormWidthVariants,
  WORKBENCH_FORM_STEPS,
  workbenchHandleVariants,
  workbenchFormInnerClass,
  workbenchOutlineClass,
  workbenchOutlineWidthVariants,
  WORKBENCH_OUTLINE_STEPS,
  workbenchPaneVariants,
  workbenchResizeStep,
  workbenchVariants,
  type WorkbenchVariants,
} from './Workbench.variants.js';

export interface WorkbenchSizes {
  /** How wide the outline is: a step from 0, the narrowest. */
  readonly outline: number;
  /** How wide the form's panel is, the same way. */
  readonly form: number;
}

export interface WorkbenchProps extends WorkbenchVariants {
  /** Names the pane for screen readers, such as "The page". */
  readonly paneLabel: string;
  /** What is worked on: the form, in a column of its own. */
  readonly children: ReactNode;
  /** What the work makes, shown large beside it and kept in view: the page. */
  readonly pane: ReactNode;
  /** Across the top when the workbench has the whole window: what is edited, the way back and the save buttons. */
  readonly bar?: ReactNode;
  /** With the whole window, whether the form is put away at the side so the pane has it all. */
  readonly isFormAway?: boolean;
  /** With the whole window, on the left of the pane: the way around it, such as an `Outline` of the page's sections. */
  readonly outline?: ReactNode;
  /** Names the outline's column for screen readers, such as "Sections of the page". */
  readonly outlineLabel?: string;
  /** With the whole window, how wide the outline and the form are, as a person last left them. */
  readonly sizes?: WorkbenchSizes;
  /** Called when a person drags a column wider or narrower, to keep it for next time. */
  readonly onSizesChange?: (sizes: WorkbenchSizes) => void;
  /** What the edges between the columns are called, for screen readers: "Width of the sections", "Width of the form". */
  readonly resizeLabels?: { readonly outline: string; readonly form: string };
}

const clamp = (step: number, most: number) => Math.min(most, Math.max(0, step));

/**
 * The edge between two columns. A pointer drags it; with the focus, the arrow keys move it a step at
 * a time. It is a separator with a value, which is what it is to a screen reader: React Aria has no
 * part for it, so its role and value are said here.
 */
function Handle({
  label,
  place,
  step,
  most,
  grows,
  onStep,
  onResizing,
}: {
  readonly label: string;
  readonly place: 'outline' | 'form';
  readonly step: number;
  readonly most: number;
  /** +1 when moving the edge right makes the column wider (the outline); -1 when it makes it narrower (the form). */
  readonly grows: 1 | -1;
  readonly onStep: (step: number) => void;
  readonly onResizing: (isResizing: boolean) => void;
}) {
  const travelled = useRef(0);
  const started = useRef(step);
  const [isHeld, setHeld] = useState(false);
  const { focusProps, isFocusVisible } = useFocusRing();
  const { moveProps } = useMove({
    onMoveStart: () => {
      travelled.current = 0;
      started.current = step;
      setHeld(true);
      onResizing(true);
    },
    onMove: ({ deltaX, pointerType }) => {
      if (pointerType === 'keyboard') {
        onStep(clamp(step + Math.sign(deltaX) * grows, most));
        return;
      }
      travelled.current += deltaX;
      onStep(clamp(started.current + Math.round((travelled.current * grows) / workbenchResizeStep), most));
    },
    onMoveEnd: () => {
      setHeld(false);
      onResizing(false);
    },
  });
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={most}
      aria-valuenow={step}
      tabIndex={0}
      {...moveProps}
      {...focusProps}
      className={workbenchHandleVariants({ place, isActive: isHeld || isFocusVisible })}
    />
  );
}

/**
 * A form with what it makes shown large beside it. On a narrow screen the pane follows below.
 * With `view="whole"` the two take the whole window, over the editor's frame, as a studio in the
 * dark theme: the outline on the left, the pane in the middle, and the form a panel on the right that
 * can be put away. The outline and the form are dragged wider or narrower by the edges between them.
 * Going from one view to the other keeps both as they are: nothing typed is lost and the pane is not
 * made again.
 */
export function Workbench({
  paneLabel,
  children,
  pane,
  bar,
  isFormAway = false,
  outline,
  outlineLabel,
  sizes,
  onSizesChange,
  resizeLabels,
  view = 'beside',
}: WorkbenchProps) {
  const isWhole = view === 'whole';
  const [held, setHeld] = useState<WorkbenchSizes>({ outline: WORKBENCH_OUTLINE_DEFAULT, form: WORKBENCH_FORM_DEFAULT });
  const shown = sizes ?? held;
  const resize = (next: WorkbenchSizes) => {
    setHeld(next);
    onSizesChange?.(next);
  };
  const [isResizing, setResizing] = useState(false);
  // Menus and windows opened inside the studio open inside it, so they take its dark theme too.
  const studio = useRef<HTMLDivElement>(null);
  const form = (
    <div className={workbenchFormVariants({ view, isAway: isWhole && isFormAway })}>
      {/* With the whole window, the panel is as wide as a person last dragged it. */}
      <div className={isWhole ? workbenchFormWidthVariants({ width: shown.form as 0 }) : workbenchFormInnerClass}>{children}</div>
    </div>
  );
  return (
    // With the whole window, the keyboard stays in it: what is behind cannot be seen.
    <FocusScope contain={isWhole}>
      {/* Always here, so the tree is the same in both views; beside the form, overlays open where they always do. */}
      <UNSAFE_PortalProvider getContainer={() => (isWhole && studio.current !== null ? studio.current : document.body)}>
        <div ref={studio} className={workbenchVariants({ view })}>
          {isWhole && bar}
          <div className={workbenchBodyVariants({ view })}>
            {isWhole && outline !== undefined && (
              <aside aria-label={outlineLabel} className={workbenchOutlineClass}>
                <div className={workbenchOutlineWidthVariants({ width: shown.outline as 0 })}>{outline}</div>
              </aside>
            )}
            {isWhole && outline !== undefined && resizeLabels !== undefined && (
              <Handle
                label={resizeLabels.outline}
                place="outline"
                step={shown.outline}
                most={WORKBENCH_OUTLINE_STEPS - 1}
                grows={1}
                onStep={(step) => resize({ ...shown, outline: step })}
                onResizing={setResizing}
              />
            )}
            {isWhole && !isFormAway && resizeLabels !== undefined && (
              <Handle
                label={resizeLabels.form}
                place="form"
                step={shown.form}
                most={WORKBENCH_FORM_STEPS - 1}
                grows={-1}
                onStep={(step) => resize({ ...shown, form: step })}
                onResizing={setResizing}
              />
            )}
            {/* The form keeps its place among the children in both views, so it is never made again: whole, it is drawn on the right. */}
            {form}
            <section aria-label={paneLabel} className={workbenchPaneVariants({ view, isResizing })}>
              {pane}
            </section>
          </div>
        </div>
      </UNSAFE_PortalProvider>
    </FocusScope>
  );
}
