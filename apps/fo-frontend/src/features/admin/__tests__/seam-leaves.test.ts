import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Temporary until fo-entry-graph.test.ts describes cover these same admin files (764g/m/y).
const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const routerSearchFiles = new Set<string>();

function sourceFilesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return sourceFilesIn(path);
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.[^.]+$/.test(entry.name)) return [];
    return [path];
  });
}

describe('admin feature seam leaves', () => {
  it('keeps every non-router admin source file on the host and API seams', () => {
    const files = sourceFilesIn(adminRoot).filter(
      (path) => !routerSearchFiles.has(relative(adminRoot, path)),
    );
    expect(files.length).toBeGreaterThanOrEqual(20);

    for (const path of files) {
      const relativePath = relative(adminRoot, path);
      const source = readFileSync(path, 'utf8');
      expect(source, `${relativePath}: API barrel`).not.toMatch(
        /from\s+['"](?:@\/lib\/api|(?:\.\.\/)+lib\/api)['"];/,
      );
      expect(source, `${relativePath}: raw fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${relativePath}: sonner`).not.toMatch(/from\s+['"]sonner['"]/);
      expect(source, `${relativePath}: useMe`).not.toMatch(/lib\/auth\/useMe/);
      expect(source, `${relativePath}: non-bridge permission hook`).not.toMatch(
        /lib\/cross-system\/usePermissionCheck['"]/,
      );
      expect(source, `${relativePath}: InternalLink`).not.toMatch(/lib\/router\/InternalLink/);
      if (relativePath !== 'settings/WorkspaceSettingsScreen.tsx') {
        expect(source, `${relativePath}: window.location`).not.toMatch(/window\.location/);
      }
    }
  });
});
