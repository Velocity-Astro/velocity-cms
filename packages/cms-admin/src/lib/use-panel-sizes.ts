import type { WorkbenchSizes } from '@velocity-astro/cms-ui';
import { useState } from 'react';

const KEPT = 'velocity-cms:visual-editor-sizes';

/** What this browser last kept, or nothing when it keeps nothing or what it kept is not sizes. */
function kept(): WorkbenchSizes | undefined {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEPT) ?? 'null');
    if (typeof value !== 'object' || value === null) return undefined;
    const { outline, form } = value as Record<string, unknown>;
    return typeof outline === 'number' && typeof form === 'number' ? { outline, form } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * How wide the visual editor's columns are, as the person last dragged them, kept in this browser
 * so the editor opens the way they left it. Nothing about the site or its content is kept.
 */
export function usePanelSizes(): readonly [WorkbenchSizes | undefined, (sizes: WorkbenchSizes) => void] {
  const [sizes, setSizes] = useState<WorkbenchSizes | undefined>(kept);
  const keep = (next: WorkbenchSizes) => {
    setSizes(next);
    try {
      window.localStorage.setItem(KEPT, JSON.stringify(next));
    } catch {
      // A browser that keeps nothing still has the sizes until the editor is left.
    }
  };
  return [sizes, keep] as const;
}
