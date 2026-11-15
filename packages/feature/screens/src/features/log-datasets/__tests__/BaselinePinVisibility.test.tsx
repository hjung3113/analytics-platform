import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BaselinePanel } from '../BaselinePanel';
import type { Baseline, Dataset, ProfilePin, ScreenProps } from '../contracts';

const owner = { id: 'synthetic-actor', displayName: 'Synthetic author' };
const dataset: Dataset = { id: 'synthetic-dataset', name: 'Synthetic dataset', purpose: 'Testing', owner, shareScope: 'workspace', modelIds: [], scenarioTags: [], status: 'active', synthetic: true, revisionCount: 1, latestRevisionSeq: 1, version: '1', createdAt: '2026-11-15T00:00:00Z', updatedAt: '2026-11-15T00:00:00Z' };
it.each([
  [{ specPinHidden: true }, 'Spec 확인 불가(읽기 권한 없음)'],
  [{}, 'Spec 미고정'],
  [{ specPin: { modelId: 'model', softwareId: null, revisionId: 'revision', changeSetDigest: 'digest' } }, 'Spec revision'],
] satisfies [ProfilePin, string][])('distinguishes hidden, unpinned and visible Spec pins (%j)', (profilePin, text) => {
  const baseline: Baseline = { id: 'baseline', datasetId: dataset.id, datasetRevisionId: 'revision', seq: 1, status: 'draft', profilePin, expectationCount: 0, scopeCount: 0, author: owner, approvedBy: null, approvedAt: null, version: '1', stale: null, expectedScope: [], expectations: [], events: [] };
  const props: ScreenProps = {
    api: { useRead: <T,>(name: string) => ({ status: 'done', data: (name === 'baselines' ? { rows: [baseline] } : baseline) as T, retry: vi.fn() }), useAction: () => ({ pending: false, run: vi.fn() }) },
    ui: { table: () => null, page: p => p.children, cellLink: p => p.children, drawer: p => p.body, timeline: () => null, trust: () => null },
    actorId: owner.id, canManage: true, canApprove: true, canRun: true, navigate: vi.fn(),
  };
  render(<BaselinePanel {...props} dataset={dataset} revisionId="revision" />);
  expect(screen.getByText(new RegExp(text.replace(/[()]/g, '\\$&')))).toBeVisible();
  if ('specPinHidden' in profilePin && profilePin.specPinHidden) expect(screen.queryByText(/Spec 미고정/)).not.toBeInTheDocument();
});
