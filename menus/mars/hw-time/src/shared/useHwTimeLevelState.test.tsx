// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { LayoutDashboard } from 'lucide-react';
import { manifests } from '../index';
import { useHwTimeLevelState, type HwTimeLevelStateOptions } from './useHwTimeLevelState';

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view']);
const adapter = testAdapter({ session: () => session });
const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>;

function setup(search: string, options: Partial<HwTimeLevelStateOptions> = {}) {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', `/hw-time/compare?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  return renderHook(() => useHwTimeLevelState({ hiddenKey: 'k', row: true, ...options }), { wrapper });
}
const searchParams = () => new URLSearchParams(window.location.search);
const ids = (count: number) => Array.from({ length: count }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}.H1`);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('useHwTimeLevelState', () => {
  it('passes absent keys and well-formed values', async () => {
    const { result } = setup(`&sort=total-asc&trend=${ids(8).join(',')}&row=EQ-001.H2`);
    expect(result.current.invalid).toBeNull();
    expect(result.current.sort).toBe('total-asc');
    expect(result.current.trendRows).toEqual(ids(8));
    expect(result.current.row).toBe('EQ-001.H2');
    cleanup();
    const absent = setup('');
    expect(absent.result.current.invalid).toBeNull();
    expect(absent.result.current.sort).toBeNull();
    expect(absent.result.current.trendRows).toEqual([]);
    expect(absent.result.current.row).toBeNull();
  });

  it.each([
    ['duplicate trend row', 'trend=EQ-001.H1,EQ-001.H1', '추세 행'],
    ['surplus trend rows', `trend=${ids(9).join(',')}`, '추세 행'],
    ['empty trend part', 'trend=EQ-001.H1,,EQ-002.H1', '추세 행'],
    ['empty trend', 'trend=', '추세 행'],
    ['unknown sort', 'sort=sideways', '정렬'],
    ['empty sort', 'sort=', '정렬'],
    ['malformed row', 'row=EQ-001', '선택 행'],
    ['empty row', 'row=', '선택 행'],
  ])('rejects a %s with one sentence naming the field', (_name, query, field) => {
    const { result } = setup(`&${query}`);
    expect(result.current.invalid).toHaveLength(1);
    expect(result.current.invalid?.[0]).toContain(field);
    expect(result.current.trendRows).toEqual([]);
    expect(result.current.sort).toBeNull();
    expect(result.current.row).toBeNull();
  });

  it('ignores `row` when the screen has none', () => {
    const { result } = setup('&row=bogus', { row: false });
    expect(result.current.invalid).toBeNull();
  });

  it('gives one sentence per bad key and recover clears exactly those keys in one write', () => {
    const { result } = setup('&sort=bogus&trend=nope&row=EQ-001.H2&align=1');
    expect(result.current.invalid).toHaveLength(2);
    act(() => result.current.recover());
    expect(searchParams().has('sort')).toBe(false);
    expect(searchParams().has('trend')).toBe(false);
    expect(searchParams().get('row')).toBe('EQ-001.H2');
    expect(searchParams().get('align')).toBe('1');
  });

  it('adds a trend row, refuses a ninth with the notice, and removes one', () => {
    const { result } = setup('&trend=EQ-001.H1', { revealTrend: true });
    act(() => result.current.addTrend('EQ-002.H2'));
    expect(searchParams().get('trend')).toBe('EQ-001.H1,EQ-002.H2');
    expect(result.current.reveal).toEqual({ panelId: 'trend', seq: 1 });
    act(() => result.current.removeTrend('EQ-001.H1'));
    expect(searchParams().get('trend')).toBe('EQ-002.H2');
    cleanup();
    const full = setup(`&trend=${ids(8).join(',')}`);
    act(() => full.result.current.addTrend('EQ-009.H1'));
    expect(full.result.current.notice).toBe('추세는 최대 8행까지 볼 수 있습니다.');
    expect(searchParams().get('trend')).toBe(ids(8).join(','));
  });
});
