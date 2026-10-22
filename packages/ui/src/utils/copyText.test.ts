// The shared plain-text copy rule (06 §15, #673). Every case installs exactly the environment it names; jsdom has no
// `isSecureContext` or `navigator.clipboard`. The link-copy UX on top is pinned in @ap/components copyText.test.tsx.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './copyText';

afterEach(() => {
  Reflect.deleteProperty(window, 'isSecureContext');
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});

function secure(writeText: () => Promise<void>) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  const clipboard = { writeText: vi.fn(writeText) };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  return clipboard;
}

function insecureExec({ returns, fires }: { returns: boolean; fires: boolean }) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  const written = new Map<string, string>();
  const execCommand = vi.fn(() => {
    if (fires) {
      const event = new Event('copy', { bubbles: true, cancelable: true }) as Event & { clipboardData?: { setData: (t: string, v: string) => void } };
      event.clipboardData = { setData: (t, v) => { written.set(t, v); } };
      document.body.dispatchEvent(event);
    }
    return returns;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
  return { execCommand, written };
}

describe('copyText (06 §15)', () => {
  it('secure context: true once writeText resolves', async () => {
    const clipboard = secure(async () => {});
    await expect(copyText('a')).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith('a');
  });

  it('secure context: a rejection or a synchronous throw is false, with no execCommand fallback', async () => {
    const { execCommand } = insecureExec({ returns: true, fires: true });
    secure(async () => { throw new Error('denied'); });
    await expect(copyText('a')).resolves.toBe(false);
    secure(() => { throw new Error('sync'); });
    await expect(copyText('a')).resolves.toBe(false);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('insecure context: true only when execCommand returns true and the copy event carried the text', async () => {
    const ok = insecureExec({ returns: true, fires: true });
    await expect(copyText('row')).resolves.toBe(true);
    expect(ok.written.get('text/plain')).toBe('row');
    insecureExec({ returns: true, fires: false });
    await expect(copyText('row')).resolves.toBe(false);
    insecureExec({ returns: false, fires: true });
    await expect(copyText('row')).resolves.toBe(false);
  });

  it('a clipboard present in an insecure context is not used', async () => {
    const clipboard = secure(async () => {});
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    insecureExec({ returns: true, fires: true });
    await expect(copyText('a')).resolves.toBe(true);
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
});
