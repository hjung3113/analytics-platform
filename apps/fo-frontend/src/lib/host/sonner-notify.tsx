import { UndoToast } from '@ap/ui';
import { toast } from 'sonner';

import type { HostNotice } from './host-seam';

/** The sonner side of `HostSeam.notify`/`dismiss`, shared by the standalone app's hosts. */
export function sonnerNotify(notice: HostNotice): string {
  const { tone, message, description, action, durationMs } = notice;
  if (notice.variant === 'undo' && action !== undefined) {
    // UndoToast owns the focus/pointer-pausable timer; Infinity stops sonner dismissing the toast first.
    return String(
      toast.custom(
        (id) => (
          <UndoToast
            message={message}
            onAction={() => {
              action.onAction();
              toast.dismiss(id);
            }}
            onDismiss={() => toast.dismiss(id)}
            duration={durationMs ?? 4000}
          />
        ),
        { duration: Number.POSITIVE_INFINITY },
      ),
    );
  }
  const options = {
    ...(description !== undefined ? { description } : {}),
    ...(action !== undefined ? { action: { label: action.label, onClick: action.onAction } } : {}),
    ...(durationMs !== undefined ? { duration: durationMs } : {}),
  };
  const hasOptions = Object.keys(options).length > 0;
  if (tone === 'info') return String(hasOptions ? toast(message, options) : toast(message));
  return String(hasOptions ? toast[tone](message, options) : toast[tone](message));
}

/** sonner keys its own toasts by number; `notify` returned it as a string, so a numeric id goes back as a number. */
export function sonnerDismiss(id: string): void {
  toast.dismiss(/^\d+$/.test(id) ? Number(id) : id);
}
