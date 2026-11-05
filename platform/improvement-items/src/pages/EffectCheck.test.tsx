import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextCapabilities, groupId, type ApiResponse, type PlatformAdapter } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { manifests } from '../index';
import { MANAGE_PERMISSION, type ItemRow } from '../endpoints';
import ImprovementDetail from './ImprovementDetail';
const done: ItemRow = { id: '13280000-0000-4000-8000-000000000003', itemNo: 3, problem: 'effect fixture', action: 'repair', actionDate: '2026-11-04', status: 'done', assignee: null, quest: null, origin: { menuId: 'analysis', context: { scopeId: 'MEM', metricId: 'cycle-time', metricVersion: 'v1', selection: ['EQ-01'] } }, targets: [], effectResult: null, effectNote: null, effectCompareLink: null, dropReason: null, version: '1', createdBy: 'admin', updatedBy: 'admin', createdAt: '2026-11-05T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z' };
const analysis = { ...manifests[0]!, id: 'analysis', path: '/test/analysis', group: groupId('test'), primary: true, context: contextCapabilities({ time: 'apply' }), features: { ...manifests[0]!.features, compare: true }, pageKeys: [], repeatedPageKeys: [], hiddenPageKeys: [], contextResetKeys: [], pageType: 'analysis' as const };
const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'analysis' })], menus: [...manifests, analysis], groups: [{ id: groupId('test'), label: { ko: '분석', en: 'Analysis' }, icon: manifests[0]!.icon, space: testSpace().id }, { id: groupId('improvementItems'), label: { ko: '개선 아이템', en: 'Items' }, icon: manifests[0]!.icon, space: null }], permissions: [MANAGE_PERMISSION] });
const ok = <T,>(data: T): ApiResponse<T> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'f' });
function mount(item = done, overrides: Partial<PlatformAdapter> = {}, allowed = true) {
  window.history.replaceState(null, '', `/improvement-items/${item.id}?v=1&scopeId=MEM`);
  const session = testSession(allowed ? ['platform:view', MANAGE_PERMISSION] : ['platform:view']);
  const api = testAdapter({ session: () => session, menuQuery: async r => ok(r.endpoint === 'improvement.itemDetail' ? item : { rows: [], total: 0 }), ...overrides });
  render(<I18nProvider><PlatformProvider adapter={api} registry={registry}><ImprovementDetail /></PlatformProvider></I18nProvider>);
  return api;
}
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const effectArea = () => screen.getByRole('heading', { name: '효과 확인' }).closest('section')!;
describe('effect confirmation detail', () => {
  it('shows exact before/after endpoints and changes both periods with the length control', async () => {
    mount();
    await screen.findByText('2026-10-28 00:00:00 – 2026-11-04 00:00:00 KST');
    expect(screen.getByText('2026-11-04 00:00:00 – 2026-11-11 00:00:00 KST')).toBeTruthy();
    fireEvent.click(screen.getByRole('combobox', { name: '앞뒤 구간 길이' }));
    fireEvent.click(await screen.findByRole('option', { name: '1일' }));
    await screen.findByText('2026-11-03 00:00:00 – 2026-11-04 00:00:00 KST');
    const url = new URL(screen.getByRole('link', { name: '분석 화면에서 전후 비교 열기' }).getAttribute('href')!, 'https://local.test');
    expect(url.searchParams.get('to')).toBe('2026-11-05T00:00:00');
    expect(url.searchParams.get('metricId')).toBe('cycle-time');
    expect(url.searchParams.get('selectedEquipmentIds')).toBe('EQ-01');
  });
  it.each([
    [{ origin: null }, '분석 출처가 없어 전후 비교를 열 수 없습니다.'],
    [{ actionDate: null }, '조치일을 기록하면 전후 비교를 열 수 있습니다.'],
    [{ origin: { menuId: 'improvement-items', context: {} } }, '전후 비교를 지원하는 분석 화면을 열 수 없습니다. 저장된 출처를 확인하세요.'],
  ])('explains absent or unsupported prerequisites without an error or dead link', async (patch, reason) => {
    mount({ ...done, ...patch });
    await screen.findByText(reason);
    expect(screen.queryByRole('link', { name: '분석 화면에서 전후 비교 열기' })).toBeNull();
    expect(within(effectArea()).queryByRole('alert')).toBeNull();
  });
  it('requires a result and stores the selected comparison link and note with verification', async () => {
    let current = structuredClone(done);
    const action = vi.fn(async r => { const effect = r.input.effect as { result: ItemRow['effectResult']; note: string; compareLink: string }; current = { ...current, status: 'verified', effectResult: effect.result, effectNote: effect.note, effectCompareLink: effect.compareLink, version: '2' }; return { outcome: 'ok' as const, data: { version: '2' }, version: '2', fieldErrors: [], replayed: false, correlationId: 'f' }; });
    mount(done, { menuAction: action, menuQuery: async r => ok(r.endpoint === 'improvement.itemDetail' ? current : { rows: [], total: 0 }) });
    fireEvent.click(await screen.findByRole('button', { name: '효과 확인에 이 비교 사용' }));
    const href = screen.getByRole('link', { name: '분석 화면에서 전후 비교 열기' }).getAttribute('href');
    fireEvent.click(screen.getByRole('button', { name: '효과 확인됨' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: '선택한 비교 링크 함께 저장' }).getAttribute('data-state')).toBe('checked');
    fireEvent.click(within(dialog).getByRole('button', { name: '상태 변경 확인' }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('combobox', { name: '효과 확인 결과 · 필수' }));
    fireEvent.click(await screen.findByRole('option', { name: '효과 있음' }));
    fireEvent.change(within(dialog).getByLabelText('판단 메모'), { target: { value: 'measured in analysis' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '상태 변경 확인' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ input: { itemId: done.id, status: 'verified', effect: { result: 'effective', note: 'measured in analysis', compareLink: href } }, expectedVersion: '1' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByText('measured in analysis');
    expect(screen.getByRole('link', { name: '저장한 비교 열기' })).toBeTruthy();
  });
  it('displays a verified result, note and safe stored link read-only, retaining reopen', async () => {
    mount({ ...done, status: 'verified', effectResult: 'ineffective', effectNote: 'retained judgment', effectCompareLink: '/test/analysis?v=1&scopeId=MEM' });
    await screen.findByText('retained judgment');
    expect(within(effectArea()).getByText('효과 없음')).toBeTruthy();
    expect(within(effectArea()).getByRole('link', { name: '저장한 비교 열기' }).getAttribute('href')).toBe('/test/analysis?v=1&scopeId=MEM');
    expect(within(effectArea()).queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 열기' }));
    expect(await screen.findByLabelText('사유 · 필수')).toBeTruthy();
  });
  it('does not persist a comparison that was never selected', async () => {
    const action = vi.fn(async () => ({ outcome: 'ok' as const, data: { version: '2' }, version: '2', fieldErrors: [], replayed: false, correlationId: 'f' }));
    mount(done, { menuAction: action });
    fireEvent.click(await screen.findByRole('button', { name: '효과 확인됨' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(dialog).getByRole('combobox', { name: '효과 확인 결과 · 필수' }));
    fireEvent.click(await screen.findByRole('option', { name: '판단 보류' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '상태 변경 확인' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ input: { itemId: done.id, status: 'verified', effect: { result: 'inconclusive', note: null } } })));
  });
  it('selects an opened link, clears selection on a length change, and allows saving without the link', async () => {
    const action = vi.fn(async () => ({ outcome: 'ok' as const, data: { version: '2' }, version: '2', fieldErrors: [], replayed: false, correlationId: 'f' }));
    mount(done, { menuAction: action });
    fireEvent.click(await screen.findByRole('link', { name: '분석 화면에서 전후 비교 열기' }));
    expect(screen.getByRole('button', { name: '효과 확인에 이 비교 사용' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('combobox', { name: '앞뒤 구간 길이' }));
    fireEvent.click(await screen.findByRole('option', { name: '14일' }));
    expect(screen.getByRole('button', { name: '효과 확인에 이 비교 사용' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '효과 확인에 이 비교 사용' }));
    fireEvent.click(screen.getByRole('button', { name: '효과 확인됨' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '선택한 비교 링크 함께 저장' }));
    fireEvent.click(within(dialog).getByRole('combobox', { name: '효과 확인 결과 · 필수' }));
    fireEvent.click(await screen.findByRole('option', { name: '효과 없음' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '상태 변경 확인' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ input: { itemId: done.id, status: 'verified', effect: { result: 'ineffective', note: null } } })));
  });
  it('drops a selected link when conflict review changes the action date and retains the judgment draft', async () => {
    let current = done;
    const action = vi.fn(async () => { current = { ...done, actionDate: '2026-11-06', version: '2' }; return { outcome: 'conflict' as const, data: null, version: '2', fieldErrors: [], replayed: false, correlationId: 'f' }; });
    mount(done, { menuAction: action, menuQuery: async r => ok(r.endpoint === 'improvement.itemDetail' ? current : { rows: [], total: 0 }) });
    fireEvent.click(await screen.findByRole('button', { name: '효과 확인에 이 비교 사용' }));
    fireEvent.click(screen.getByRole('button', { name: '효과 확인됨' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('combobox', { name: '효과 확인 결과 · 필수' }));
    fireEvent.click(await screen.findByRole('option', { name: '판단 보류' }));
    fireEvent.change(within(dialog).getByLabelText('판단 메모'), { target: { value: 'keep draft' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '상태 변경 확인' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: '최신 내용 확인' }));
    await within(dialog).findByText('2026-11-06', { exact: false });
    expect(within(dialog).queryByRole('checkbox', { name: '선택한 비교 링크 함께 저장' })).toBeNull();
    expect((within(dialog).getByLabelText('판단 메모') as HTMLTextAreaElement).value).toBe('keep draft');
    fireEvent.click(within(dialog).getByRole('button', { name: '상태 변경 확인' }));
    await waitFor(() => expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: '2', input: { itemId: done.id, status: 'verified', effect: { result: 'inconclusive', note: 'keep draft' } } })));
  });
  it.each(['//evil.test/x', '/%09/evil.test/x', '/retired-analysis?v=1'])('keeps unsafe or retired stored links inert: %s', async effectCompareLink => {
    mount({ ...done, status: 'verified', effectResult: 'inconclusive', effectCompareLink });
    await screen.findByText('판단 보류');
    expect(within(effectArea()).queryByRole('link')).toBeNull();
    expect(within(effectArea()).getByText('전후 비교를 지원하는 분석 화면을 열 수 없습니다. 저장된 출처를 확인하세요.')).toBeTruthy();
  });
  it('uses the singular for one day and keeps one stable status row when a comparison is selected (UX C1 C3)', async () => {
    const storage = memoryStorage(); storage.setItem('platform:lang', 'en'); vi.stubGlobal('localStorage', storage);
    mount();
    fireEvent.click(await screen.findByRole('combobox', { name: 'Before/after window length' }));
    expect(await screen.findByRole('option', { name: '1 day' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '1 days' })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    const status = screen.getAllByRole('status').find(el => el.className.includes('min-h-5'));
    expect(status).toBeTruthy();
    expect(status!.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Use this comparison for effect checking' }));
    expect(status!.textContent).toMatch(/selected/i);
    expect(screen.getByText(/boundary between two equal windows/)).toBeTruthy();
  });
  it('renders English labels and does not offer status changes to a reader', async () => {
    const storage = memoryStorage(); storage.setItem('platform:lang', 'en'); vi.stubGlobal('localStorage', storage);
    mount(done, {}, false);
    expect(await screen.findByRole('link', { name: 'Open before/after comparison in analysis' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Before/after window length' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Effect verified' })).toBeNull();
  });
});
