// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { lazy } from 'react';
import { PenTool } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { NO_FEATURES, contextCapabilities, groupId, menuPermission, spaceId, type ActionResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import { manifests } from '../../index';
import { setModelTopView } from '../../model-topview-slot';
import { TopViewSection } from './TopViewSection';
import { ok } from './test-support';

const MODEL = '00000003-0000-4000-8000-000000000008';
const REV = `sha256:${'ab12cd34'.repeat(8)}`;
const software = [
  { id: 's2', versionLabel: 'v2.0', name: '', active: true, itemCount: 0, updatedAt: '2026-10-03T00:00:00.000Z' },
  { id: 's1', versionLabel: 'v1.0', name: '', active: true, itemCount: 0, updatedAt: '2026-10-01T00:00:00.000Z' },
];
const resolved = (patch = {}) => ({ linkId: 'l1', fromSoftwareId: null, fromSoftwareVersion: null, layoutId: 'demo-layout', revision: REV, document: { id: 'demo-layout' }, publishedAt: '2026-10-05T00:00:00.000Z', ...patch });
const link = { linkId: 'l1', fromSoftwareId: null, fromSoftwareVersion: null, layoutId: 'demo-layout', revision: REV, version: 3 };
const linked = (patch = {}) => ({ target: { softwareId: 's2', version: 'v2.0' }, resolved: resolved(), links: [link], ...patch });
const unlinked = { target: { softwareId: 's2', version: 'v2.0' }, resolved: null, links: [] };

const studio = { id: 'eqv-studio', primary: true, group: groupId('topviewStudio'), label: { ko: '레이아웃', en: 'Layouts' }, description: { ko: '편집', en: 'Edit' }, path: '/tools/eqv-studio', icon: PenTool,
  permission: menuPermission('eqv-studio:view'), requiresScope: false, context: contextCapabilities({ time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported' }),
  pageType: 'catalog' as const, features: NO_FEATURES, pageKeys: ['layout', 'revision', 'template'], component: lazy(async () => ({ default: () => null })) };
const space = { id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'log-knowledge-models' };
const groups = [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: PenTool, space: spaceId('logDev') }, { id: groupId('topviewStudio'), label: { ko: '스튜디오', en: 'Studio' }, icon: PenTool, space: spaceId('logDev') }];
const registryWith = (withStudio: boolean) => createRegistry({
  permissions: [menuPermission('knowledge:catalog-manage'), menuPermission('eqv-studio:view')], spaces: [space], groups: withStudio ? [...groups] : [groups[0]!],
  menus: withStudio ? [...manifests, studio] : manifests,
});

let queries: MenuQuery[] = [];
let writes: MenuAction[] = [];
let answer: (params: { softwareId?: string }) => unknown = () => unlinked;
let actionResult: Record<string, unknown> = { outcome: 'ok', data: { linkId: 'l1', version: '4' }, version: '4', fieldErrors: [], replayed: false };
const revisionRows = [{ layoutId: 'demo-layout', revision: REV, publishedAt: '2026-10-05T00:00:00.000Z' }];

function mount(opts: { perms?: string[]; studio?: boolean; canEdit?: boolean } = {}) {
  const session = testSession((opts.perms ?? ['platform:view', 'knowledge:catalog-manage', 'eqv-studio:view']) as Parameters<typeof testSession>[0], { user: { id: 'u', name: 'u', title: { ko: '사용자', en: 'User' } } });
  const adapter = testAdapter({
    session: () => session,
    menuQuery: async (req: MenuQuery) => {
      queries.push(req);
      if (req.endpoint === 'logKnowledge.modelTopView') return ok(answer(req.params as { softwareId?: string }));
      if (req.endpoint === 'logKnowledge.topViewRevisionOptions') return ok({ rows: revisionRows });
      return ok({ rows: [], total: 0 });
    },
    menuAction: async (req: MenuAction) => { writes.push(req); return { correlationId: 'tv', ...actionResult } as unknown as ActionResponse<never>; },
  });
  window.history.replaceState(null, '', `/logDev/log-knowledge-model/${MODEL}?v=1`);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registryWith(opts.studio ?? true)}>
    <TopViewSection modelId={MODEL} software={software} canEdit={opts.canEdit ?? true} /></PlatformProvider></I18nProvider>);
}
// The applied line contains styled ID/hash spans; match its complete paragraph text.
const appliedText = (text: string | RegExp) => (_: string, node: Element | null) =>
  node?.tagName === 'P' && (typeof text === 'string' ? node.textContent === text : text.test(node.textContent ?? ''));
const slow = { timeout: 8000 };
vi.setConfig({ testTimeout: 20000 });
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  queries = []; writes = []; answer = () => unlinked; actionResult = { outcome: 'ok', data: { linkId: 'l1', version: '4' }, version: '4', fieldErrors: [], replayed: false };
  setModelTopView(props => <div data-testid="drawing">{props.layoutId}|{props.revision}</div>);
});
afterEach(() => { cleanup(); setModelTopView(null); vi.restoreAllMocks(); });

describe('Top View section resolution', () => {
  it('unlinked: 미연결 and one muted line, no drawing', async () => {
    mount();
    expect(await screen.findByText('미연결', {}, slow)).toBeTruthy();
    expect(screen.getByText('연결된 Top View가 없습니다')).toBeTruthy();
    expect(screen.queryByTestId('drawing')).toBeNull();
  });

  it('linked model default: header line names the default, Layout and short hash; the slot gets the Revision', async () => {
    answer = () => linked();
    mount();
    expect(await screen.findByText(appliedText('적용: 모델 기본 · Layout demo-layout · Revision ab12cd34'), {}, slow)).toBeTruthy();
    expect(screen.getByTestId('drawing').textContent).toBe(`demo-layout|${REV}`);
  });

  it('linked SW row: the header names the start SW version', async () => {
    answer = () => linked({ resolved: resolved({ fromSoftwareId: 's1', fromSoftwareVersion: 'v1.0' }) });
    mount();
    expect(await screen.findByText(appliedText(/^적용: v1\.0 · Layout demo-layout/), {}, slow)).toBeTruthy();
  });

  it('unavailable Revision: says so and draws nothing', async () => {
    answer = () => ({ ...unlinked, resolvedError: 'revision_unavailable', links: [link] });
    mount();
    expect(await screen.findByText('연결된 Revision을 읽을 수 없습니다', {}, slow)).toBeTruthy();
    expect(screen.queryByTestId('drawing')).toBeNull();
    expect(screen.queryByText('미연결')).toBeNull();
  });

  it('slot unset: header stays, a plain sentence replaces the drawing', async () => {
    setModelTopView(null);
    answer = () => linked();
    mount();
    expect(await screen.findByText('이 화면에서는 Top View를 표시할 수 없습니다', {}, slow)).toBeTruthy();
    expect(screen.getByText(appliedText(/^적용: /))).toBeTruthy();
    expect(screen.queryByTestId('drawing')).toBeNull();
  });

  it('기준 SW switch reads again with softwareId', async () => {
    answer = p => linked(p.softwareId === 's1' ? { resolved: resolved({ fromSoftwareId: 's1', fromSoftwareVersion: 'v1.0' }) } : {});
    mount();
    await screen.findByText(appliedText(/^적용: 모델 기본/), {}, slow);
    expect(queries.find(q => q.endpoint === 'logKnowledge.modelTopView')?.params).toEqual({ modelId: MODEL });
    fireEvent.click(screen.getByRole('combobox', { name: '기준 SW' }));
    fireEvent.click(await screen.findByRole('option', { name: 'v1.0' }, slow));
    expect(await screen.findByText(appliedText(/^적용: v1\.0/), {}, slow)).toBeTruthy();
    expect(queries.filter(q => q.endpoint === 'logKnowledge.modelTopView').at(-1)?.params).toEqual({ modelId: MODEL, softwareId: 's1' });
  });
});

describe('Studio link', () => {
  beforeEach(() => { answer = () => linked(); });
  it('is shown with the layout and revision page keys when the menu is registered and allowed', async () => {
    mount();
    const a = await screen.findByRole('link', { name: 'Studio에서 열기' }, slow);
    const href = a.getAttribute('href') ?? '';
    expect(href).toContain('eqv-studio');
    expect(href).toContain('layout=demo-layout');
    expect(href).toContain(`revision=${encodeURIComponent(REV)}`);
  });
  it('is hidden when the viewer lacks the Studio permission', async () => {
    mount({ perms: ['platform:view', 'knowledge:catalog-manage'] });
    await screen.findByText(appliedText(/^적용: /), {}, slow);
    expect(screen.queryByRole('link', { name: 'Studio에서 열기' })).toBeNull();
  });
  it('is hidden when the Studio menu is not registered', async () => {
    mount({ studio: false });
    await screen.findByText(appliedText(/^적용: /), {}, slow);
    expect(screen.queryByRole('link', { name: 'Studio에서 열기' })).toBeNull();
  });
});

describe('manager controls', () => {
  it('are absent for a reader', async () => {
    answer = () => linked();
    mount({ canEdit: false });
    await screen.findByText(appliedText(/^적용: /), {}, slow);
    expect(screen.queryByRole('button', { name: 'Top View 연결' })).toBeNull();
    expect(screen.queryByRole('button', { name: '해제' })).toBeNull();
    expect(queries.some(q => q.endpoint === 'logKnowledge.topViewRevisionOptions')).toBe(false);
  });

  async function openDialog() {
    fireEvent.click(await screen.findByRole('button', { name: 'Top View 연결' }, slow));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Revision' }));
    fireEvent.click(await screen.findByRole('option', { name: /demo-layout · ab12cd34/ }, slow));
    return dialog;
  }

  it('links the model default with expectedVersion 0', async () => {
    mount();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '연결' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: 'logKnowledge.linkTopView', input: { modelId: MODEL, fromSoftwareId: null, layoutId: 'demo-layout', revision: REV }, expectedVersion: '0' });
  });

  it('replaces an existing (model, start SW) row with its version after saying so', async () => {
    answer = () => linked();
    mount();
    const dialog = await openDialog();
    expect(within(dialog).getByText(/이 Revision으로 바꿉니다/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '연결' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ expectedVersion: '3' });
  });

  it('shows a server field error on the field', async () => {
    actionResult = { outcome: 'invalid', data: null, version: null, fieldErrors: [{ path: ['revision'], code: 'revision_not_found' }], replayed: false };
    mount();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '연결' }));
    expect((await within(dialog).findByRole('alert', {}, slow)).textContent).toContain('Revision을 찾을 수 없거나');
  });

  it('unlinks after the confirm dialog, with the row version', async () => {
    answer = () => linked();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '해제' }, slow));
    expect(writes).toHaveLength(0);
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: '해제' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: 'logKnowledge.unlinkTopView', input: { modelId: MODEL, fromSoftwareId: null }, expectedVersion: '3' });
  });
});
