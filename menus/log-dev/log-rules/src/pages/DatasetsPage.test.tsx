// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Ruler } from 'lucide-react';
import { groupId, spaceId, type ActionResponse, type ApiResponse } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { settleQueries, testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import { DATASET_APPROVE, DATASET_MANAGE, DATASET_RUN } from '../endpoints';
import DatasetsPage from './DatasetsPage';
// eslint-disable-next-line ap/no-menu-mock-import -- MEN-8 migration exercises the same menu mock as the removed E2E assertions; test-only import.
import { datasetActionsMock, datasetsMock } from '../mock/datasets';
// eslint-disable-next-line ap/no-menu-mock-import -- Reset the shared synthetic E2E fixture between component tests; never imported by a product screen.
import { baselineRows, events, labels, runs } from '../mock/datasets-fixtures';

configure({ asyncUtilTimeout: 8000 });
const DS = '14810000-0000-4000-8000-000000000001';
const RUN = '14810000-0000-4000-8000-000000000401';
const FAILED = '14810000-0000-4000-8000-000000000403';
const seed = structuredClone({ baselineRows, events, runs });
const registry = createRegistry({ permissions: [DATASET_APPROVE, DATASET_MANAGE, DATASET_RUN], spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'log-datasets' }], groups: [{ id: groupId('logRules'), label: { ko: '기준', en: 'Rules' }, icon: Ruler, space: spaceId('logDev') }], menus: manifests });
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
let restore: () => void;
let readGate: Promise<void> | undefined;
let fail = false;
function Slot() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
function mount(params: { datasetId?: string; suiteRunId?: string } = {}, viewer = false) {
  const session = testSession(viewer ? ['platform:view'] : ['platform:view', DATASET_APPROVE, DATASET_MANAGE, DATASET_RUN], { user: { id: 'admin' } });
  const adapter = testAdapter({ session: () => session, menuQuery: async q => {
    await readGate;
    if (fail) return { ...ok(null), outcome: 'error' } as ApiResponse<never>;
    const endpoint = datasetsMock.find(e => e.spec.id === q.endpoint);
    if (!endpoint) throw new Error(`Unexpected query ${q.endpoint}`);
    return ok(await endpoint.handle({ params: q.params } as never));
  }, menuAction: async req => {
    const action = datasetActionsMock.find(a => a.spec.id === req.action)!;
    try {
      const result = await action.handle({ input: req.input, actor: 'admin' } as never);
      return { ...result, outcome: 'ok', fieldErrors: [], replayed: false, correlationId: 'fixture' } as ActionResponse<never>;
    } catch (error) {
      return { outcome: 'invalid', data: null, version: null, fieldErrors: (error as { fieldErrors: [] }).fieldErrors, replayed: false, correlationId: 'fixture' } as ActionResponse<never>;
    }
  } });
  window.history.replaceState(null, '', manifests.find(m => m.id === (params.suiteRunId ? 'log-dataset-run' : params.datasetId ? 'log-dataset' : 'log-datasets'))!.path.replace(':datasetId', params.datasetId ?? '').replace(':suiteRunId', params.suiteRunId ?? ''));
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><DetailPanelSlotProvider><DatasetsPage params={params} /><Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
const tab = async (name: string) => { await act(async () => { await settleQueries(); }); await waitFor(() => { const trigger = screen.getByRole('tab', { name }); fireEvent.mouseDown(trigger, { button: 0, ctrlKey: false }); expect(trigger.getAttribute('aria-selected')).toBe('true'); }); };
const click = async (name: string | RegExp) => { const button = await screen.findByRole('button', { name }); await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button); };
const close = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
beforeEach(() => {
  baselineRows.splice(0, baselineRows.length, ...structuredClone(seed.baselineRows));
  runs.splice(0, runs.length, ...structuredClone(seed.runs));
  for (const key of Object.keys(events)) delete events[key];
  Object.assign(events, structuredClone(seed.events));
  for (const key of Object.keys(labels)) delete labels[key];
  readGate = undefined; fail = false;
  Element.prototype.scrollIntoView = vi.fn();
  restore = stubCompactTableGeometry(1000);
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as HTMLElement).getAttribute('role') === 'row' || (this as HTMLElement).tagName === 'TR' ? 32 : 800; } });
});
afterEach(() => { cleanup(); restore(); });

describe('MEN-8 dataset menu assertions', () => {
  it('list paging and search show the same forty fixtures and empty result guidance', async () => {
    mount();
    await screen.findByText('40건 · 1/2 페이지');
    const table = screen.getByRole('table', { name: '테스트 데이터셋 목록' });
    expect(within(table).getByRole('link', { name: '전원 복구 경계 01' })).toBeTruthy();
    await click('다음');
    await waitFor(() => expect(within(screen.getByRole('table', { name: '테스트 데이터셋 목록' })).getAllByRole('row').filter(r => r.querySelector('td,[role="cell"]'))).toHaveLength(15));
    fireEvent.change(screen.getByRole('searchbox', { name: '데이터셋 검색' }), { target: { value: '찾을 수 없는 데이터셋' } });
    expect(await screen.findByText('조건에 맞는 테스트 데이터셋이 없습니다.')).toBeTruthy();
    expect(screen.getByText('검색어나 상태 필터를 변경해 주세요.')).toBeTruthy();
  });
  it('detail tabs expose overview, revision history, baseline evidence, runs and comparison guidance', async () => {
    mount({ datasetId: DS });
    await screen.findByRole('region', { name: '데이터셋 개요' });
    expect((screen.getAllByRole('button', { name: /탐색에서 열기/ })[0] as HTMLButtonElement).disabled).toBe(true);
    await tab('Revision');
    expect(await screen.findByRole('region', { name: 'Revision 이력' })).toBeTruthy();
    await tab('Baseline');
    const table = await screen.findByRole('table', { name: 'Baseline b3 기대 결과' });
    fireEvent.click(within(table).getByRole('button', { name: 'R-01 근거 위치 전체 보기' }));
    expect((await screen.findByRole('dialog', { name: 'R-01 근거 위치 전체 보기' })).textContent).toContain('synthetic/power-start.log · 10행');
    close();
    expect(screen.getByText('명세 고정값 변경')).toBeTruthy();
    await tab('회귀 실행');
    expect(await screen.findByRole('region', { name: '회귀 실행 요청' })).toBeTruthy();
    await tab('비교');
    expect(await screen.findByText('비교할 회귀 실행을 선택하세요.')).toBeTruthy();
  });
  it('comparison labels do not change the NOT_CHECKED script result', async () => {
    mount({ datasetId: DS, suiteRunId: RUN });
    await screen.findByRole('region', { name: '실행 커버리지' });
    expect(screen.getByText('필수 미검사 1', { exact: true })).toBeTruthy();
    await click(/^not_comparable /);
    const table = await screen.findByRole('table', { name: 'Baseline 대비 규칙 결과' });
    await waitFor(() => expect(within(table).getAllByRole('row').filter(r => r.querySelector('td,[role="cell"]'))).toHaveLength(1));
    expect(table.textContent).toContain('R-04'); expect(table.textContent).toContain('NOT_CHECKED');
    await click('R-04 검토 전');
    const drawer = await screen.findByRole('dialog', { name: '결과 검토 라벨' });
    fireEvent.change(within(drawer).getByRole('textbox', { name: '검토 사유' }), { target: { value: '합성 엔진 지원 범위 확인' } });
    fireEvent.click(within(drawer).getByRole('button', { name: '결과 검토 라벨 남기기' }));
    await waitFor(() => expect(within(drawer).getByRole('status').textContent).toContain('결과 검토 라벨을 남겼습니다.'));
    close();
    await waitFor(() => expect(table.textContent).toContain('needs_review'));
    expect(table.textContent).toContain('NOT_CHECKED');
  });
  it('request drawer pins baseline b2, queues three requests and reports the concurrent limit', async () => {
    mount({ datasetId: DS }); await tab('회귀 실행');
    for (let i = 0; i < 4; i++) {
      await screen.findByRole('region', { name: '회귀 실행 요청' });
      await act(async () => { await settleQueries(); });
      await click('회귀 실행 요청');
      const drawer = await screen.findByRole('dialog', { name: '회귀 실행 요청' });
      expect(await within(drawer).findByText('r3 · Baseline b2', { exact: true })).toBeTruthy();
      fireEvent.click(within(drawer).getByRole('button', { name: '회귀 실행 요청 등록' }));
      await waitFor(() => expect(within(drawer).getByRole(i < 3 ? 'status' : 'alert').textContent).toContain(i < 3 ? '검증 요청: 대기' : '동시 실행 한도 3건에 도달했습니다.'));
      close();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '회귀 실행 요청' }));
    }
  });
  it('approval requires its session permission and failed attempts stay unclassified', async () => {
    mount({ datasetId: DS }, true); await tab('Baseline');
    expect((await screen.findAllByText(/Baseline 승인 권한이 없습니다/)).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: '초안 b3 승인' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup(); mount({ datasetId: DS, suiteRunId: FAILED }, true);
    await screen.findByText(/성공한 시도가 없어 실행 커버리지와 규칙 분류를 계산하지 않았습니다/);
    expect(screen.getByText('미산출', { exact: true })).toBeTruthy();
    expect(screen.queryByText('실행 0', { exact: true })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Baseline 대비 규칙 결과' })).toBeNull();
    expect(screen.getByText('비교 결과를 제공할 수 없습니다.')).toBeTruthy();
  });
  it('records self approval and shows missing sources and absent baselines', async () => {
    mount({ datasetId: DS }); await tab('Baseline');
    fireEvent.change(await screen.findByRole('textbox', { name: '승인 사유' }), { target: { value: '합성 데이터 기대 결과 검토 완료' } });
    await click('초안 b3 승인');
    await waitFor(() => expect(screen.getAllByText(/자기 승인/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '승인 사유' })).toBeNull());
    cleanup(); mount({ datasetId: '14810000-0000-4000-8000-000000000002' });
    await screen.findByText('원본 부재 · 열람 불가', { exact: true }); await tab('Baseline');
    expect(await screen.findByText('초안 없음 · 이 Revision에 등록된 Baseline이 없습니다.')).toBeTruthy();
  });
  it('loading retains headers and skeletons while keeping stale rows hidden', async () => {
    mount(); const table = await screen.findByRole('table', { name: '테스트 데이터셋 목록' });
    let release!: () => void; readGate = new Promise<void>(resolve => { release = resolve; });
    fireEvent.change(screen.getByRole('searchbox', { name: '데이터셋 검색' }), { target: { value: '경계' } });
    await waitFor(() => expect(table.getAttribute('aria-busy')).toBe('true'));
    expect(within(table).getByRole('columnheader', { name: '이름' })).toBeTruthy();
    expect(within(table).queryAllByRole('cell')).toHaveLength(0);
    expect(table.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.getByRole('searchbox', { name: '데이터셋 검색' })).toBeTruthy();
    await act(async () => { release(); });
    await waitFor(() => expect(screen.getByRole('table', { name: '테스트 데이터셋 목록' }).getAttribute('aria-busy')).toBe('false'));
  });
  it('failure remains distinct from an empty list', async () => {
    mount(); await screen.findByRole('table', { name: '테스트 데이터셋 목록' }); fail = true;
    fireEvent.change(screen.getByRole('searchbox', { name: '데이터셋 검색' }), { target: { value: '경계' } });
    expect(await screen.findByText('데이터를 불러오지 못했습니다.')).toBeTruthy();
    expect(screen.queryByText('등록된 테스트 데이터셋이 없습니다.')).toBeNull();
  });
});


describe('MEN-8 second Suite content', () => {
  it('second Suite request drawer names execution profile ep-9', async () => {
    mount({ datasetId: DS });
    await tab('회귀 실행');
    fireEvent.click(await screen.findByRole('combobox', { name: '회귀 Suite' }));
    fireEvent.click(await screen.findByRole('option', { name: '전원 복구 장기 회귀' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '회귀 Suite' }).textContent).toBe('전원 복구 장기 회귀'));
    await act(async () => { await settleQueries(); });
    await click('회귀 실행 요청');
    const drawer = await screen.findByRole('dialog', { name: '회귀 실행 요청' });
    expect(await within(drawer).findByText('실행 프로파일: ep-9', { exact: true })).toBeTruthy();
  });
});
