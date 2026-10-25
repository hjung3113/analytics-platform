import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { noContext, testSpace } from '@ap/kernel/testing';
import { emptyGlobal, groupId, spaceId, type GlobalContext } from '@ap/contracts';
import { freezeVocContext, type VocFreezeInput } from './vocContext';

const menu = (id: string, label: string, path: string) => ({
  id, group: groupId('overview'), primary: id === 'home', label: { ko: label, en: label }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['granularity', 'focus', 'q'],
});
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [
    { ...menu('home', '홈', '/'), pageKeys: [] },
    menu('prod', '생산성', '/p/:id'),
  ],
});
const absoluteUrl = (url: string) => `https://app.test${url}`;
const GLOBAL: GlobalContext = {
  ...emptyGlobal, scopeId: 'MEM', from: '2026-10-20T09:00:00', to: '2026-10-23T18:00:00', condition: { area: ['A', 'B'] }, membershipBasis: 'asOf',
  selection: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'], lineNames: ['L1'], metricId: 'oee', metricVersion: '3',
};
const input = (over: Partial<VocFreezeInput> = {}): VocFreezeInput => ({
  route: { menu: registry.menus.find(entry => entry.path === '/p/:id')!, params: { id: '7' } }, platformScreen: null, global: GLOBAL,
  page: [['granularity', 'day'], ['focus', 'E-9'], ['q', 'x']], absoluteUrl, registry, lang: 'ko', axes: [], asOf: '그 시점 소속', ...over,
});

describe('freezeVocContext (ADR-0070 decision 5)', () => {
  it('lists the chips in order with their labels, capping long value lists', () => {
    const context = freezeVocContext(input());
    expect(context.items.map(item => item.id)).toEqual(['menu', 'page:granularity', 'page:focus', 'page:q', 'period', 'global:lineNames', 'global:condition', 'global:selection', 'global:metricId', 'global:scopeId']);
    expect(Object.fromEntries(context.items.map(item => [item.id, [item.label, item.value]]))).toEqual({
      menu: ['화면', '분석 · 생산성'],
      'page:granularity': ['집계 단위', 'day'],
      'page:focus': ['상세', 'E-9'],
      'page:q': ['q', 'x'],
      period: ['기간', '2026-10-20 09:00 – 2026-10-23 18:00'],
      'global:lineNames': ['Line', 'L1'],
      'global:condition': ['그룹 조건', 'area: A, B · 그 시점 소속'],
      'global:selection': ['설비 선택', 'e1, e2, e3, e4, e5 외 2개'],
      'global:metricId': ['지표·버전', 'oee v3'],
      'global:scopeId': ['Scope', 'MEM'],
    });
    expect([context.spaceId, context.menuId]).toEqual(['analytics', 'prod']);
  });

  it('rebuilds the address from every kept key, as an absolute URL of the route path', () => {
    const url = new URL(freezeVocContext(input()).href!);
    expect(url.origin + url.pathname).toBe('https://app.test/p/7');
    const params = url.searchParams;
    expect([params.get('granularity'), params.get('focus'), params.get('q'), params.get('from'), params.get('to'), params.get('scopeId'), params.get('metricId'), params.get('metricVersion'), params.get('membershipBasis')])
      .toEqual(['day', 'E-9', 'x', '2026-10-20T09:00:00', '2026-10-23T18:00:00', 'MEM', 'oee', '3', 'asOf']);
    expect(params.getAll('selectedEquipmentIds')).toHaveLength(7);
    expect(params.get('equipmentGroup')).toContain('"area"');
  });

  it.each([
    [{ route: null }],
    [{ platformScreen: 'board' as const }],
  ])('freezes only the analysis board on the board screen (%j)', over => {
    expect(freezeVocContext(input(over))).toEqual({ items: [{ id: 'menu', label: '화면', value: '분석 보드' }], href: null, spaceId: null, menuId: null, carried: {} });
  });

  it('carries the frozen values of the space carriedPageKeys, including a removed chip, and none when the space has none', () => {
    const carrying = createRegistry({
      spaces: [testSpace({ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home', carriedPageKeys: ['q'] })],
      groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
      menus: [{ ...menu('home', '홈', '/'), pageKeys: ['q'] }, menu('prod', '생산성', '/p/:id')],
    });
    const carried = (removed?: string[]) => freezeVocContext(input({ registry: carrying, route: { menu: carrying.menus.find(entry => entry.path === '/p/:id')!, params: { id: '7' } } }), new Set(removed)).carried;
    expect(carried()).toEqual({ q: 'x' });
    expect(carried(['page:q'])).toEqual({ q: 'x' });
    expect(freezeVocContext(input()).carried).toEqual({});
  });

  it('drops returnTo: no chip, not in the address, not in carried (navigation state, #760)', () => {
    const carrying = createRegistry({
      spaces: [testSpace({ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home', carriedPageKeys: ['q', 'returnTo'] })],
      groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
      menus: [{ ...menu('home', '홈', '/'), pageKeys: ['q', 'returnTo'] }, { ...menu('prod', '생산성', '/p/:id'), pageKeys: ['q', 'returnTo'] }],
    });
    const context = freezeVocContext(input({ registry: carrying, page: [['q', 'x'], ['returnTo', '/origin?v=1']], route: { menu: carrying.menus.find(entry => entry.path === '/p/:id')!, params: { id: '7' } } }));
    expect(context.items.map(item => item.id)).not.toContain('page:returnTo');
    expect(new URL(context.href!).searchParams.has('returnTo')).toBe(false);
    expect(context.carried).toEqual({ q: 'x' });
  });

  it.each([
    ['a page chip', ['page:focus'], ['focus'], []],
    ['the period chip', ['period'], ['from', 'to'], []],
    ['the metric chip (the pair goes together)', ['global:metricId'], ['metricId', 'metricVersion'], []],
    ['the condition chip (its basis goes with it)', ['global:condition'], ['equipmentGroup', 'membershipBasis'], []],
  ])('removing %s leaves its keys out of items and href', (_name, removed, absent) => {
    const context = freezeVocContext(input(), new Set(removed));
    expect(context.items.some(item => removed.includes(item.id))).toBe(false);
    const params = new URL(context.href!).searchParams;
    for (const key of absent) expect(params.has(key)).toBe(false);
    expect(params.get('granularity')).toBe('day');
  });

  it('removing the menu chip drops the address but keeps the defaults-only space and menu ids', () => {
    expect(freezeVocContext(input(), new Set(['menu']))).toMatchObject({ href: null, spaceId: 'analytics', menuId: 'prod' });
  });

  it('keeps the membership basis with the PRC groups when there is no Condition', () => {
    const global = { ...GLOBAL, condition: null, prcGroups: ['G1'] };
    expect(new URL(freezeVocContext(input({ global })).href!).searchParams.get('membershipBasis')).toBe('asOf');
    expect(new URL(freezeVocContext(input({ global }), new Set(['global:prcGroups'])).href!).searchParams.has('membershipBasis')).toBe(false);
  });

  it('reads the Condition with axis names and marks the as-of basis like the board header', () => {
    const axes = [{ id: 'area', label: { ko: '구역', en: 'Area' }, membershipHistory: true }];
    const chips = (over: Partial<VocFreezeInput>) => Object.fromEntries(freezeVocContext(input({ axes, ...over })).items.map(item => [item.id, item.value]));
    const chip = (over: Partial<VocFreezeInput>) => chips(over)['global:condition'];
    expect(chip({})).toBe('구역: A, B · 그 시점 소속');
    expect(chip({ global: { ...GLOBAL, membershipBasis: null } })).toBe('구역: A, B');
    expect(chips({ global: { ...GLOBAL, condition: null, prcGroups: ['G1'] } })['global:prcGroups']).toBe('G1 · 그 시점 소속');
  });
});
