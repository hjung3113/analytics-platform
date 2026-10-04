import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Load the FeedbackOps re-export after resetting the test module cache.
async function loadButtonModule() {
  vi.resetModules();
  return import('./Button');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Button asChild+loading gate', () => {
  it('throws in the default Vitest environment (DEV)', async () => {
    const { Button } = await loadButtonModule();
    expect(() => render(<Button asChild loading><span>Save</span></Button>)).toThrow(/incompatible/);
  });
});
