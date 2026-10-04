import { describe, expect, it } from 'vitest';
import { isProductionEnv } from './isProductionEnv';

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
});
