// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { manifests } from '../../index';
import type { ConceptMappingRow, ModelSpecData } from '../../endpoints';
import SpecScreen from './SpecScreen';
import { SubjectChips } from '../items/ItemSubjects';
const modelId = '00000003-0000-4000-8000-000000000008';
const registry = createRegistry({ permissions: [menuPermission('knowledge:spec-publish'), menuPermission('knowledge:catalog-manage'), menuPermission('knowledge:item-publish')], spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '로그', en: 'Log' }, homeMenuId: 'log-knowledge-models' }], groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }], menus: manifests });
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'bounded' }) as ApiResponse<never>;
const spec: ModelSpecData = { revision: { id: 'r', modelId, revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Spec', docVersion: '1' }, contentSha256: null, publishedAt: null, publishedBy: null }, modules: [{ id: 'm', moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }], events: [{ id: 'e', moduleId: 'm', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'On move', detailDocRef: null }], relations: [] };
const member = (id: number, patch: Partial<ConceptMappingRow> = {}): ConceptMappingRow => ({ id: `row-${id}`, conceptId: `concept-${id}`, conceptLabel: `Concept ${id}`, kind: 'event', modelId, modelName: 'A', targetKind: 'event', targetKey: 'ROBOT/MOVE', targetName: 'Move', targetState: 'present', relationKind: 'equivalent', reviewState: 'proposed', origin: 'human', similarityScore: null, similarityBasis: null, rejectReason: null, proposedBy: 'admin', proposedAt: '2026-11-01T00:00:00Z', reviewedBy: null, reviewedAt: null, version: 1, ...patch });
let restore = () => {};
afterEach(() => { cleanup(); restore(); });
function Slot() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
function mount(search = '&tab=concept', child?: React.ReactNode, specification = spec) {
  restore = stubCompactTableGeometry();
  const reads: MenuQuery[] = [];
  const rows = [...Array.from({ length: 25 }, (_, i) => member(i)), ...Array.from({ length: 25 }, (_, i) => member(100 + i, { reviewState: 'confirmed' })), ...Array.from({ length: 250 }, (_, i) => member(1000 + i, { modelId: `unrelated-${i}` })), ...Array.from({ length: 25 }, (_, i) => member(2000 + i, { conceptId: `concept-${i}`, modelId: `partner-${i}` }))];
  const session = testSession(['platform:view', 'knowledge:spec-publish']);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => {
    reads.push(req); const p = req.params as Record<string, string | number>;
    if (req.endpoint === 'logKnowledge.modelSpec') return ok(specification);
    if (req.endpoint === 'logKnowledge.conceptMappings') {
      const found = rows.filter(r => (!p.modelId || r.modelId === p.modelId) && (!p.conceptId || r.conceptId === p.conceptId) && (!p.kind || r.kind === p.kind) && (!p.reviewState || r.reviewState === p.reviewState));
      return ok({ rows: found.slice(Number(p.page) * Number(p.pageSize), (Number(p.page) + 1) * Number(p.pageSize)), total: found.length });
    }
    return ok({ rows: [], total: 0 });
  } });
  window.history.replaceState(null, '', `/logDev/log-knowledge-spec/${modelId}?v=1&scopeId=MEM${search}`);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><DetailPanelSlotProvider>{child ?? <SpecScreen params={{ modelId }} />}<Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
  return reads;
}
it('pages only the current model queue/history and reads membership and definitions only for visible cards', async () => {
  const reads = mount(); await screen.findByRole('article', { name: '검토 row-0' });
  await waitFor(() => expect(reads.filter(r => r.endpoint === 'logKnowledge.modelSpec' && String((r.params as { modelId: string }).modelId).startsWith('partner-'))).toHaveLength(10));
  const mappings = reads.filter(r => r.endpoint === 'logKnowledge.conceptMappings');
  expect(mappings.every(r => { const p = r.params as Record<string, unknown>; return p.modelId === modelId || typeof p.conceptId === 'string'; })).toBe(true);
  expect(mappings.filter(r => (r.params as { modelId?: string }).modelId === modelId).map(r => r.params)).toEqual(expect.arrayContaining(['proposed', 'confirmed', 'rejected'].map(reviewState => ({ modelId, reviewState, page: 0, pageSize: 20 }))));
  await waitFor(() => expect(reads.filter(r => r.endpoint === 'logKnowledge.conceptMappings' && (r.params as { conceptId?: string }).conceptId)).toHaveLength(20));
  expect(mappings.every(r => (r.params as { page: number }).page === 0)).toBe(true);
  expect(reads.some(r => r.endpoint === 'logKnowledge.modelSpec' && String((r.params as { modelId: string }).modelId).startsWith('unrelated-'))).toBe(false);
  const history = screen.getByRole('region', { name: '확정·거절 이력' });
  fireEvent.click(within(history).getByRole('button', { name: '다음' }));
  await screen.findByRole('article', { name: '검토 row-110' });
  await waitFor(() => expect(reads.filter(r => r.endpoint === 'logKnowledge.conceptMappings' && (r.params as Record<string, unknown>).reviewState === 'confirmed')).toHaveLength(1));
  fireEvent.click(within(history).getByRole('button', { name: '다음' }));
  await screen.findByRole('article', { name: '검토 row-120' });
  expect(reads.some(r => r.endpoint === 'logKnowledge.conceptMappings' && (r.params as Record<string, unknown>).reviewState === 'confirmed' && (r.params as Record<string, unknown>).page === 1)).toBe(true);
});
it('the active Event proposer reads one bounded first page of existing event concepts', async () => {
  const reads = mount('&tab=spec&event=ROBOT%2FMOVE');
  fireEvent.click(await screen.findByRole('button', { name: '개념 제안' }));
  await screen.findByRole('region', { name: '개념 제안 양식' });
  await waitFor(() => expect(reads.filter(r => r.endpoint === 'logKnowledge.conceptMappings' && (r.params as { kind?: string }).kind === 'event')).toHaveLength(1));
  expect(reads.find(r => r.endpoint === 'logKnowledge.conceptMappings' && (r.params as { kind?: string }).kind === 'event')!.params).toEqual({ kind: 'event', page: 0, pageSize: 200 });
});

it('a real module chip navigates with the raw %, / and # key and selects the destination module', async () => {
  const raw = 'ROBOT%/ARM#1', escaped = 'ROBOT%25%2FARM%231';
  const special: ModelSpecData = { ...spec, modules: [{ ...spec.modules[0]!, moduleKey: raw, name: 'Special module' }] };
  mount('&tab=spec', <><SubjectChips subjects={[{ modelId, modelName: 'A', targetKind: 'module', targetKey: escaped, targetName: 'Special module', state: 'resolved', subjectRelation: 'about', specRevNoAtLink: 1 }]} /><SpecScreen params={{ modelId }} /></>, special);
  const chip = await screen.findByRole('link', { name: 'A · Special module' });
  let nativeHref: string | null = null;
  window.addEventListener('click', event => { if (!event.defaultPrevented) nativeHref = chip.getAttribute('href'); event.preventDefault(); }, { once: true });
  fireEvent.click(chip);
  expect(nativeHref).not.toBeNull();
  expect(new URL(nativeHref!, window.location.origin).searchParams.get('module')).toBe(raw);
  // Follow the native document link, then mount the real destination on that address.
  cleanup(); restore();
  mount('&tab=spec&module=' + encodeURIComponent(raw), undefined, special);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Special module' }).getAttribute('aria-pressed')).toBe('true'));
  expect(await screen.findByRole('button', { name: 'Move' })).toBeTruthy();
});
// jsdom supplies no native keyboard activation; dispatch the keyboard sequence and its default button click.
function enter(button: HTMLElement) {
  button.focus(); fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
  fireEvent.click(button, { detail: 0 }); fireEvent.keyUp(button, { key: 'Enter', code: 'Enter' });
}
it('keyboard reject then cancel returns focus to that card reject control', async () => {
  mount(); const card = await screen.findByRole('article', { name: '검토 row-0' });
  const reject = within(card).getByRole('button', { name: '거절' }); enter(reject);
  enter(within(card).getByRole('button', { name: '취소' }));
  expect(document.activeElement).toBe(reject);
});
it('keyboard filter removal moves focus to the concept review heading', async () => {
  mount('&tab=concept&event=ROBOT%2FMOVE');
  enter(await screen.findByRole('button', { name: '필터 해제' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '개념 매핑 검토' })));
});
