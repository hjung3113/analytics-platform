import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe('JOBS_DISABLED configuration', () => {
  it('defaults to false', () => {
    delete process.env.JOBS_DISABLED;
    expect(loadConfig().JOBS_DISABLED).toBe(false);
  });

  it('treats an empty value as unset', () => {
    process.env.JOBS_DISABLED = '';
    expect(loadConfig().JOBS_DISABLED).toBe(false);
  });

  it('reads true and false', () => {
    process.env.JOBS_DISABLED = 'true';
    expect(loadConfig().JOBS_DISABLED).toBe(true);
    process.env.JOBS_DISABLED = 'false';
    expect(loadConfig().JOBS_DISABLED).toBe(false);
  });

  it('rejects any other value', () => {
    process.env.JOBS_DISABLED = 'yes';
    expect(() => loadConfig()).toThrow();
  });
});
