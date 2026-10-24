import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');

const ownedDirectories = [
  'features/voc/hooks',
  'features/cross-system/create-finding',
  'features/cross-system/request-task',
  'features/cross-system/progress-notes',
];

const keptImports = new Map<string, Set<string>>([
  ['features/voc/hooks/useTriageCommand.ts', new Set(['sonner'])],
  [
    'features/cross-system/create-finding/CreateFindingModal.tsx',
    new Set(['@tanstack/react-router', 'sonner']),
  ],
  [
    'features/cross-system/request-task/TaskRequestDraftCard.tsx',
    new Set(['@/lib/router/InternalLink']),
  ],
  ['features/cross-system/progress-notes/ProgressNotesComposer.tsx', new Set(['sonner'])],
]);

const bannedImports = [
  /^@\/lib\/api$/,
  /^@\/lib\/auth(?:\/|$)/,
  /^@\/lib\/router(?:\/|$)/,
  /^@tanstack\/react-router$/,
  /^sonner$/,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    if (!/\.tsx?$/.test(entry.name) || /\.(?:test|spec)\.tsx?$/.test(entry.name)) return [];
    return [absolutePath];
  });
}

function importSources(source: string): string[] {
  return [
    ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*(?:\(\s*)?['"]([^'"]+)['"]/g),
  ].map((match) => match[1] ?? match[2] ?? '');
}

describe('shared VOC bridge imports', () => {
  it('keeps owned source files free of bridge-banned imports except the named retains', () => {
    const vocLibDirectory = path.join(sourceRoot, 'features/voc/lib');
    const triagePolicyFiles = readdirSync(vocLibDirectory)
      .filter((name) => /^triage-.*\.ts$/.test(name))
      .map((name) => path.join(vocLibDirectory, name));
    const vocAreaFilter = path.join(sourceRoot, 'features/voc/components/VocAreaFilterSelect.tsx');
    const files = [
      ...ownedDirectories.flatMap((directory) => sourceFiles(path.join(sourceRoot, directory))),
      ...triagePolicyFiles,
      vocAreaFilter,
    ].sort();

    for (const file of files) {
      const relativePath = path.relative(sourceRoot, file).split(path.sep).join('/');
      const imports = importSources(readFileSync(file, 'utf8'));
      const kept = keptImports.get(relativePath) ?? new Set<string>();
      const violations = imports.filter(
        (moduleName) =>
          bannedImports.some((pattern) => pattern.test(moduleName)) && !kept.has(moduleName),
      );

      expect(violations, relativePath).toEqual([]);
    }
  });
});
