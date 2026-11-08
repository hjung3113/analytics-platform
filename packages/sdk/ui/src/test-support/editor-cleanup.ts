import { setTimeout as delay } from 'node:timers/promises';
import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';

/** Keep jsdom alive until the pinned editor's upstream cleanup callbacks finish. */
export async function cleanupEditorTests(editorMounted: boolean) {
  cleanup();
  if (!editorMounted) return;
  // Tiptap 3.23.5 useEditor defers destroy by 1ms; BubbleMenuView.destroy() does not
  // cancel its private 250ms update/60ms resize timers. A focus callback can queue
  // the update on the next tick, and the React menu removes its portal on a frame.
  // Drain while document still exists, rather than hiding errors after teardown.
  if (vi.isFakeTimers()) await vi.runOnlyPendingTimersAsync();
  else await delay(250 + 1 + 16);
}
