import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@ap/contracts';
import { I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { registry } from './menus';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const PERSONAL = ['platform:view', 'voc:view', 'notice:view'] as const;

type Out = { spaces: string[]; entry: string | null; open: Record<string, boolean>; links: Record<string, string> };
let out: Out | null = null;

function Probe({ ids, links }: { ids: string[]; links: Array<[string, Parameters<ReturnType<typeof usePlatform>['resolveLink']>[1]?]> }) {
  const { accessibleSpaces, spaceEntry, canOpen, resolveLink } = usePlatform();
  out = {
    spaces: accessibleSpaces.map(space => space.id),
    entry: spaceEntry(accessibleSpaces.find(space => space.id === 'operations')?.id ?? ('operations' as never))?.menuId ?? null,
    open: Object.fromEntries(ids.map(id => [id, canOpen(id)])),
    links: Object.fromEntries(links.map(([id, options], index) => [`${index}:${id}`, resolveLink(id, options).href])),
  };
  return <p data-testid="done">ok</p>;
}

function mount(permissions: readonly string[], url: string, ids: string[] = [], links: Array<[string, Parameters<ReturnType<typeof usePlatform>['resolveLink']>[1]?]> = []) {
  window.history.replaceState(null, '', url);
  const session = testSession([...permissions] as Permission[]);
  render(<I18nProvider><PlatformProvider equipmentAxes={EQUIPMENT_AXES} adapter={testAdapter({ session: () => session })} registry={registry}><Probe ids={ids} links={links} /></PlatformProvider></I18nProvider>);
  expect(screen.getByTestId('done')).toBeTruthy();
  return out!;
}

beforeEach(() => { out = null; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('operations console access: F and C stay independent (#1099c)', () => {
  it.each([
    ['neither F nor C', [...PERSONAL], false, null],
    ['F only', [...PERSONAL, 'features:access'], true, 'dashboard'],
    ['C only', [...PERSONAL, 'console:access'], true, 'admin-roles'],
    ['F and C', [...PERSONAL, 'features:access', 'console:access'], true, 'dashboard'],
  ])('%s: the console card and landing follow the permitted members (last → allowed dashboard home → first allowed menu)', (_, permissions, shown, landing) => {
    const result = mount(permissions, '/home');
    expect(result.spaces.includes('operations')).toBe(shown);
    expect(result.entry).toBe(landing);
  });

  it.each([
    ['F only', [...PERSONAL, 'features:access'], { inbox: true, tasks: true, 'my-tasks': true, 'survey-management': true, 'managed-systems': false, 'admin-roles': false }],
    ['C only', [...PERSONAL, 'console:access'], { inbox: false, tasks: false, 'my-tasks': false, 'survey-management': false, 'managed-systems': false, 'admin-roles': true }],
    ['F and C', [...PERSONAL, 'features:access', 'console:access'], { inbox: true, tasks: true, 'my-tasks': true, 'survey-management': true, 'managed-systems': true, 'admin-roles': true }],
  ])('%s opens exactly its sections: operator F, feature management F and C, platform management C, 내 Task F without C', (_, permissions, expected) => {
    const result = mount(permissions, '/home', Object.keys(expected));
    expect(result.open).toEqual(expected);
  });

  it('keeps 내 VOC on voc:view and 응답 설문 on platform:view whatever F and C say', () => {
    const result = mount(['voc:view'], '/home', ['voc', 'surveys', 'notifications', 'permission-requests']);
    expect(result.open).toEqual({ voc: true, surveys: false, notifications: false, 'permission-requests': false });
    cleanup();
    expect(mount(['platform:view'], '/home', ['voc', 'surveys']).open).toEqual({ voc: false, surveys: true });
  });
});

describe('one list scope policy across the surfaces (#1099c)', () => {
  const ALL = [...PERSONAL, 'features:access', 'console:access'];
  const query = (href: string) => new URL(href, 'http://x').searchParams.get('managedSystem');

  it('carries a filtered VOC list scope to 내 Task and on to another operator menu, and never to personal or console-admin entries', () => {
    const fromVoc = mount(ALL, `/operations/inbox?managedSystem=${SYSTEM}`, [], [['my-tasks'], ['tasks'], ['managed-systems'], ['admin-roles'], ['voc'], ['home']]);
    expect(query(fromVoc.links['0:my-tasks']!)).toBe(SYSTEM);
    expect(query(fromVoc.links['1:tasks']!)).toBe(SYSTEM);
    expect(query(fromVoc.links['2:managed-systems']!)).toBe(SYSTEM);
    expect(query(fromVoc.links['3:admin-roles']!)).toBeNull();
    expect(query(fromVoc.links['4:voc']!)).toBeNull();
    expect(query(fromVoc.links['5:home']!)).toBeNull();
    cleanup();
    const fromTasks = mount(ALL, `/my-tasks?managedSystem=${SYSTEM}`, [], [['inbox'], ['voc'], ['notifications'], ['admin-roles']]);
    expect(query(fromTasks.links['0:inbox']!)).toBe(SYSTEM);
    expect(query(fromTasks.links['1:voc']!)).toBeNull();
    expect(query(fromTasks.links['2:notifications']!)).toBeNull();
    expect(query(fromTasks.links['3:admin-roles']!)).toBeNull();
  });

  it('lets an explicit page value win and an explicit null clear, and an unscoped personal entry borrows no scope', () => {
    const result = mount(ALL, `/my-tasks?managedSystem=${SYSTEM}`, [], [['inbox', { page: { managedSystem: OTHER } }], ['inbox', { page: { managedSystem: null } }], ['surveys']]);
    expect(query(result.links['0:inbox']!)).toBe(OTHER);
    expect(query(result.links['1:inbox']!)).toBeNull();
    expect(query(result.links['2:surveys']!)).toBeNull();
  });

  it('serves 내 Task at /my-tasks and no operator menu at a retired /feedbackops address', () => {
    const result = mount(ALL, '/home', [], [['my-tasks'], ['dashboard']]);
    expect(result.links['0:my-tasks']).toMatch(/^\/my-tasks(\?|$)/);
    expect(result.links['1:dashboard']).toMatch(/^\/operations\/dashboard/);
    for (const href of Object.values(result.links)) expect(href).not.toContain('/feedbackops');
  });
});
