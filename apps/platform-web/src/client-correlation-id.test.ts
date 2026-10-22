import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientCorrelationId } from '@ap/contracts';

// What the servers accept (mock-server and FeedbackOps reportClientError, contract §7 X-Correlation-Id adoption).
const accepted = (id: string) => id.startsWith('client-') && id.length <= 80 && /^[A-Za-z0-9._-]{1,128}$/.test(id);

afterEach(() => { vi.unstubAllGlobals(); });

describe('clientCorrelationId', () => {
  it('uses crypto.randomUUID where it exists', () => {
    const id = clientCorrelationId();
    expect(id).toMatch(/^client-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(accepted(id)).toBe(true);
  });

  it('falls back to getRandomValues outside a secure context, still unique within one millisecond', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const a = clientCorrelationId();
    const b = clientCorrelationId();
    expect(a).toMatch(/^client-[0-9a-f]{10,12}-[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(accepted(a)).toBe(true);
    vi.restoreAllMocks();
  });

  it('falls back to Math.random without Web Crypto', () => {
    vi.stubGlobal('crypto', undefined);
    const id = clientCorrelationId();
    expect(id).toMatch(/^client-[0-9a-f]{10,12}-[0-9a-f]{16}$/);
    expect(accepted(id)).toBe(true);
  });
});
