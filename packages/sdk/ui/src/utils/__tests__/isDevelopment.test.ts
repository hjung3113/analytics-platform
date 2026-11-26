import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDevelopment } from '../isDevelopment';

describe('isDevelopment (#2951)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('is false only for a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isDevelopment()).toBe(false);
  });

  it('is true for development, test and an unset NODE_ENV', () => {
    for (const value of ['development', 'test', '']) {
      vi.stubEnv('NODE_ENV', value);
      expect(isDevelopment()).toBe(true);
    }
  });
});
