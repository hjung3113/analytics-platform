import { UndoToast } from '@fops/ui';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

import { type HostNotice, registerDefaultHost } from '../lib/host/host-seam';

/** The spies behind the default host `registerNoticeHost()` installs: what a screen raised through the seam. */
export const noticeHost = {
  notify: vi.fn<(notice: HostNotice) => string>(() => 'notice-id'),
  dismiss: vi.fn<(id: string) => void>(),
};

/**
 * The standalone host's undo look for a captured `variant: 'undo'` notice (what `sonnerNotify` draws): the notice's
 * action button, whose click runs the action and dismisses by `id` like sonner's toast does.
 */
export function undoNoticeRenderer(notice: HostNotice): (id: string | number) => ReactNode {
  return (id) => (
    <UndoToast
      message={notice.message}
      onAction={() => {
        notice.action?.onAction();
        noticeHost.dismiss(String(id));
      }}
      onDismiss={() => noticeHost.dismiss(String(id))}
      duration={notice.durationMs ?? 4000}
    />
  );
}

/**
 * Installs the default host with `notify`/`dismiss` replaced by the `noticeHost` spies (links and navigation stay
 * `tanstackHost`'s). Call it from `beforeAll` (after the file's `vi.mock` calls, like `setup.ts`, which it overrides).
 */
export async function registerNoticeHost(): Promise<void> {
  const { tanstackHost } = await import('../lib/host/tanstack-host');
  registerDefaultHost({ ...tanstackHost, notify: noticeHost.notify, dismiss: noticeHost.dismiss });
}

/** The messages raised through `noticeHost.notify` with `tone`, in order. */
export function noticeMessages(tone: HostNotice['tone']): string[] {
  return noticeHost.notify.mock.calls
    .filter(([notice]) => notice.tone === tone)
    .map(([notice]) => notice.message);
}
