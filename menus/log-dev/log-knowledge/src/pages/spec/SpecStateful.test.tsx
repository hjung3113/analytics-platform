// @vitest-environment jsdom
// Stateful regressions of #1196 node d fix round 2: the action stub stores and reads back saves and answers distinct
// replacement revision ids, and reads can be held, so sequences (not single calls) are what is under test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { BookOpen } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ActionResponse, type ApiResponse, type FieldError } from '@ap/contracts';
import { manifests } from '../../index';
import { type ModelSpecData, type SpecChangeRow } from '../../endpoints';
import SpecScreen from './SpecScreen';

const modelId = '00000003-0000-4000-8000-000000000008', sw = '00000004-0000-4000-8000-00000000000e', rev = '00000007-0000-4000-8000-000000000001';
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'spec-test' }) as ApiResponse<never>;
const published: ModelSpecData = { revision: { id: rev, modelId, revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Spec', docVersion: '1' }, contentSha256: 'a'.repeat(64), publishedAt: '2026-11-01T00:00:00Z', publishedBy: 'admin' }, modules: [{ id: 'm1', moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }, { id: 'm2', moduleKey: 'ARM', name: 'Arm', parentModuleId: 'm1' }], events: [{ id: 'e1', moduleId: 'm2', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'on move', detailDocRef: null }], relations: [] };
const change: SpecChangeRow = { id: '00000007-0000-4000-8000-000000000002', softwareId: sw, softwareLabel: 'v1.0', endsBeforeSoftwareId: null, endsBeforeLabel: null, targetKind: 'event', targetKey: 'ARM/MOVE', changeKind: 'behavior', change: {}, note: 'timing', evidenceRef: null, basedOnRevNo: 1, needsRevalidation: true, revalidationRevNo: 2, retiredAt: null, retiredBy: null, retiredByChangeId: null, createdAt: '2026-11-01T00:00:00Z', createdBy: 'admin', version: 1 };
const registry = createRegistry({ permissions: [menuPermission('knowledge:spec-publish'), menuPermission('knowledge:catalog-manage')], spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '로그 개발', en: 'Log development' }, homeMenuId: 'log-knowledge-models' }], groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }], menus: manifests });

type Row = { module: string; name: string; triggerRule: string | null };
type Stored = { id: string; version: number; modules: { name: string; parentModule: string | null }[]; events: Row[] };
const uuid = (n: number) => `00000007-0000-4000-8000-${(0x100 + n).toString(16).padStart(12, '0')}`;
/** A stateful draft store: every save is kept and read back; a `replace` answers a NEW revision id. */
function draftStore(initial: Omit<Stored, 'id' | 'version'>) {
  const drafts = new Map<string, Stored>(), saves: Record<string, unknown>[] = [];
  let next = 0, current = { id: uuid(next), version: 1, ...structuredClone(initial) } as Stored;
  drafts.set(current.id, current);
  const parseText = (text: string): Pick<Stored, 'modules' | 'events'> => {
    const [head = '', ...lines] = text.split('\n'), cols = head.split('\t'), out: Pick<Stored, 'modules' | 'events'> = { modules: [], events: [] };
    for (const line of lines.filter(Boolean)) {
      const cells = line.split('\t'), cell = (name: string) => cells[cols.indexOf(name)] || '';
      if (cell('kind') === 'module') out.modules.push({ name: cell('module'), parentModule: cell('parent_module') || null });
      if (cell('kind') === 'event') out.events.push({ module: cell('module'), name: cell('event'), triggerRule: cell('trigger_rule') || null });
    }
    return out;
  };
  return {
    saves, firstId: current.id, current: () => current,
    read: (id: string) => {
      const d = drafts.get(id); if (!d) return null;
      const ids = new Map(d.modules.map((m, i) => [m.name, `m${i}`]));
      return { revision: { ...published.revision, id: d.id, state: 'draft' as const, version: d.version, revisionNo: 2, contentSha256: null }, modules: d.modules.map((m, i) => ({ id: `m${i}`, moduleKey: m.name.toUpperCase(), name: m.name, parentModuleId: m.parentModule ? ids.get(m.parentModule) ?? null : null })),
        events: d.events.map((e, i) => ({ id: `e${i}`, moduleId: ids.get(e.module) ?? '', eventKey: e.name.toUpperCase(), name: e.name, fields: [], triggerRule: e.triggerRule, detailDocRef: null })), relations: [] };
    },
    save: (input: Record<string, unknown>) => {
      saves.push(structuredClone(input));
      const content = typeof input['text'] === 'string' ? parseText(input['text']) : { modules: (input['modules'] ?? []) as Stored['modules'], events: ((input['events'] ?? []) as Row[]).map(e => ({ module: e.module, name: e.name, triggerRule: e.triggerRule ?? null })) };
      if (typeof input['text'] === 'string' === ((input['modules'] as unknown[] | undefined)?.length ?? 0) + ((input['events'] as unknown[] | undefined)?.length ?? 0) > 0) return { outcome: 'invalid', fieldErrors: [{ path: ['input'], code: 'rows_or_text' }] };
      current = { id: uuid(++next), version: current.version + 1, ...structuredClone(content) }; drafts.set(current.id, current);
      return { outcome: 'ok', data: { revisionId: current.id, version: String(current.version) }, version: String(current.version) };
    },
  };
}
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

let allowed: boolean, restoreGeometry: () => void;
beforeEach(() => { memoryLang('ko'); restoreGeometry = stubCompactTableGeometry(); HTMLElement.prototype.scrollIntoView = vi.fn(); allowed = true; });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks(); });
/** This jsdom has no localStorage; the language preference seam needs a stand-in for `initialLang`. */
const memoryLang = (lang: 'ko' | 'en') => Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => lang, setItem: () => undefined, removeItem: () => undefined } });
function Slot() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
type Handlers = { spec?: () => Promise<ApiResponse<never>> | ApiResponse<never>; draft?: (id: string) => unknown; action?: (name: string, input: Record<string, unknown>) => unknown };
function mount(search: string, h: Handlers) {
  window.history.replaceState(null, '', `/logDev/log-knowledge-spec/${modelId}?v=1${search}`);
  const session = testSession(allowed ? ['platform:view', 'knowledge:spec-publish'] : ['platform:view']);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => {
    if (req.endpoint === 'logKnowledge.modelSpec') return h.spec ? h.spec() : ok(published);
    if (req.endpoint === 'logKnowledge.softwareVersions') return ok({ rows: [{ id: sw, versionLabel: 'v1.0', releaseOrder: 1 }], total: 1 });
    if (req.endpoint === 'logKnowledge.specChanges') return ok({ rows: [change], total: 1 });
    if (req.endpoint === 'logKnowledge.modelSpecRevisions') return ok({ rows: [{ id: rev, revisionNo: 2, state: 'draft', version: 1 }], total: 1 });
    if (req.endpoint === 'logKnowledge.specDraft') return ok(h.draft?.(String((req.params as Record<string, unknown>)['revisionId'])) ?? null);
    return ok(null);
  }, menuAction: async req => (h.action?.(req.action.replace('logKnowledge.', ''), req.input as Record<string, unknown>) ?? { outcome: 'ok', data: { changeId: change.id }, version: '2' }) as unknown as ActionResponse<never> });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><SpecScreen params={{ modelId }} /><Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
const textarea = () => screen.getByLabelText('명세 TSV') as HTMLTextAreaElement;
const B = 'kind\tmodule\tevent\ttrigger_rule\nmodule\tArm\nevent\tArm\tMove\tsecond rule';
const A: Omit<Stored, 'id' | 'version'> = { modules: [{ name: 'Arm', parentModule: null }], events: [{ module: 'Arm', name: 'Move', triggerRule: 'first\nsecond' }] };

describe('stateful draft saves (fix C1)', () => {
  it('keeps the saved TSV content across a following metadata-only save', async () => {
    const store = draftStore(A);
    mount(`&drawer=draft&revision=${store.firstId}`, { draft: id => store.read(id), action: (name, input) => name === 'specDraftSave' ? store.save(input) : undefined });
    await screen.findByLabelText('명세 TSV', {}, { timeout: 5000 }); // the first render of the file is cold
    await waitFor(() => expect(textarea().value).toContain('Move'));
    fireEvent.change(textarea(), { target: { value: B } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    await waitFor(() => expect(window.location.search).toContain(`revision=${store.current().id}`));
    await waitFor(() => expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('문서 버전*'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(store.saves).toHaveLength(2));
    // The stored (read-back) content is B, never A: no stale snapshot replaced it.
    expect(store.current().events).toEqual([{ module: 'Arm', name: 'Move', triggerRule: 'second rule' }]);
    expect(store.current().modules).toEqual([{ name: 'Arm', parentModule: null }]);
    await waitFor(() => expect(textarea().value).toBe(B));
  });
  it('round-trips structured content with embedded newlines through repeated metadata-only saves', async () => {
    const store = draftStore(A);
    mount(`&drawer=draft&revision=${store.firstId}`, { draft: id => store.read(id), action: (name, input) => name === 'specDraftSave' ? store.save(input) : undefined });
    await waitFor(() => expect(textarea().value).toContain('Move'));
    for (const version of ['2', '3']) {
      const count = store.saves.length;
      fireEvent.change(screen.getByLabelText('문서 버전*'), { target: { value: version } });
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      await waitFor(() => expect(store.saves).toHaveLength(count + 1));
      await waitFor(() => expect(window.location.search).toContain(`revision=${store.current().id}`));
      await waitFor(() => expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false));
    }
    expect(store.current().events).toEqual([{ module: 'Arm', name: 'Move', triggerRule: 'first\nsecond' }]);
  });
  it('lets a metadata-only save of a freshly created empty draft keep working after a TSV save', async () => {
    const store = draftStore({ modules: [], events: [] });
    mount(`&drawer=draft&revision=${store.firstId}`, { draft: id => store.read(id), action: (name, input) => name === 'specDraftSave' ? store.save(input) : undefined });
    await screen.findByLabelText('명세 TSV');
    fireEvent.change(textarea(), { target: { value: B } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(store.saves).toHaveLength(1));
    await waitFor(() => expect(window.location.search).toContain(`revision=${store.current().id}`));
    await waitFor(() => expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('문서 버전*'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(store.saves).toHaveLength(2));
    expect(store.current().events).toHaveLength(1);
  });
});

describe('Event table freshness (fix C2)', () => {
  it('shows the refreshed projection that arrives after the write closed the drawer', async () => {
    const effective = (changeKind: 'added' | 'changed') => ok({
      ...published, effective: true, softwareId: sw,
      modules: published.modules.map(m => ({ ...m, parentModuleKey: m.parentModuleId ? 'ROBOT' : null, origin: 'revision' as const, changed: [], needsRevalidation: false })),
      events: published.events.map(e => ({ ...e, moduleKey: 'ARM', origin: 'revision' as const, changed: [{ changeId: 'x', changeKind, targetKind: 'event' as const, targetKey: 'ARM/MOVE' }], needsRevalidation: false })),
      removed: [], stale: [],
    });
    let current = effective('added'), gate: ReturnType<typeof deferred<ApiResponse<never>>> | null = null;
    mount(`&software=${sw}&drawer=confirm&change=${change.id}`, { spec: () => gate ? gate.promise : current });
    const dialog = await screen.findByRole('dialog', { name: '변경점 재검토 확인' });
    expect(await screen.findByText('추가', { exact: true })).toBeTruthy();
    // The write succeeds; its refreshed projection is held while the drawer closes and the table settles.
    gate = deferred<ApiResponse<never>>();
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '변경점 재검토 확인' })).toBeNull());
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByText('추가', { exact: true })).toBeTruthy();
    current = effective('changed'); gate.resolve(current);
    await waitFor(() => expect(screen.queryByText('추가', { exact: true })).toBeNull());
    expect(screen.getAllByText('변경', { exact: true }).length).toBeGreaterThan(0);
  });
});

describe('Event navigation guard (fix C3)', () => {
  it('asks before an Event click replaces a dirty draft, and keeps or discards on request', async () => {
    mount('&drawer=draft&revision=' + rev, { draft: () => ({ ...published, revision: { ...published.revision, state: 'draft', version: 1 } }) });
    await screen.findByLabelText('명세 TSV');
    fireEvent.change(textarea(), { target: { value: 'kind\tmodule\nmodule\tKept' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Move' }));
    const dialog = await screen.findByRole('dialog', { name: '저장하지 않은 입력을 버릴까요?' });
    expect(window.location.search).toContain('drawer=draft');
    fireEvent.click(within(dialog).getByRole('button', { name: '계속 편집' }));
    expect(window.location.search).toContain('drawer=draft');
    expect(textarea().value).toContain('Kept');
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: '저장하지 않은 입력을 버릴까요?' })).getByRole('button', { name: '버리고 이동' }));
    await waitFor(() => expect(window.location.search).toContain('drawer=event'));
    expect(screen.queryByLabelText('명세 TSV')).toBeNull();
  });
});

const server = (errors: FieldError[]) => ({ outcome: 'invalid', fieldErrors: errors });
describe('nested server errors reach their controls (fix C5 / A2)', () => {
  it.each([
    ['ko', [{ path: ['text', 'line 2', 'column module'], code: 'required' }], /2.*module.*필수/],
    ['en', [{ path: ['text', 'line 3', 'column trigger_rule'], code: 'too_long' }], /3.*trigger_rule.*too long/i],
    ['ko', [{ path: ['text', 'more_errors'], code: '57' }], /57/],
    ['ko', [{ path: ['events', '2', 'triggerRule'], code: 'too_long' }], /2.*triggerRule/],
  ] as const)('shows the %s detail of %j on the TSV control', async (lang, errors, detail) => {
    memoryLang(lang);
    const store = draftStore(A);
    mount(`&drawer=draft&revision=${store.firstId}`, { draft: id => store.read(id), action: () => server([...errors]) });
    const input = await screen.findByLabelText(lang === 'en' ? 'Specification TSV' : '명세 TSV');
    fireEvent.click(screen.getByRole('button', { name: lang === 'en' ? 'Save' : '저장' }));
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    const alert = (input.getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)).find(el => el?.getAttribute('role') === 'alert');
    expect(alert?.textContent).toMatch(detail);
  });
  it('keeps the server total next to the detail-line cut (RF5 C5)', async () => {
    memoryLang('ko');
    const many = Array.from({ length: 25 }, (_, n) => ({ path: ['text', `line ${n + 2}`, 'column module'], code: 'required' }));
    const store = draftStore(A);
    mount(`&drawer=draft&revision=${store.firstId}`, { draft: id => store.read(id), action: () => server([...many, { path: ['text', 'more_errors'], code: '120' }]) });
    const input = await screen.findByLabelText('명세 TSV');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    const alert = (input.getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)).find(el => el?.getAttribute('role') === 'alert');
    expect(alert?.textContent).toMatch(/외 5건/);
    expect(alert?.textContent).toMatch(/120/);
  });
  it('maps replacement and target errors onto the change editor controls', async () => {
    mount(`&tab=changes&drawer=retire&change=${change.id}`, { action: () => server([{ path: ['replacement', 'change', 'after', 'name'], code: 'target_mismatch' }, { path: ['replacement', 'target', 'module'], code: 'required' }, { path: ['range'], code: 'overlap' }]) });
    const dialog = await screen.findByRole('dialog', { name: '변경점 닫기·대체' });
    fireEvent.click(within(dialog).getByLabelText('같은 대상의 새 변경점으로 대체'));
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
    const target = await within(dialog).findByLabelText('대상 (JSON)');
    await waitFor(() => expect(target.getAttribute('aria-invalid')).toBe('true'));
    const text = (el: HTMLElement) => (el.getAttribute('aria-describedby') ?? '').split(' ').map(id => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(text(target)).toMatch(/module/);
    expect(within(dialog).getAllByRole('alert').map(el => el.textContent).join(' ')).toMatch(/겹칩니다/);
  });
});
