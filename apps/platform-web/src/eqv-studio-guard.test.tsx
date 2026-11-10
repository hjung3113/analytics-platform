// @vitest-environment jsdom
import { Suspense, type ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ActionResponse, ApiResponse, MenuAction, MenuQuery } from '@ap/contracts';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { useLeaveRequest } from '@ap/kernel/host';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { registry } from './menus';

// The unsaved-edit guard of the Studio Layouts menu (#1654): the shell's leave dialog is drawn here by a stand-in over `useLeaveRequest`,
// because a menu test cannot import the host entry. Stay keeps the edits and the address; Discard drops the edits and completes the move.
vi.setConfig({ testTimeout: 30000 });

const doc = (id: string) => ({
  schemaVersion: '0.4', kind: 'equipment-layout', id, templateId: 'sample-template', name: id, unit: 'abstract', viewBox: { x: 0, y: 0, width: 100, height: 100 },
  sources: [{ id: 'src-a', title: 'synthetic', license: 'synthetic' }], levels: [{ id: 'level-main', label: 'Main', order: 0 }],
  components: [{ id: 'comp-a', role: 'pm', assetRef: 'primitive:pm', label: 'comp-a', levelId: 'level-main', transform: { x: 10, y: 10, rotation: 0, scale: 1 }, ports: [], holdingSites: [], provenance: {} }],
  physicalInterfaces: [], transferCapabilities: [], processRoutes: [],
});
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const READS: Record<string, (p: Record<string, string>) => unknown> = {
  'eqv.layouts': () => ({ rows: ['layout-a', 'layout-b'].map(layoutId => ({ id: `row-${layoutId}`, layoutId, version: '1', updatedAt: '2026-11-10T00:00:00.000Z' })) }),
  'eqv.layoutDraft': p => ({ id: `row-${p.layoutId}`, layoutId: p.layoutId, version: '1', document: doc(p.layoutId!), updatedAt: '2026-11-10T00:00:00.000Z' }),
  'eqv.layoutRevisions': () => ({ rows: [] }),
  'eqv.templates': () => ({ rows: [] }),
};
const session = testSession(['platform:view', 'eqv-studio:view', 'eqv:view', 'eqv-studio:layout-edit', 'eqv-studio:layout-publish'], { user: { id: 'u', name: 'u', title: { ko: '사용자', en: 'User' } } });
const writes: MenuAction[] = [];
const saved = (): ActionResponse<never> => ({ outcome: 'ok', data: { id: 'row', layoutId: 'layout-b', version: '2' }, version: '2', fieldErrors: [], replayed: false, correlationId: 'fixture' }) as unknown as ActionResponse<never>;
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => ok(READS[req.endpoint]!(req.params as Record<string, string>)),
  menuAction: async (req: MenuAction) => { writes.push(req); return saved(); },
  session: () => session,
});

function LeaveHost() {
  const request = useLeaveRequest();
  return request ? <div role="alertdialog" aria-label="이동 확인"><button onClick={request.cancel}>머무르기</button><button onClick={request.confirm}>나가기</button></div> : null;
}
const Screen = registry.menuById('eqv-studio').component as unknown as ComponentType;
function mount() {
  window.history.replaceState(null, '', '/tools/eqv-studio?v=1');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} equipmentAxes={EQUIPMENT_AXES}><Suspense fallback={null}><Screen /></Suspense><LeaveHost /></PlatformProvider></I18nProvider>);
}
const slow = { timeout: 8000 };
const layoutParam = () => new URLSearchParams(window.location.search).get('layout');
const open = (id: string) => fireEvent.click(screen.getByRole('button', { name: id, current: undefined }));
async function dirtyEdit() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: '구성' }), { button: 0 });
  fireEvent.click(await screen.findByRole('treeitem', { name: /comp-a/ }, slow));
  fireEvent.mouseDown(screen.getByRole('tab', { name: '속성' }), { button: 0 });
  fireEvent.change(await screen.findByLabelText('이름', {}, slow), { target: { value: 'Edited' } });
  expect(within(screen.getByRole('heading', { level: 1 })).getByText('저장 안 됨')).toBeTruthy();
}
afterEach(() => { cleanup(); writes.length = 0; });

const importB = { ...doc('layout-b'), name: 'Imported B' };
const pickFile = () => fireEvent.change(screen.getByTestId('layout-import-input'), { target: { files: [new File([JSON.stringify(importB)], 'b.layout.json', { type: 'application/json' })] } });
const importTitle = '다른 Layout 문서를 가져올까요?';
const leaveDialog = () => screen.queryByRole('alertdialog', { name: '이동 확인' });
const unsaved = () => within(screen.getByRole('heading', { level: 1 })).queryByText('저장 안 됨');

describe('unsaved-edit guard of the Layouts screen', () => {
  it('importing another Layout over dirty edits asks once in place: Stay drops the import, Confirm opens it at the destination with no write before Save', async () => {
    mount();
    await screen.findByRole('button', { name: 'layout-b' }, slow);
    await dirtyEdit();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '파일' }), { button: 0 });
    pickFile();
    const dialog = await screen.findByRole('alertdialog', { name: importTitle }, slow);
    expect(dialog.textContent).toContain('layout-b');
    expect(leaveDialog()).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '유지' }));
    expect(screen.queryByRole('alertdialog', { name: importTitle })).toBeNull();
    expect(layoutParam()).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('layout-a');
    fireEvent.mouseDown(screen.getByRole('tab', { name: '구성' }), { button: 0 });
    fireEvent.click(await screen.findByRole('treeitem', { name: /comp-a/ }, slow));
    fireEvent.mouseDown(screen.getByRole('tab', { name: '속성' }), { button: 0 });
    expect((await screen.findByLabelText('이름', {}, slow) as HTMLInputElement).value).toBe('Edited');
    expect(writes).toEqual([]);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '파일' }), { button: 0 });
    pickFile();
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: importTitle }, slow)).getByRole('button', { name: '가져오기' }));
    await waitFor(() => expect(layoutParam()).toBe('layout-b'), slow);
    expect(leaveDialog()).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('layout-b'), slow);
    expect(await within(screen.getByRole('heading', { level: 1 })).findByText('저장 안 됨', {}, slow)).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writes).toEqual([]);
    await waitFor(() => expect((screen.getByRole('button', { name: '초안 저장' }) as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }));
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(writes[0]).toMatchObject({ action: 'eqv.saveDraft', expectedVersion: '1', input: { layoutId: 'layout-b', document: { name: 'Imported B' } } });
  });

  it('a cancelled cross-Layout import is not applied by a later ordinary move to that Layout', async () => {
    mount();
    await screen.findByRole('button', { name: 'layout-b' }, slow);
    await dirtyEdit();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '파일' }), { button: 0 });
    pickFile();
    const dialog = await screen.findByRole('alertdialog', { name: importTitle }, slow);
    fireEvent.click(within(dialog).getByRole('button', { name: '유지' }));
    open('layout-b');
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '이동 확인' }, slow)).getByRole('button', { name: '나가기' }));
    await waitFor(() => expect(layoutParam()).toBe('layout-b'), slow);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('layout-b'), slow);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(unsaved()).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect((screen.getByRole('button', { name: '초안 저장' }) as HTMLButtonElement).disabled).toBe(true), slow);
    expect(writes).toEqual([]);
  });

  it('a confirmed cross-Layout import is applied once: returning to the Layout later opens its server draft', async () => {
    mount();
    await screen.findByRole('button', { name: 'layout-b' }, slow);
    await dirtyEdit();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '파일' }), { button: 0 });
    pickFile();
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: importTitle }, slow)).getByRole('button', { name: '가져오기' }));
    await waitFor(() => expect(layoutParam()).toBe('layout-b'), slow);
    expect(await within(screen.getByRole('heading', { level: 1 })).findByText('저장 안 됨', {}, slow)).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '파일' }), { button: 0 });
    open('layout-a');
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '이동 확인' }, slow)).getByRole('button', { name: '나가기' }));
    await waitFor(() => expect(layoutParam()).toBe('layout-a'), slow);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('layout-a'), slow);
    await waitFor(() => expect(unsaved()).toBeNull(), slow);
    open('layout-b');
    await waitFor(() => expect(layoutParam()).toBe('layout-b'), slow);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('layout-b'), slow);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(unsaved()).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writes).toEqual([]);
  });

  it('a Layout switch while dirty asks first: Stay keeps the edits and the address, Discard opens the other Layout', async () => {
    mount();
    await screen.findByRole('button', { name: 'layout-b' }, slow);
    await dirtyEdit();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '파일' }), { button: 0 });
    open('layout-b');
    const dialog = await screen.findByRole('alertdialog', { name: '이동 확인' });
    expect(layoutParam()).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '머무르기' }));
    expect(screen.queryByRole('alertdialog', { name: '이동 확인' })).toBeNull();
    expect(layoutParam()).toBeNull();
    expect(within(screen.getByRole('heading', { level: 1 })).getByText('저장 안 됨')).toBeTruthy();
    open('layout-b');
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '이동 확인' })).getByRole('button', { name: '나가기' }));
    await waitFor(() => expect(layoutParam()).toBe('layout-b'), slow);
    await waitFor(() => expect(within(screen.getByRole('heading', { level: 1 })).queryByText('저장 안 됨')).toBeNull(), slow);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('layout-b');
  });

  it('a clean Layout switch pushes without asking, and Back while dirty asks first', async () => {
    mount();
    await screen.findByRole('button', { name: 'layout-b' }, slow);
    open('layout-b');
    await waitFor(() => expect(layoutParam()).toBe('layout-b'), slow);
    expect(screen.queryByRole('alertdialog', { name: '이동 확인' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('layout-b'), slow);
    await dirtyEdit();
    window.history.back();
    const dialog = await screen.findByRole('alertdialog', { name: '이동 확인' }, slow);
    fireEvent.click(within(dialog).getByRole('button', { name: '머무르기' }));
    await waitFor(() => expect(layoutParam()).toBe('layout-b'), slow);
    expect(within(screen.getByRole('heading', { level: 1 })).getByText('저장 안 됨')).toBeTruthy();
    window.history.back();
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: '이동 확인' }, slow)).getByRole('button', { name: '나가기' }));
    await waitFor(() => expect(layoutParam()).toBeNull(), slow);
  });
});
