import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');
const entryModules = [
  'features/findings/components/FindingDetail/AddEvidenceModal.tsx',
  'features/findings/components/FindingDetail/LinkEvidenceModal.tsx',
  'features/findings/components/FindingDetail/LinkTaskModal.tsx',
  'features/findings/components/FindingDetail/VocSourcePicker.tsx',
  'features/findings/components/FindingDetail/SurveyEvidencePicker.tsx',
  'features/findings/components/FindingDetail/FindingOwnerField.tsx',
  'features/findings/components/FindingDetail/EvidenceHighlights.tsx',
  'features/findings/components/FindingDetail/FindingExecutionSection.tsx',
  'features/findings/hooks/useEvidenceHighlights.ts',
  'features/findings/hooks/useEvidenceMutations.ts',
  'features/findings/hooks/useFindingStatusMutation.ts',
  'features/findings/hooks/useRequestTaskFromFinding.ts',
  'features/findings/hooks/useSurveyEvidence.ts',
  'features/findings/components/FindingDetail/FindingDetailParts.tsx',
  'features/findings/components/FindingDetail/FindingDetailPanel.tsx',
  'features/findings/components/FindingDetail/FullFindingDetail.tsx',
  'features/findings/components/FindingDetail/useFindingDetailController.ts',
  'features/findings/components/FindingDetail/FindingRequestTaskDraftHost.tsx',
  'features/findings/public.ts',
  'operator-screens/finding-detail/index.ts',
];

const bannedSpecifiers = new Set(['@/lib/api', 'sonner', '@tanstack/react-router']);

function importSources(source: string): string[] {
  return [
    ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*(?:\(\s*)?['"]([^'"]+)['"]/g),
  ].map((match) => match[1] ?? match[2] ?? '');
}

function resolveSourceModule(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? path.resolve(sourceRoot, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (base === null) return null;

  const relativeBase = path.relative(sourceRoot, base);
  if (
    relativeBase === '..' ||
    relativeBase.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeBase)
  ) {
    return null;
  }

  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return (
    candidates.find((candidate) => {
      try {
        return readFileSync(candidate, 'utf8') !== undefined;
      } catch {
        return false;
      }
    }) ?? null
  );
}

describe('Finding detail bridge imports', () => {
  it('keeps the reached Finding detail leaves free of host-bound imports', () => {
    expect(entryModules).toHaveLength(20);
    const reached = new Set(entryModules.map((entry) => path.join(sourceRoot, entry)));
    const pending = [...reached];
    const violations: string[] = [];

    while (pending.length > 0) {
      const file = pending.pop();
      if (file === undefined) continue;
      const relativePath = path.relative(sourceRoot, file).split(path.sep).join('/');
      if (relativePath === 'lib/api/index.ts')
        violations.push(`${relativePath}: reached API barrel`);

      for (const specifier of importSources(readFileSync(file, 'utf8'))) {
        if (bannedSpecifiers.has(specifier)) {
          violations.push(`${relativePath}: banned ${specifier}`);
        }

        const target = resolveSourceModule(file, specifier);
        const targetPath =
          target === null ? '' : path.relative(sourceRoot, target).split(path.sep).join('/');
        if (targetPath === 'lib/router' || targetPath.startsWith('lib/router/')) {
          violations.push(`${relativePath}: router module ${specifier}`);
        }
        if (
          targetPath.startsWith('lib/auth/') ||
          targetPath === 'lib/cross-system/usePermissionCheck.ts'
        ) {
          violations.push(`${relativePath}: host-bound module ${specifier}`);
        }
        if (target === null || reached.has(target)) continue;
        reached.add(target);
        pending.push(target);
      }
    }

    expect(violations).toEqual([]);
  });
});
