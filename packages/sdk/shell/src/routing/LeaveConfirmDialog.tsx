import { useRef } from 'react';
import { useI18n } from '@ap/kernel';
import { useHostPlatform, useLeaveRequest, useOverlayState, type LeaveRequest } from '@ap/kernel/host';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button } from '@ap/ui';

// Shell-owned copy, localized through the same tx port as Registry/menu text.
const copy = {
  title: { ko: '저장하지 않은 변경이 있습니다', en: 'You have unsaved changes' },
  consequence: { ko: '이동하면 변경이 사라집니다.', en: 'Leaving will discard them.' },
  destination: { ko: '{name}{particle} 이동', en: 'Go to {name}' },
  stay: { ko: '머무르기', en: 'Stay' },
  leave: { ko: '변경 버리고 이동', en: 'Discard changes and leave' },
};

/** One host for every Kernel-held navigation; the Kernel alone owns the pending request. */
export function LeaveConfirmDialog() {
  const request = useLeaveRequest();
  return request ? <PendingLeave request={request} /> : null;
}

function PendingLeave({ request }: { request: LeaveRequest }) {
  const { tx } = useI18n();
  const { setPaletteOpen } = useHostPlatform();
  const { paletteSession, paletteOpen } = useOverlayState();
  const safe = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const confirmed = useRef(false);
  const name = request.destination ? tx(request.destination) : '';
  const last = name.charCodeAt(name.length - 1);
  const jong = last >= 0xac00 && last <= 0xd7a3 ? (last - 0xac00) % 28 : 0;
  const particle = jong !== 0 && jong !== 8 ? '으로' : '로';
  const detail = typeof request.message === 'string' ? request.message : request.message ? tx(request.message) : null;
  const confirm = () => {
    confirmed.current = true;
    // Release the palette's arrival-focus gate only after the person decides to leave.
    if (paletteOpen) {
      paletteSession?.select();
      setPaletteOpen(false);
    }
    request.confirm();
  };
  return <AlertDialog open onOpenChange={open => { if (!open) request.cancel(); }}>
    <AlertDialogContent role="alertdialog" above
      onOpenAutoFocus={event => {
        event.preventDefault();
        const active = document.activeElement;
        opener.current = request.via !== 'history' && active instanceof HTMLElement && active !== document.body && (request.via !== null || active.matches('a[href]'))
          ? active : document.getElementById('platform-main');
        safe.current?.focus();
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (confirmed.current) return;
        const target = opener.current?.isConnected ? opener.current : document.getElementById('platform-main');
        target?.focus({ preventScroll: true });
      }}>
      <AlertDialogHeader>
        <AlertDialogTitle>{tx(copy.title)}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>{detail && <p>{detail}</p>}<p>{tx(copy.consequence)}</p></div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {request.destination && <p className="text-sm">{tx(copy.destination).replace(/\{(name|particle)\}/g, (_token, key: string) => key === 'name' ? name : particle)}</p>}
      <AlertDialogFooter>
        <Button ref={safe} size="sm" onClick={() => request.cancel()}>{tx(copy.stay)}</Button>
        <Button size="sm" variant="destructive" onClick={confirm}>{tx(copy.leave)}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
