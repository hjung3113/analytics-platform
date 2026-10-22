import { describe, expect, it } from 'vitest';
import { chooseAssembly, MISSING_ASSEMBLY_MESSAGE } from './assembly-choice.ts';

const pick = (mode: string, command: 'build' | 'serve', isPreview = false, env: Record<string, string> = {}) =>
  chooseAssembly({ mode, command, isPreview, env });

describe('chooseAssembly (#154 FIX1)', () => {
  it('uses the real assembly only for the real-mode dev server', () => {
    expect(pick('real', 'serve')).toEqual({ kind: 'real-dev' });
  });

  it('keeps the production rule for a real-mode build: the env is required and wins', () => {
    expect(() => pick('real', 'build')).toThrow(MISSING_ASSEMBLY_MESSAGE);
    expect(pick('real', 'build', false, { AP_PLATFORM_ASSEMBLY: '/x/in-house.tsx' })).toEqual({ kind: 'injected', path: '/x/in-house.tsx' });
  });

  it('leaves real-mode preview unchanged: nothing is resolved', () => {
    expect(pick('real', 'serve', true)).toEqual({ kind: 'unresolved' });
  });

  it.each(['development', 'mock', 'test'])('uses the mock assembly in mode %s', (mode) => {
    expect(pick(mode, 'build')).toEqual({ kind: 'mock' });
    expect(pick(mode, 'serve')).toEqual({ kind: 'mock' });
  });

  it('requires the env for a production build and honours the graph-check exemption', () => {
    expect(() => pick('production', 'build')).toThrow();
    expect(pick('production', 'build', false, { AP_PROD_GRAPH_CHECK: '1' })).toEqual({ kind: 'unresolved' });
  });
});
