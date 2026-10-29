import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { ListTodo } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, carrySetId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { scopeControlSlot } from '@ap/feature-bridge/scope-control';
import { manifests } from './index';
import { mountAt } from './test-support';

const picker = vi.hoisted(() => ({ props: [] as { value?: string; disabled?: boolean; onChange: (id: string | undefined) => void }[] }));
vi.mock('@ap/feature-screens/operator-screens/scope-picker', () => ({
  ManagedSystemScopeControl: (props: { value?: string; disabled?: boolean; onChange: (id: string | undefined) => void }) => { picker.props.push(props); return <div data-testid="picker" />; },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); picker.props.length = 0; setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('목록 범위 picker (ready session)', () => {
  const Control = scopeControlSlot.For(spaceId('operations'), manifests[0]!)!;

  it('gets a uuid managedSystem as its value', async () => {
    mountAt(`/operations/dashboard?managedSystem=${SYSTEM}`, { extra: <Control collapsed={false} /> });
    await screen.findByTestId('picker');
    expect(picker.props.at(-1)?.value).toBe(SYSTEM);
  });

  it.each(['not-a-uuid', ''])('does not pass the invalid managedSystem %j to the picker as a selection', async value => {
    mountAt(`/operations/dashboard?managedSystem=${value}`, { extra: <Control collapsed={false} /> });
    await screen.findByTestId('picker');
    await waitFor(() => expect(picker.props.length).toBeGreaterThan(0));
    expect(picker.props.every(props => props.value === undefined)).toBe(true);
  });
});

describe('scope change (screen parity, #762 k)', () => {
  const S1 = '11111111-1111-4111-8111-111111111111';
  const S2 = '22222222-2222-4222-8222-222222222222';
  const AREA = '44444444-4444-4444-8444-444444444444';
  const FOCUS = '55555555-5555-4555-8555-555555555555';
  const probe = (id: string, path: string, pageKeys: string[]) => ({ ...manifests[0]!, id, primary: false, path, pageKeys });
  const registry = createRegistry({
    carrySets: [{ id: carrySetId('features'), pageKeys: ['managedSystem', 'returnTo'] }],
    spaces: [{ id: spaceId('operations'), label: { ko: 'Feature', en: 'Feature' }, description: { ko: '목적', en: 'Purpose' }, permission: 'features:access', homeMenuId: 'dashboard' }],
    groups: [{ id: groupId('dashboard'), label: { ko: '대시보드', en: 'Dashboard' }, icon: ListTodo, space: spaceId('operations') }],
    menus: [...manifests, probe('probe-area', '/operations/probe-area', ['focus', 'managedSystem', 'area', 'returnTo']), probe('probe-cursor', '/operations/probe-cursor', ['focus', 'managedSystem', 'cursor', 'returnTo'])],
  });
  const session = testSession(['platform:view', 'features:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
  const Control = scopeControlSlot.For(spaceId('operations'), manifests[0]!)!;

  it.each<[string, string, string | undefined, Record<string, string | null>]>([
    ['/operations/probe-area', `managedSystem=${S1}&cursor=c1`, S2, { managedSystem: S2, cursor: 'c1' }],
    ['/operations/probe-area', `managedSystem=${S1}&cursor=c1`, undefined, { managedSystem: null, cursor: 'c1' }],
    ['/operations/probe-area', `managedSystem=${S1}&area=${AREA}&focus=${FOCUS}`, S2, { managedSystem: S2, area: null, focus: FOCUS }],
    ['/operations/probe-area', `managedSystem=${S1}&area=unset`, S2, { managedSystem: S2, area: 'unset' }],
    ['/operations/probe-area', `managedSystem=${S1}&area=${AREA}`, undefined, { managedSystem: null, area: AREA }],
    ['/operations/probe-cursor', `managedSystem=${S1}&cursor=c1&focus=${FOCUS}`, S2, { managedSystem: S2, cursor: null, focus: FOCUS }],
    ['/operations/probe-cursor', `managedSystem=${S1}&cursor=c1`, undefined, { managedSystem: null, cursor: null }],
  ])('%s?%s choosing %s', async (path, query, next, expected) => {
    window.history.replaceState(null, '', `${path}?${query}`);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Control collapsed={false} /></PlatformProvider></I18nProvider>);
    await screen.findByTestId('picker');
    act(() => picker.props.at(-1)!.onChange(next));
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(expected)) expect(params.get(key)).toBe(value);
  });

  it('writes only managedSystem on a menu that declares neither area nor cursor', async () => {
    window.history.replaceState(null, '', `/operations/dashboard?managedSystem=${S1}`);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Control collapsed={false} /></PlatformProvider></I18nProvider>);
    await screen.findByTestId('picker');
    act(() => picker.props.at(-1)!.onChange(S2));
    // The kernel adds its own `v` version key to every written query; it is not a page key.
    const params = new URLSearchParams(window.location.search);
    params.delete('v');
    expect(params.toString()).toBe(`managedSystem=${S2}`);
  });
});

describe('관리자 group turns 목록 범위 off (#764 k, ADR-0081 d4)', () => {
  const S1 = '11111111-1111-4111-8111-111111111111';
  const probe = (id: string, path: string, group: string) => ({ ...manifests[0]!, id, primary: true, path, group: groupId(group), pageKeys: ['focus', 'managedSystem', 'returnTo'] }) as (typeof manifests)[number];
  const registry = createRegistry({
    carrySets: [{ id: carrySetId('features'), pageKeys: ['managedSystem', 'returnTo'] }],
    spaces: [{ id: spaceId('operations'), label: { ko: 'Feature', en: 'Feature' }, description: { ko: '목적', en: 'Purpose' }, permission: 'features:access', homeMenuId: 'dashboard' }],
    groups: ['dashboard', 'featureAdmin', 'voc'].map(id => ({ id: groupId(id), label: { ko: id, en: id }, icon: ListTodo, space: spaceId('operations') })),
    menus: [...manifests, probe('probe-admin', '/operations/probe-admin', 'featureAdmin'), probe('probe-voc', '/operations/probe-voc', 'voc')],
  });
  const session = testSession(['platform:view', 'features:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
  const Control = scopeControlSlot.For(spaceId('operations'), manifests[0]!)!;
  const mount = async (path: string) => {
    window.history.replaceState(null, '', `${path}?managedSystem=${S1}`);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Control collapsed={false} /></PlatformProvider></I18nProvider>);
    await screen.findByTestId('picker');
  };

  it('disables the picker on a featureAdmin menu and keeps the carried value', async () => {
    await mount('/operations/probe-admin');
    expect(picker.props.at(-1)?.disabled).toBe(true);
    expect(picker.props.at(-1)?.value).toBe(S1);
  });

  it.each(['/operations/dashboard', '/operations/probe-voc'])('leaves the picker enabled on %s', async path => {
    await mount(path);
    expect(picker.props.every(props => props.disabled === undefined)).toBe(true);
  });
});
