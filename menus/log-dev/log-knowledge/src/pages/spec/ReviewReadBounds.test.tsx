// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import { createBasePathLocation } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import type { ConceptMappingRow, ConceptSuggestion, ModelSpecData } from '../../endpoints';
import SpecScreen from './SpecScreen';
import { SubjectChips } from '../items/ItemSubjects';
import { knowledgeRegistry, mountWith } from '../test-support';
const modelId = '00000003-0000-4000-8000-000000000008', partner = '00000003-0000-4000-8000-000000000009';
const registry = knowledgeRegistry(['knowledge:spec-publish', 'knowledge:catalog-manage', 'knowledge:item-publish'], { description: { ko: '로그', en: 'Log' }, homeMenuId: 'log-knowledge-models' });
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'bounds' }) as ApiResponse<never>;
const spec: ModelSpecData = { revision: { id: 'r', modelId, revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Spec', docVersion: '1' }, contentSha256: null, publishedAt: null, publishedBy: null }, modules: [{ id: 'm', moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }], events: [{ id: 'e', moduleId: 'm', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'On move', detailDocRef: null }], relations: [] };
const row = (id: string, patch: Partial<ConceptMappingRow> = {}): ConceptMappingRow => ({ id, conceptId: `c-${id}`, conceptLabel: `Concept ${id}`, kind: 'event', modelId, modelName: 'A', targetKind: 'event', targetKey: 'ROBOT/MOVE', targetName: 'Move', targetState: 'present', relationKind: 'equivalent', reviewState: 'proposed', origin: 'human', similarityScore: null, similarityBasis: null, rejectReason: null, proposedBy: 'admin', proposedAt: '2026-11-01T00:00:00Z', reviewedBy: null, reviewedAt: null, version: 1, ...patch });
const suggestion: ConceptSuggestion = { kind: 'event', source: { modelId, targetKey: 'ROBOT/MOVE', name: 'Move' }, candidate: { modelId: partner, modelName: 'B', targetKey: 'ROBOT/MOVE', name: 'Move' }, score: 1, basis: { name_trgm: 1 }, proposal: true };
let restore = () => {};
afterEach(() => { cleanup(); restore(); });
type Setup = { rows?: ConceptMappingRow[]; suggestions?: ConceptSuggestion[]; fail?: (p: Record<string, unknown>) => string | null; child?: React.ReactNode; basePath?: string };
function mount(search: string, setup: Setup = {}) {
  restore = stubCompactTableGeometry();
  const reads: MenuQuery[] = [], writes: MenuAction[] = [], rows = setup.rows ?? [];
  const session = testSession(['platform:view', 'knowledge:spec-publish']);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => {
    reads.push(req); const p = req.params as Record<string, string | number>;
    if (req.endpoint === 'logKnowledge.modelSpec') return ok(spec);
    if (req.endpoint === 'logKnowledge.conceptSuggestions') return ok({ rows: setup.suggestions ?? [], total: (setup.suggestions ?? []).length });
    if (req.endpoint === 'logKnowledge.conceptMappings') {
      const failed = setup.fail?.(p); if (failed) return { ...ok(null), outcome: failed } as ApiResponse<never>;
      const found = rows.filter(r => (!p.modelId || r.modelId === p.modelId) && (!p.conceptId || r.conceptId === p.conceptId) && (!p.kind || r.kind === p.kind) && (!p.reviewState || r.reviewState === p.reviewState));
      return ok({ rows: found.slice(Number(p.page) * Number(p.pageSize), (Number(p.page) + 1) * Number(p.pageSize)), total: found.length });
    }
    return ok({ rows: [], total: 0 });
  }, menuAction: async req => {
    writes.push(req);
    if (req.action === 'logKnowledge.conceptPropose') {
      const created = [row('n1', { conceptId: 'new-c' }), row('n2', { conceptId: 'new-c', modelId: partner, modelName: 'B' })]; rows.push(...created);
      return { outcome: 'ok', data: { conceptId: 'new-c', mappingId: 'n1', pairMappingId: 'n2' }, fieldErrors: [] } as unknown as ActionResponse<never>;
    }
    return { outcome: 'ok', data: { mappingId: 'x' }, fieldErrors: [] } as unknown as ActionResponse<never>;
  } });
  const base = setup.basePath ?? '';
  window.history.replaceState(null, '', `${base}/logDev/log-knowledge-spec/${modelId}?v=1&scopeId=MEM${search}`);
  mountWith({ registry, adapter, ui: setup.child ?? <SpecScreen params={{ modelId }} />, slot: true, ...(base ? { location: createBasePathLocation(base) } : {}) });
  return { reads, writes };
}
const targetReads = (reads: MenuQuery[]) => reads.filter(r => r.endpoint === 'logKnowledge.conceptMappings' && (r.params as { kind?: string }).kind === 'event' && (r.params as { modelId?: string }).modelId && (r.params as { reviewState?: string }).reviewState && (r.params as { pageSize: number }).pageSize === 50);
const cardName = `검토 suggestion-ROBOT/MOVE-${partner}-ROBOT/MOVE`;

it('confirming a computed suggestion resolves its two targets with a bounded, filtered read', async () => {
  const { reads, writes } = mount('&tab=concept', { suggestions: [suggestion] });
  const card = await screen.findByRole('article', { name: cardName }); const before = reads.length;
  fireEvent.click(within(card).getByRole('button', { name: '같은 개념으로 확정' }));
  await waitFor(() => expect(writes.map(w => w.action)).toEqual(['logKnowledge.conceptPropose', 'logKnowledge.conceptConfirm', 'logKnowledge.conceptConfirm']));
  const actionReads = targetReads(reads.slice(before));
  // Two models × two open states × one small page; no unfiltered 200-row model drain.
  expect(actionReads.map(r => r.params)).toEqual([modelId, partner].flatMap(m => ['proposed', 'confirmed'].map(reviewState => ({ modelId: m, kind: 'event', reviewState, page: 0, pageSize: 50 }))));
  expect(reads.slice(before).filter(r => r.endpoint === 'logKnowledge.conceptMappings' && (r.params as { pageSize: number }).pageSize === 200 && !(r.params as { conceptId?: string }).conceptId)).toHaveLength(0);
});
it('refuses a computed decision whose target membership exceeds the read ceiling instead of reading every page', async () => {
  const many = Array.from({ length: 400 }, (_, i) => row(`m${i}`, { targetKey: `ROBOT/OTHER${i}`, reviewState: 'confirmed' }));
  const { reads, writes } = mount('&tab=concept', { suggestions: [suggestion], rows: many });
  const card = await screen.findByRole('article', { name: cardName }); const before = reads.length;
  fireEvent.click(within(card).getByRole('button', { name: '같은 개념으로 확정' }));
  expect(await within(card).findByText(/결과를 확인하지 못했습니다/)).toBeTruthy();
  expect(writes).toHaveLength(0);
  expect(targetReads(reads.slice(before)).length).toBeLessThanOrEqual(2 * 2 * 2);
  expect(targetReads(reads.slice(before)).every(r => (r.params as { page: number }).page < 2)).toBe(true);
});
it('a raw-key fallback link keeps the deployment base path', async () => {
  const raw = 'ROBOT%/ARM#1', escaped = 'ROBOT%25%2FARM%231';
  mount('&tab=spec', { basePath: '/ap', child: <SubjectChips subjects={[{ modelId, modelName: 'A', targetKind: 'module', targetKey: escaped, targetName: 'Special module', state: 'resolved', subjectRelation: 'about', specRevNoAtLink: 1 }]} /> });
  const link = await screen.findByRole('link', { name: 'A · Special module' }); const href = link.getAttribute('href')!;
  expect(href.startsWith('/ap/')).toBe(true);
  expect(new URL(href, window.location.origin).searchParams.get('module')).toBe(raw);
});
it('shows a membership read failure with retry instead of an empty comparison', async () => {
  let failing = true;
  mount('&tab=concept', { rows: [row('a')], fail: p => failing && p.conceptId ? 'error' : null });
  expect(await screen.findByText('다른 모델의 대상을 불러오지 못했습니다.')).toBeTruthy();
  expect(screen.queryByText('다른 모델의 대상이 아직 없습니다.')).toBeNull(); expect(screen.queryByRole('article', { name: '검토 a' })).toBeNull();
  failing = false; fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByRole('article', { name: '검토 a' })).toBeTruthy();
});
it('shows a history read failure with retry instead of "No review history"', async () => {
  let failing = true;
  mount('&tab=concept', { rows: [row('h', { reviewState: 'confirmed' })], fail: p => failing && p.reviewState === 'confirmed' ? 'error' : null });
  expect(await screen.findByText('검토 이력을 불러오지 못했습니다.')).toBeTruthy();
  expect(screen.queryByText('검토 이력이 없습니다.')).toBeNull();
  failing = false; fireEvent.click(within(screen.getByRole('region', { name: '확정·거절 이력' })).getByRole('button', { name: '다시 시도' }));
  await waitFor(() => expect(screen.queryByText('검토 이력을 불러오지 못했습니다.')).toBeNull());
});
