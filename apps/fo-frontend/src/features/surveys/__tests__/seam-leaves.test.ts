// Temporary #764r1 source guard. 764l/q should remove this after fo-entry-graph.test.ts covers the same files.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SURVEYS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  'components/SurveyStatusConfirmationDialog.tsx',
  'components/list/SurveyList.tsx',
  'components/builder/hooks/useSurveyBuilderController.ts',
  'hooks/useCreateFindingFromSurveyResponse.ts',
  'hooks/useOutcomeFollowUp.ts',
  'components/results/OutcomeFollowUpReview.tsx',
  'components/create/CreateSurveyDialog.tsx',
  'routes/SurveyPermissionGate.ts',
  'components/detail/SurveyDetail.tsx',
  'components/results/SurveyResultHeader.tsx',
  'components/results/SurveyResultsSummary.tsx',
  'hooks/useSurveyResultsController.ts',
  'routes/SurveyFollowUpRoute.tsx',
  'components/builder/hooks/useBuilderDirtyGuard.ts',
] as const;

const FORBIDDEN = [
  "from '@/lib/api'",
  "from 'sonner'",
  '@tanstack/react-router',
  '@/lib/router/',
  '@/lib/auth/useMe',
  "@/lib/cross-system/usePermissionCheck'",
] as const;

describe('survey seam leaves', () => {
  it('keeps the named sources free of host-specific imports', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(14);

    for (const relativePath of SOURCES) {
      const source = readFileSync(path.join(SURVEYS_ROOT, relativePath), 'utf8');
      for (const forbidden of FORBIDDEN) {
        expect(source, `${relativePath} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
