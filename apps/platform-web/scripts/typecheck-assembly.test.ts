// @vitest-environment node
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROOT, resolveAssemblyPath, typecheckAssembly } from './typecheck-assembly.ts';

const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('ap-assembly-check-'));

describe('typecheckAssembly (#153)', () => {
  it('resolves a relative AP_PLATFORM_ASSEMBLY from the app directory, like the Vite alias', () => {
    expect(resolveAssemblyPath('src/dev/mock-assembly.tsx', '/repo/app')).toBe('/repo/app/src/dev/mock-assembly.tsx');
    expect(resolveAssemblyPath('/abs/a.ts', '/repo/app')).toBe('/abs/a.ts');
  });

  it('passes the mock assembly', () => {
    const before = leftovers().length;
    expect(typecheckAssembly(resolveAssemblyPath('src/dev/mock-assembly.tsx'))).toBeNull();
    expect(leftovers().length).toBe(before);
  }, 60_000);

  it('fails an assembly of the wrong shape with a tsc error naming the property', () => {
    const before = leftovers().length;
    const dir = mkdtempSync(join(tmpdir(), 'ap-bad-assembly-'));
    try {
      const file = join(dir, 'bad-assembly.ts');
      writeFileSync(file, 'export const createAssembly = () => ({ topBarTools: null });\n');
      const errors = typecheckAssembly(file, APP_ROOT);
      expect(errors).toMatch(/error TS\d+/);
      expect(errors).toContain('adapter');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(leftovers().length).toBe(before);
  }, 60_000);
});
