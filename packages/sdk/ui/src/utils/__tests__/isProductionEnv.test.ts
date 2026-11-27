import { afterEach, describe, expect, it, vi } from 'vitest';
import { isProductionEnv } from '../isProductionEnv';

describe('isProductionEnv', () => {
  it('is false when import.meta.env is absent and there is no process (plain-Node consumer)', () => {
    expect(isProductionEnv({}, {})).toBe(false);
  });

  it('is true when import.meta.env.PROD is true', () => {
    expect(isProductionEnv({ env: { PROD: true } }, {})).toBe(true);
  });

  it('is true when process.env.NODE_ENV is production', () => {
    expect(isProductionEnv({}, { process: { env: { NODE_ENV: 'production' } } })).toBe(true);
  });

  it('is false without a positive production signal', () => {
    expect(isProductionEnv({ env: {} }, {})).toBe(false);
    expect(isProductionEnv({}, { process: { env: {} } })).toBe(false);
    expect(isProductionEnv({}, { process: { env: { NODE_ENV: 'development' } } })).toBe(false);
  });

  it('is true from the statically replaced NODE_ENV alone, as in a Vite production bundle (#2951)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isProductionEnv({}, {})).toBe(true);
  });

  it('keeps its old answers where no global process exists (a browser bundle without NODE_ENV replacement)', () => {
    vi.stubGlobal('process', undefined);
    try {
      expect(isProductionEnv({}, {})).toBe(false);
      expect(isProductionEnv({ env: { PROD: true } }, {})).toBe(true);
      expect(isProductionEnv({}, { process: { env: { NODE_ENV: 'production' } } })).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  afterEach(() => { vi.unstubAllEnvs(); });
});
