// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import { type ModelSpecData, type SpecChangeRow } from '../../endpoints';
import SpecScreen from './SpecScreen';
import { knowledgeRegistry, mountWith } from '../test-support';
const modelId = '00000003-0000-4000-8000-000000000008', sw = '00000004-0000-4000-8000-00000000000e', rev = '00000007-0000-4000-8000-000000000001';
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'spec-test' }) as ApiResponse<never>;
const spec: ModelSpecData = { revision: { id: rev, modelId, revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Spec', docVersion: '1' }, contentSha256: 'a'.repeat(64), publishedAt: '2026-11-01T00:00:00Z', publishedBy: 'admin' }, modules: [{ id: 'm1', moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }, { id: 'm2', moduleKey: 'ARM', name: 'Arm', parentModuleId: 'm1' }], events: [{ id: 'e1', moduleId: 'm2', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'on move', detailDocRef: null }], relations: [] };
const change: SpecChangeRow = { id: '00000007-0000-4000-8000-000000000002', softwareId: sw, softwareLabel: 'v1.0', endsBeforeSoftwareId: null, endsBeforeLabel: null, targetKind: 'event', targetKey: 'ARM/MOVE', changeKind: 'behavior', change: {}, note: 'timing', evidenceRef: null, basedOnRevNo: 1, needsRevalidation: true, revalidationRevNo: 2, retiredAt: null, retiredBy: null, retiredByChangeId: null, createdAt: '2026-11-01T00:00:00Z', createdBy: 'admin', version: 1 };
const registry = knowledgeRegistry(['knowledge:spec-publish', 'knowledge:catalog-manage'], { description: { ko: '로그 개발', en: 'Log development' }, homeMenuId: 'log-knowledge-models' });
let queries: MenuQuery[], writes: MenuAction[], result: ApiResponse<unknown> | null, allowed: boolean, conflict: boolean, saveInvalid: boolean;
let extraChanges: SpecChangeRow[];
let restoreGeometry: () => void;
beforeEach(() => { restoreGeometry = stubCompactTableGeometry(); HTMLElement.prototype.scrollIntoView = vi.fn(); queries = []; writes = []; result = ok(spec); allowed = true; conflict = false; saveInvalid = false; extraChanges = []; });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks();
  // eslint-disable-next-line no-restricted-syntax -- the kernel owns web storage; the test resets the faked seam it reads
  window.localStorage?.removeItem?.('platform:lang');
});
/** This jsdom has no localStorage; the language preference seam needs a stand-in for `initialLang`. */
const memoryLang = (lang: 'ko' | 'en') => {
  let value: string = lang;
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => value, setItem: (_key: string, next: string) => { value = next; }, removeItem: () => { value = 'ko'; } } });
};
function mount(search = '', draft: Record<string, unknown> | null = null, id = modelId) {
  window.history.replaceState(null, '', `/logDev/log-knowledge-spec/${id}?v=1${search}`);
  const session = testSession(allowed ? ['platform:view', 'knowledge:spec-publish'] : ['platform:view']);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => {
    queries.push(req);
    if (req.endpoint === 'logKnowledge.modelSpec') return result === null ? new Promise(() => {}) : result as ApiResponse<never>;
    if (req.endpoint === 'logKnowledge.softwareVersions') return ok({ rows: [{ id: sw, versionLabel: 'v1.0', releaseOrder: 1 }], total: 1 });
    if (req.endpoint === 'logKnowledge.specChanges') return ok({ rows: [change, ...extraChanges], total: 1 + extraChanges.length });
    if (req.endpoint === 'logKnowledge.modelSpecRevisions') return ok({ rows: [{ id: rev, revisionNo: 2, state: 'draft', version: 1 }], total: 1 });
    if (req.endpoint === 'logKnowledge.specDraft') return ok(draft ?? { ...spec, revision: { ...spec.revision, state: 'draft', version: 1 } });
    return ok(null);
  }, menuAction: async req => { writes.push(req); return saveInvalid ? { outcome: 'invalid', fieldErrors: [{ path: ['text'], code: 'malformed' }] } as unknown as ActionResponse<never> : (conflict ? { outcome: 'conflict', currentVersion: '2' } : { outcome: 'ok', data: { revisionId: rev, version: '2' }, version: '2' }) as unknown as ActionResponse<never>; } });
  return mountWith({ registry, adapter, ui: <SpecScreen params={{ modelId: id }} />, slot: true });
}
describe('production model spec screen', () => {
  it('accepts ids in any spelling: an upper-case model id and software id deep link opens the spec', async () => {
    mount(`&software=${sw.toUpperCase()}`, null, modelId.toUpperCase());
    expect(await screen.findByRole('button', { name: 'Move' })).toBeTruthy();
    expect(screen.queryByText(/지원하지 않는|올바르지 않/)).toBeNull();
    await waitFor(() => expect(queries.some(q => q.endpoint === 'logKnowledge.modelSpec')).toBe(true));
  });
  it('collapses the tree and keeps the selected path visible', async () => {
    mount('&module=ARM'); await screen.findByRole('button', { name: 'Move' });
    fireEvent.click(screen.getByRole('button', { name: 'Module 트리 접기' }));
    expect(screen.getByText('Robot / Arm')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Module 계층' })).toBeNull();
  });
  it('reads the effective spec when a software version is selected', async () => {
    mount(); await screen.findByLabelText('SW 버전');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'SW 버전' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: '1. v1.0' }));
    await waitFor(() => expect(queries.some(q => q.endpoint === 'logKnowledge.modelSpec' && (q.params as Record<string, unknown>).softwareId === sw)).toBe(true));
    expect(window.location.search).toContain(`software=${sw}`);
  });
  it('opens the change tab, filters revalidation and preserves URL state', async () => {
    mount('&tab=changes'); await screen.findByText('ARM/MOVE');
    fireEvent.click(screen.getByLabelText('재검토 필요만'));
    await waitFor(() => expect(queries.some(q => q.endpoint === 'logKnowledge.specChanges' && (q.params as Record<string, unknown>).needsRevalidation === true)).toBe(true));
  });
  it('shows effective marks, a removed target and an unapplied ghost', async () => {
    result = ok({ ...spec, effective: true, softwareId: sw,
      modules: spec.modules.map(m => ({ ...m, parentModuleKey: m.parentModuleId ? 'ROBOT' : null, origin: 'revision', changed: [], needsRevalidation: false })),
      events: spec.events.map(e => ({ ...e, moduleKey: 'ARM', origin: 'revision', changed: [{ changeId: 'added', changeKind: 'added', targetKind: 'event', targetKey: 'ARM/MOVE' }], needsRevalidation: false })),
      removed: [{ changeId: 'removed', changeKind: 'removed', targetKind: 'event', targetKey: 'ARM/OLD', needsRevalidation: false }],
      stale: [{ changeId: 'ghost', changeKind: 'behavior', targetKind: 'event', targetKey: 'ARM/GHOST', reason: 'gone', needsRevalidation: true }],
    });
    mount('&software=' + sw); expect(await screen.findByText('ARM/OLD')).toBeTruthy();
    expect(screen.getByText(/ARM\/GHOST/)).toBeTruthy();
    expect(await screen.findByText('추가', { exact: true })).toBeTruthy();
  });
  it('offers a read-only reason without the publish capability', async () => {
    allowed = false; mount(); expect(await screen.findByText(/명세 관리 권한을 관리자에게 요청하세요/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '초안 편집' })).toBeNull();
  });
  it('explains the hash seal and revalidation before publication, with an external footer', async () => {
    mount('&drawer=draft&revision=' + rev); await screen.findByLabelText('명세 TSV');
    const publish = screen.getByRole('button', { name: '발행' });
    expect(publish.closest('[role="region"]')).toBeNull();
    fireEvent.click(publish); expect(await screen.findByText(/해시로 봉인/)).toBeTruthy();
    expect(screen.getByText(/열린 변경점/)).toBeTruthy();
  });
  it.each([
    ['add', '변경점 추가', '추가'], ['retire', '변경점 닫기·대체', '확인'], ['confirm', '변경점 재검토 확인', '확인'],
  ])('keeps %s change actions outside the scrolling body', async (mode, title, action) => {
    mount(`&tab=changes&drawer=${mode}&change=${change.id}`);
    const dialog = await screen.findByRole('dialog', { name: title });
    const button = within(dialog).getByRole('button', { name: action });
    expect(button.closest('[role="region"]')).toBeNull();
    expect(button.parentElement?.parentElement?.className).toContain('shrink-0');
  });
  it('preserves draft input on conflict and requires recovery before another write', async () => {
    conflict = true; mount('&drawer=draft&revision=' + rev); const input = await screen.findByLabelText('명세 TSV');
    fireEvent.change(input, { target: { value: 'kind\tmodule\nmodule\tKept' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('button', { name: '최신 확인 후 새 초안 작성' })).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toContain('Kept');
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
    expect(writes[0]?.expectedVersion).toBe('1');
  });
  it.each(['empty', 'loading', 'error', 'forbidden'] as const)('renders the %s state', async state => {
    result = state === 'empty' ? ok(null) : state === 'loading' ? null : { ...ok(null), outcome: state === 'forbidden' ? 'forbidden' : 'error' };
    mount(); expect(await screen.findByText({ empty: '발행된 모델 명세가 없습니다', loading: '명세를 불러오는 중…', error: '명세를 불러오지 못했습니다', forbidden: '명세를 볼 권한이 없습니다' }[state])).toBeTruthy();
  });

  // C1: a loaded draft saves through the structured snapshot, so stored tabs/newlines never enter unquoted TSV.
  it('saves a loaded draft as structured rows so tabs and newlines survive a metadata-only save', async () => {
    mount('&drawer=draft&revision=' + rev, {
      ...spec,
      revision: { ...spec.revision, state: 'draft', version: 1 },
      events: [{ id: 'e1', moduleId: 'm2', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'first\nsecond', detailDocRef: null }],
    });
    await screen.findByLabelText('명세 TSV');
    fireEvent.change(screen.getByLabelText('문서 버전*'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    const payload = writes[0]?.input as Record<string, unknown>;
    expect(payload['text']).toBeUndefined();
    expect(payload['mode']).toBe('replace');
    expect(payload['modules']).toEqual([{ name: 'Robot', parentModule: null }, { name: 'Arm', parentModule: 'Robot' }]);
    expect(payload['events']).toEqual([{ module: 'Arm', name: 'Move', fields: [], triggerRule: 'first\nsecond', detailDocRef: null }]);
  });

  // C5: tab and SW navigation may not unmount a dirty editor without the discard confirmation.
  it('routes tab navigation through the discard guard while the draft is dirty', async () => {
    mount('&drawer=draft&revision=' + rev);
    const input = await screen.findByLabelText('명세 TSV');
    fireEvent.change(input, { target: { value: 'kind\tmodule\nmodule\tKept' } });
    const tab = screen.getByRole('tab', { name: '변경점' });
    fireEvent.mouseDown(tab); // Radix Tabs activate on mousedown
    fireEvent.click(tab);
    const dialog = await screen.findByRole('dialog', { name: '저장하지 않은 입력을 버릴까요?' });
    expect((screen.getByLabelText('명세 TSV') as HTMLTextAreaElement).value).toContain('Kept');
    fireEvent.click(within(dialog).getByRole('button', { name: '계속 편집' }));
    expect(screen.queryByRole('dialog', { name: '저장하지 않은 입력을 버릴까요?' })).toBeNull();
    expect(window.location.search).not.toContain('tab=changes');
    expect((screen.getByLabelText('명세 TSV') as HTMLTextAreaElement).value).toContain('Kept');
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    fireEvent.click(within(await screen.findByRole('dialog', { name: '저장하지 않은 입력을 버릴까요?' })).getByRole('button', { name: '버리고 이동' }));
    await waitFor(() => expect(window.location.search).toContain('tab=changes'));
    expect(screen.queryByLabelText('명세 TSV')).toBeNull();
  });

  // C6: an overlay write that keeps the published revision must still refresh the local Event table.
  it('reloads the event table after a same-revision write', async () => {
    const effective = (changeKind: 'added' | 'changed') => ok({
      ...spec, effective: true, softwareId: sw,
      modules: spec.modules.map(m => ({ ...m, parentModuleKey: m.parentModuleId ? 'ROBOT' : null, origin: 'revision' as const, changed: [], needsRevalidation: false })),
      events: spec.events.map(e => ({ ...e, moduleKey: 'ARM', origin: 'revision' as const, changed: [{ changeId: 'x', changeKind, targetKind: 'event' as const, targetKey: 'ARM/MOVE' }], needsRevalidation: false })),
      removed: [], stale: [],
    });
    result = effective('added');
    mount(`&software=${sw}&drawer=confirm&change=${change.id}`);
    await screen.findByRole('dialog', { name: '변경점 재검토 확인' });
    expect(await screen.findByText('추가', { exact: true })).toBeTruthy();
    result = effective('changed');
    fireEvent.click(within(screen.getByRole('dialog', { name: '변경점 재검토 확인' })).getByRole('button', { name: '확인' }));
    // The reload replaces the badge; '추가' can be gone a render before '변경' paints, so wait for both.
    await waitFor(() => {
      expect(screen.queryByText('추가', { exact: true })).toBeNull();
      expect(screen.getAllByText('변경', { exact: true }).length).toBeGreaterThan(0);
    });
  });

  // C8: a viewer must not get a button whose drawer never renders for them.
  it('keeps the replacement record as text for read-only viewers', async () => {
    extraChanges = [{ ...change, id: '00000007-0000-4000-8000-000000000009', needsRevalidation: false, retiredAt: '2026-11-01T09:00:00Z', retiredByChangeId: '00000007-0000-4000-8000-000000000002' }];
    allowed = false;
    mount('&tab=changes');
    await screen.findAllByText('ARM/MOVE');
    expect(screen.queryByRole('button', { name: /대체 기록/ })).toBeNull();
    expect(screen.getAllByText(/00000007-0000-4000-8000-000000000002/).length).toBeGreaterThan(0);
  });

  // UX C2: the spec screen formats its timestamps in the active language, not a fixed ko.
  it.each(['ko', 'en'] as const)('formats spec timestamps in the active language (%s)', async lang => {
    memoryLang(lang);
    const view = mount();
    await screen.findByText('Move');
    const text = view.container.textContent ?? '';
    if (lang === 'ko') {
      expect(text).toMatch(/\d{2}\. \d{1,2}\. \d{1,2}\./);
      expect(text).not.toMatch(/\d+\/\d+\/\d+/);
    } else {
      expect(text).toMatch(/\d+\/\d+\/\d+/);
      expect(text).not.toContain('오전');
    }
  });

  // UX C3: every dialog names its close button in the active language.
  it('localizes the publication dialog close name', async () => {
    memoryLang('en');
    mount('&drawer=draft&revision=' + rev);
    await screen.findByLabelText('Specification TSV');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish specification?' });
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
  });
  it('localizes the change discard dialog close name', async () => {
    memoryLang('en');
    mount(`&tab=changes&drawer=retire&change=${change.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Retire or replace change' });
    fireEvent.click(within(dialog).getByLabelText('Replace with a new change for the same target'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const discard = await screen.findByRole('dialog', { name: 'Discard unsaved input?' });
    expect(within(discard).getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  // A2: hints, required marks and validation messages are wired to the fields they belong to.
  it('wires the TSV hint and required marks to their fields', async () => {
    mount('&drawer=draft&revision=' + rev);
    const input = await screen.findByLabelText('명세 TSV');
    const label = screen.getByLabelText('원본 문서*');
    const version = screen.getByLabelText('문서 버전*');
    expect(label.getAttribute('aria-required')).toBe('true');
    expect(version.getAttribute('aria-required')).toBe('true');
    const hintId = input.getAttribute('aria-describedby')?.split(' ')[0] ?? '';
    expect(document.getElementById(hintId)?.textContent).toContain('kind: module / event / relation.');
  });
  it('attaches server validation errors to the field that failed', async () => {
    saveInvalid = true;
    mount('&drawer=draft&revision=' + rev);
    const input = await screen.findByLabelText('명세 TSV');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    const alert = (input.getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)).find(el => el?.getAttribute('role') === 'alert');
    expect(alert?.textContent).toContain('형식');
  });
  it('attaches JSON errors to the change field that failed', async () => {
    mount(`&tab=changes&drawer=add&change=${change.id}`);
    const target = await screen.findByLabelText('대상 (JSON)');
    fireEvent.change(target, { target: { value: 'not json' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: '변경점 추가' })).getByRole('button', { name: '추가' }));
    await waitFor(() => expect(target.getAttribute('aria-invalid')).toBe('true'));
    const alert = (target.getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)).find(el => el?.getAttribute('role') === 'alert');
    expect(alert?.textContent).toBeTruthy();
  });
});
