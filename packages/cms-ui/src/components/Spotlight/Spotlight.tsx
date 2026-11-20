import { useEffect, useRef, useState, type ReactNode } from 'react';
import { spotlightVariants } from './Spotlight.variants.js';

/** How long what was pointed at stays marked, in milliseconds. */
const SHOWN_FOR = 1600;

export interface SpotlightProps {
  /**
   * Changes each time what is inside is pointed at from elsewhere on the screen, such as a count
   * of the times. Left out, nothing happens.
   */
  readonly at?: number | undefined;
  /** What is pointed at: a field, usually. */
  readonly children?: ReactNode;
}

/**
 * Brings what it holds into view and marks it for a moment, when something elsewhere on the
 * screen pointed at it. It moves no focus: the person is still where they were.
 */
export function Spotlight({ at, children }: SpotlightProps) {
  const element = useRef<HTMLDivElement>(null);
  const [isLit, setLit] = useState(false);
  useEffect(() => {
    if (at === undefined) {
      // Something else is pointed at now.
      setLit(false);
      return;
    }
    // Not every browser-like place tests run in can scroll.
    if (typeof element.current?.scrollIntoView === 'function') element.current.scrollIntoView({ block: 'nearest' });
    setLit(true);
    const waiting = setTimeout(() => setLit(false), SHOWN_FOR);
    return () => clearTimeout(waiting);
  }, [at]);
  return (
    <div ref={element} className={spotlightVariants({ lit: isLit })} {...(isLit && { 'data-lit': '' })}>
      {children}
    </div>
  );
}
