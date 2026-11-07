// @vitest-environment jsdom
// #1410: dirty spec editing registers the #1388 navigation guard; clean editing does not. The shell draws the dialog (the E2E owns stay/discard);
// here a guarded move is the one `navigate` refuses (returns false, URL unchanged) while a leave request waits.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { menuPermission, type ApiResponse } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { type ModelSpecData } from '../../endpoints';
import SpecScreen from './SpecScreen';
import { knowledgeRegistry, mountWith } from '../test-support';
const modelId = '00000003-0000-4000-8000-000000000008', sw = '00000004-0000-4000-8000-00000000000e', rev = '00000007-0000-4000-8000-000000000001';
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: "guard-test" }) as ApiResponse<never>;
const spec: ModelSpecData = { revision: { id: rev, modelId, revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Spec', docVersion: '1' }, contentSha256: 'a'.repeat(64), publishedAt: '2026-11-01T00:00:00Z', publishedBy: 'admin' }, modules: [{ id: 'm1', moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }, { id: 'm2', moduleKey: 'ARM', name: 'Arm', parentModuleId: 'm1' }], events: [{ id: 'e1', moduleId: 'm2', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'on move', detailDocRef: null }], relations: [] };
const registry = knowledgeRegistry(['knowledge:spec-publish', 'knowledge:catalog-manage'], { description: { ko: '로그 개발', en: 'Log development' }, homeMenuId: 'log-knowledge-models' });
let restoreGeometry: () => void;
let navigateTo: (url: string) => boolean = () => false;
beforeEach(() => { restoreGeometry = stubCompactTableGeometry(); HTMLElement.prototype.scrollIntoView = () => {}; });
afterEach(() => { cleanup(); restoreGeometry(); });

/** Hands the page's `navigate` to the tests. */
function Probe() {
  const platform = usePlatform();
  navigateTo = (url: string) => platform.navigate(url);
  return null;
}
function mount(search: string) {
  window.history.replaceState(null, '', `/logDev/log-knowledge-spec/${modelId}?v=1${search}`);
  const session = testSession(['platform:view', 'knowledge:spec-publish']);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => {
    if (req.endpoint === 'logKnowledge.modelSpec') return ok(spec);
    if (req.endpoint === 'logKnowledge.softwareVersions') return ok({ rows: [{ id: sw, versionLabel: 'v1.0', releaseOrder: 1 }], total: 1 });
    if (req.endpoint === 'logKnowledge.specChanges') return ok({ rows: [], total: 0 });
    if (req.endpoint === 'logKnowledge.modelSpecRevisions') return ok({ rows: [{ id: rev, revisionNo: 2, state: 'draft', version: 1 }], total: 1 });
    if (req.endpoint === 'logKnowledge.specDraft') return ok({ ...spec, revision: { ...spec.revision, state: 'draft', version: 1 } });
    return ok(null);
  } });
  return mountWith({ registry, adapter, ui: <><SpecScreen params={{ modelId }} /><Probe /></>, slot: true });
}
const editor = () => screen.findByLabelText('명세 TSV');
const dirtyEditor = async () => { fireEvent.change(await editor(), { target: { value: 'kind\tmodule\nmodule\tKept' } }); };
const spyUnload = () => {
  let attached = 0;
  const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
  window.addEventListener = ((type: string, ...rest: unknown[]) => { if (type === 'beforeunload') attached++; return (add as (...a: unknown[]) => void)(type, ...rest); }) as typeof window.addEventListener;
  window.removeEventListener = ((type: string, ...rest: unknown[]) => { if (type === 'beforeunload') attached--; return (remove as (...a: unknown[]) => void)(type, ...rest); }) as typeof window.removeEventListener;
  return { attached: () => attached, restore: () => { window.addEventListener = add; window.removeEventListener = remove; } };
};

describe('spec editing navigation guard (#1410)', () => {
  it('registers the guard while the draft is dirty and unregisters when it is clean again', async () => {
    const unload = spyUnload();
    try {
      mount(`&drawer=draft&revision=${rev}`);
      const input = await editor() as HTMLTextAreaElement;
      expect(unload.attached()).toBe(0);
      const saved = input.value;
      fireEvent.change(input, { target: { value: `${saved}\nmodule\tKept` } });
      await waitFor(() => expect(unload.attached()).toBe(1));
      fireEvent.change(input, { target: { value: saved } });
      await waitFor(() => expect(unload.attached()).toBe(0));
    } finally { unload.restore(); }
  });
  it('refuses a move to another menu while dirty and keeps the edits and the URL', async () => {
    mount(`&drawer=draft&revision=${rev}`);
    await dirtyEditor();
    const before = window.location.href;
    let moved = true;
    act(() => { moved = navigateTo('/logDev/log-knowledge-models'); });
    expect(moved).toBe(false);
    expect(window.location.href).toBe(before);
    expect((screen.getByLabelText('명세 TSV') as HTMLTextAreaElement).value).toContain('Kept');
  });
  it('refuses a move that only changes the drawer key of this address (Back/Forward and deep links)', async () => {
    mount(`&drawer=draft&revision=${rev}`);
    await dirtyEditor();
    const before = window.location.href;
    let moved = true;
    act(() => { moved = navigateTo(`/logDev/log-knowledge-spec/${modelId}?v=1&tab=changes`); });
    expect(moved).toBe(false);
    expect(window.location.href).toBe(before);
  });
  it('does not refuse while the draft is clean', async () => {
    mount(`&drawer=draft&revision=${rev}`);
    await editor();
    let moved = false;
    act(() => { moved = navigateTo(`/logDev/log-knowledge-spec/${modelId}?v=1&tab=changes`); });
    expect(moved).toBe(true);
    await waitFor(() => expect(window.location.search).toContain('tab=changes'));
  });
  it('re-selecting the open draft rewrites nothing: it neither asks nor discards the edits (review C1)', async () => {
    mount(`&drawer=draft&revision=${rev}`);
    await dirtyEditor();
    fireEvent.click(await screen.findByRole('button', { name: /초안 편집/ }));
    expect(screen.queryByRole('dialog', { name: '저장하지 않은 입력을 버릴까요?' })).toBeNull();
    expect((screen.getByLabelText('명세 TSV') as HTMLTextAreaElement).value).toContain('Kept');
  });
  it('writes an in-menu move only after the in-menu dialog was answered, once', async () => {
    mount(`&drawer=draft&revision=${rev}`);
    await dirtyEditor();
    const tab = screen.getByRole('tab', { name: '변경점' });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(window.location.search).not.toContain('tab=changes');
    fireEvent.click(within(await screen.findByRole('dialog', { name: '저장하지 않은 입력을 버릴까요?' })).getByRole('button', { name: '버리고 이동' }));
    await waitFor(() => expect(window.location.search).toContain('tab=changes'));
    expect(screen.queryByLabelText('명세 TSV')).toBeNull();
  });
});
