import { createRoot, type Root } from 'react-dom/client';
import { isChunkLoadFailure } from '@ap/kernel/host';
import { Alert, AlertDescription, AlertTitle, Button } from '@ap/ui';

/** Fixed copy, `@ap/ui` only; no error text, URL or stack (same rule as `StartupFailure`). */
function StaleChunkNotice({ onReload }: { onReload: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-col gap-2 rounded-md bg-surface-card shadow-lg">
      <Alert>
        <AlertTitle>새 버전이 배포되었습니다</AlertTitle>
        <AlertDescription>작성 중인 내용이 있으면 먼저 저장한 뒤 새로 고쳐 주세요.</AlertDescription>
      </Alert>
      <Button type="button" onClick={onReload}>새로 고침</Button>
    </div>
  );
}

let uninstall: (() => void) | null = null;

/** Drops the installed listeners and the notice (the next `installStaleChunkNotice` does this first, so the handler is installed once). */
export function removeStaleChunkNotice(): void { uninstall?.(); uninstall = null; }

/**
 * After a deploy the old page's lazy chunks 404. `vite:preloadError` (a failed preload) and an `unhandledrejection` of a chunk-load failure
 * show one non-blocking notice with a reload button. It never reloads by itself: a draft being written would be lost. A failure a boundary
 * catches (menu screen, shell region) is handled by that boundary and rejects nothing, so it gets no second notice.
 */
export function installStaleChunkNotice(reload: () => void = () => window.location.reload()): () => void {
  removeStaleChunkNotice();
  let host: HTMLElement | null = null;
  let root: Root | null = null;
  const show = () => {
    if (host !== null) return;
    host = document.createElement('div');
    host.setAttribute('data-stale-chunk-notice', '');
    host.className = 'pointer-events-none fixed inset-x-0 bottom-4 z-[100] mx-auto w-full max-w-sm px-4';
    document.body.append(host);
    root = createRoot(host);
    root.render(<StaleChunkNotice onReload={reload} />);
  };
  // Never `preventDefault()` here: Vite then rethrows the original import rejection, which the nearest boundary needs to recognise a chunk failure (a prevented event makes the import resolve to `undefined` and the lazy slot's retry then fails for good).
  const onPreloadError = () => show();
  const onRejection = (event: Event) => { if (isChunkLoadFailure((event as PromiseRejectionEvent).reason)) show(); };
  window.addEventListener('vite:preloadError', onPreloadError);
  window.addEventListener('unhandledrejection', onRejection);
  uninstall = () => {
    window.removeEventListener('vite:preloadError', onPreloadError);
    window.removeEventListener('unhandledrejection', onRejection);
    root?.unmount();
    host?.remove();
    root = null;
    host = null;
  };
  return removeStaleChunkNotice;
}
