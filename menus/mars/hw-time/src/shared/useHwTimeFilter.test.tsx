// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import { useHwTimeFilter } from './useHwTimeFilter';
const registry = createRegistry({  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, description: { ko: '분석', en: 'Analysis' }, homeMenuId: 'hw-time' }],
  groups: [{ id: groupId('hwTime'), label: { ko: 'HW Time', en: 'HW Time' }, icon: manifests[0].icon, space: spaceId('mars') }], menus: manifests });
const session = testSession(['analytics:view', 'platform:view']);
const adapter = testAdapter({ session: () => session });
const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider registry={registry} adapter={adapter}>{children}</PlatformProvider></I18nProvider>;
function setup(search = '') {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM${search}`);
  return renderHook(() => ({ ...useHwTimeFilter(), align: usePlatform().pageParam('align'), moduleKey: usePlatform().pageParams('module') }), { wrapper });
}
const address = () => new URLSearchParams(window.location.search);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
// Key grammar = the page condition layer (#2336 §2.3, decision 8): selected values, absent = all, `~none` = empty, hidden from the address bar.
describe('shared HW Time filter', () => {
  it('reads every value as checked when the keys are absent', () => {
    const { result } = setup();
    expect(result.current.moduleType.id).toBe('PM');
    expect(result.current.modules).toEqual(['PM1', 'PM2', 'PM3', 'PM4']);
    expect(result.current.motions).toEqual(['Chuck', 'Dechuck', 'Pump', 'Vent', 'Transfer']);
    expect(result.current.empty).toBe(false);
  });
  it('applies the selected values per type and keeps them out of the address bar', () => {
    const { result } = setup('&module=PM1&module=PM3&module=TR2&motion=PM/Chuck&motion=TR/Place');
    expect(result.current.modules).toEqual(['PM1', 'PM3']);
    expect(result.current.motions).toEqual(['Chuck']);
    expect(address().has('module')).toBe(false);
    expect(address().has('motion')).toBe(false);
    expect(result.current.selectionFor('TR')).toEqual({ modules: ['TR2'], motions: ['Place'] });
  });
  it('writes ~none when everything is unchecked and drops the key when everything is checked again', () => {
    const { result } = setup('&moduleType=LK');
    act(() => result.current.setTypeChecked('LK', { modules: [] }));
    expect(result.current.modules).toEqual([]);
    expect(result.current.empty).toBe(true);
    // The other types' Modules stay checked: only the LK ones were cleared.
    expect(result.current.selectionFor('PM').modules).toEqual(['PM1', 'PM2', 'PM3', 'PM4']);
    act(() => result.current.setTypeChecked('PM', { modules: [] }));
    act(() => result.current.setTypeChecked('TR', { modules: [] }));
    expect(result.current.moduleKey).toEqual(['~none']);
    act(() => result.current.setTypeChecked('TR', { modules: ['TR1'] }));
    expect(result.current.selectionFor('TR').modules).toEqual(['TR1']);
    act(() => result.current.setTypeChecked('TR', { modules: [] }));
    expect(result.current.moduleKey).toEqual(['~none']);
    const all = { PM: ['PM1', 'PM2', 'PM3', 'PM4'], TR: ['TR1', 'TR2'], LK: ['LK1', 'LK2'] };
    for (const [type, modules] of Object.entries(all)) act(() => result.current.setTypeChecked(type, { modules }));
    expect(result.current.modules).toEqual(['LK1', 'LK2']);
    expect(result.current.moduleKey).toEqual([]);
  });
  it('reads ~none as an empty selection, not as a widened one', () => {
    const { result } = setup('&motion=~none');
    expect(result.current.motions).toEqual([]);
    expect(result.current.empty).toBe(true);
    expect(result.current.invalid).toBeNull();
  });
  it('keeps well-formed values that are in no list and reports them as unusable', () => {
    const { result } = setup('&module=PM1&module=PM9&motion=XX/Spin');
    expect(result.current.invalid).toBeNull();
    expect(result.current.unusable).toEqual(['PM9', 'XX/Spin']);
    expect(result.current.modules).toEqual(['PM1']);
    act(() => result.current.setTypeChecked('PM', { modules: ['PM1', 'PM2'] }));
    expect(result.current.unusable).toEqual(['PM9', 'XX/Spin']);
    expect(result.current.modules).toEqual(['PM1', 'PM2']);
  });
  it.each(['moduleType=nope', 'module=~none&module=PM1', 'module=~all', 'motion=PM/Pump&motion=PM/Pump', 'module=', 'split=recipe', 'split='])('rejects %s until explicit recovery', query => {
    const { result } = setup(`&${query}&align=1`);
    expect(result.current.invalid).toHaveLength(1);
    act(() => result.current.recover());
    expect(result.current.invalid).toBeNull();
    expect(result.current.align).toBe('1');
    expect(address().has('align')).toBe(false);
  });
});
