import { setTimeout as delay } from 'node:timers/promises';

// Tiptap 3.23.5: BubbleMenuView.destroy() does not cancel its 250 ms update timer, and that timer reads `document`.
// If it outlives the file's jsdom, the run fails with an unhandled error after every test passed (#1543).
// Only the end of a file removes `document`, so a file that mounted an editor waits past the timer there.
const EDITOR_TIMER_WAIT_MS = 500;

/** Starts watching for mounted editors. The returned function waits out their timers if there were any. */
export function watchEditorTimers(): () => Promise<void> {
  let editorMounted = false;
  const remember = (records: MutationRecord[]) => {
    for (const { addedNodes } of records) {
      for (const node of addedNodes) {
        if (node instanceof Element && (node.matches('.ProseMirror') || node.querySelector('.ProseMirror'))) editorMounted = true;
      }
    }
  };
  const observer = new MutationObserver(remember);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return async () => {
    remember(observer.takeRecords());
    observer.disconnect();
    if (editorMounted) await delay(EDITOR_TIMER_WAIT_MS);
  };
}
