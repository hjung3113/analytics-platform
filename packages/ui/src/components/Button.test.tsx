import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Button.tsx probes the environment at module scope, so every test loads a fresh
// module instance after stubbing globals (vi.resetModules + dynamic import) instead
// of mutating the real environment.
async function loadButtonModule() {
  vi.resetModules();
  return import('./Button');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('isProductionEnv', () => {
  it('is false when import.meta.env is absent and there is no process (plain-Node consumer)', async () => {
    const { isProductionEnv } = await loadButtonModule();
    expect(isProductionEnv({}, {})).toBe(false);
  });

  it('is true when import.meta.env.PROD is true', async () => {
    const { isProductionEnv } = await loadButtonModule();
    expect(isProductionEnv({ env: { PROD: true } }, {})).toBe(true);
  });

  it('is true when process.env.NODE_ENV is production', async () => {
    const { isProductionEnv } = await loadButtonModule();
    expect(isProductionEnv({}, { process: { env: { NODE_ENV: 'production' } } })).toBe(true);
  });

  it('is false without a positive production signal', async () => {
    const { isProductionEnv } = await loadButtonModule();
    expect(isProductionEnv({ env: {} }, {})).toBe(false);
    expect(isProductionEnv({}, { process: { env: {} } })).toBe(false);
    expect(isProductionEnv({}, { process: { env: { NODE_ENV: 'development' } } })).toBe(false);
  });
});

describe('Button asChild+loading gate', () => {
  it('throws when there is no production signal (non-Vite dev/test consumer)', async () => {
    vi.stubEnv('DEV', false); // approximate an absent import.meta.env under Vitest
    vi.stubGlobal('process', { env: {} });
    const { Button } = await loadButtonModule();
    expect(() => render(<Button asChild loading><span>Save</span></Button>)).toThrow(/incompatible/);
  });

  it('warns and renders without the loading affordance when NODE_ENV=production', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { Button } = await loadButtonModule();
    const { container } = render(<Button asChild loading><span>Save</span></Button>);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(container.querySelector('span')?.textContent).toBe('Save');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('throws in the default Vitest environment (DEV)', async () => {
    const { Button } = await loadButtonModule();
    expect(() => render(<Button asChild loading><span>Save</span></Button>)).toThrow(/incompatible/);
  });
});
