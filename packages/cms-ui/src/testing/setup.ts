import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// A rich text editor asks where things are on screen to place the cursor. This page has no
// layout, so every answer is "at the top left corner, with no size".
const nowhere = () => ({ x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) });
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = nowhere;
Range.prototype.getClientRects = noRects;
