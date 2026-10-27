/**
 * Plain-text clipboard copy with the platform's one success rule (06 §15, #300, #673), chosen by feature detection —
 * never by `.catch`: in an insecure context (in-house HTTP) `navigator.clipboard` is undefined and touching it throws
 * synchronously.
 * Secure context: `navigator.clipboard.writeText`, called synchronously inside the gesture and awaited. Success = the
 * write resolved; a rejection or a synchronous throw resolves `false` (no fallback to the insecure path).
 * Otherwise a one-shot document capture `copy` listener fills `text/plain` and `execCommand('copy')` runs —
 * still synchronously inside the click, before any await, so the user gesture is not lost. Success = the command
 * returned true AND the listener actually set the data and cancelled the event; a command that copies nothing, a
 * refusal, an exception or missing support all resolve `false`. The listener is removed in `finally`
 * (same mechanism as the PlatformDataTable insecure path, 06 §15 계약).
 */
export function copyText(text: string): Promise<boolean> {
  if (typeof window !== 'undefined' && window.isSecureContext && typeof navigator.clipboard?.writeText === 'function') {
    try {
      return navigator.clipboard.writeText(text).then(() => true, () => false);
    } catch {
      return Promise.resolve(false); // the write threw synchronously before returning a promise
    }
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
