import { useI18n, usePlatform } from '@ap/kernel';

/**
 * Clipboard text copy for link buttons (#300), chosen by feature detection — never by `.catch`: in an insecure
 * context (in-house HTTP) `navigator.clipboard` is undefined and touching it throws synchronously (06 §15).
 * Secure context: `navigator.clipboard.writeText`, called synchronously inside the gesture and awaited.
 * Otherwise a one-shot document capture `copy` listener fills `text/plain` and `execCommand('copy')` runs —
 * still synchronously inside the click, before any await, so the user gesture is not lost. The listener counts
 * as handled only when it actually set the data and cancelled the event; a command that copies nothing, a
 * refusal, an exception or missing support all resolve `false`. The listener is removed in `finally`
 * (same mechanism as the PlatformDataTable insecure path, 06 §15 계약).
 */
export function copyText(text: string): Promise<boolean> {
  if (typeof window !== 'undefined' && window.isSecureContext && typeof navigator.clipboard?.writeText === 'function') {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }
  let handled = false;
  const onDocumentCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    handled = true;
  };
  document.addEventListener('copy', onDocumentCopy, true);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; } finally { document.removeEventListener('copy', onDocumentCopy, true); }
  return Promise.resolve(copied === true && handled);
}

/**
 * Link-copy click handler (#300): copies `origin + url` and toasts the caller's success text only after the
 * write actually completed; a refusal or unsupported environment gets a `warning` naming cause and action
 * (06 §26). Consumers stay free of success/failure judgement — this hook owns it.
 */
export function useCopyLink(successText: string): (url: string) => void {
  const { toast } = usePlatform();
  const { lang } = useI18n();
  return (url: string) => {
    void copyText(window.location.origin + url).then(copied => {
      if (copied) toast(successText);
      else toast(lang === 'ko'
        ? '링크를 복사하지 못했습니다. 주소창의 주소를 직접 복사하세요.'
        : 'Could not copy the link. Copy the address from the address bar instead.', 'warning');
    });
  };
}
