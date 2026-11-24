// #1291 B2 — the real Cluster list through the bridge: Cluster 생성 is drawn in the platform page head, once, for admin/developer only. (수신함 VOC 생성: see the report, U1 — the platform has no create destination for it.)
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { featureQueryClient } from '@ap/feature-bridge';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { expectHeadPrimaryAction, LAZY_MOUNT_WAIT, settleFetch } from '@ap/feature-bridge/testing';
import { mountAt } from '../test-support';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const CLUSTERS = '/flow/clusters';

function installFetch(role: string) {
  const request = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/features/me')) return json({ actor: { id: 'a1', external_id: 'a1', email: 'a@x', display_name: 'Admin', role_level: role }, workspace_id: 'w1' });
    return json({ items: [], total: 0 });
  });
  vi.stubGlobal('fetch', request);
  return request;
}

beforeAll(() => import('./FeatureClusters'), 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Cluster 생성 through the bridge', () => {
  it('is drawn once in the page head, not in the list toolbar', async () => {
    installFetch('admin');
    const { container } = mountAt(CLUSTERS);
    await expectHeadPrimaryAction({ container, locate: { testId: 'cluster-create-button' }, drawn: true });
  });

  it('is absent for a viewer; the permission hint stays in the list toolbar', async () => {
    const request = installFetch('viewer');
    const { container } = mountAt(CLUSTERS);
    await screen.findByTestId('cluster-create-hint', undefined, LAZY_MOUNT_WAIT);
    await expectHeadPrimaryAction({ container, locate: { testId: 'cluster-create-button' }, drawn: false, settled: () => settleFetch(request, '/api/features/me') });
  });
});

const createScenarios = ['denied source', 'cached arrival denial', 'confirmed tab', 'invalid response'] as const;
it.each(createScenarios)('handles cross-System 반복 VOC creation with %s', async (scenario) => {
  const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  onTestFinished(() => {
    if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });
  const deniedSystem = '11111111-1111-4111-8111-111111111111';
  const allowedSystem = '22222222-2222-4222-8222-222222222222';
  const cluster = {
    id: '33333333-3333-4333-8333-333333333333', workspace_id: deniedSystem,
    primary_managed_system_id: allowedSystem, created_by: allowedSystem,
    display_id: 'VCL-001', title: 'New cluster in allowed System', summary: '',
    status: 'draft', member_count: 0, members: [], linked_findings: [],
    created_at: '2026-07-10T00:00:00.000Z', updated_at: '2026-07-10T00:00:00.000Z',
  };
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    const path = url.pathname.replace('/api/features', '');
    if (path === '/me') return json({ actor: { id: allowedSystem, external_id: 'developer', email: 'developer@example.test', display_name: 'Developer', role_level: 'developer' }, workspace_id: deniedSystem });
    if (path === '/me/permissions/scope') return json({ scope: { kind: 'scoped', managed_system_ids:
      scenario === 'denied source' ? [allowedSystem] : [deniedSystem, allowedSystem],
    } });
    if (path === '/me/permissions/check') return json({ state: 'blocked_non_requestable', decision: { allow: false } });
    if (path === '/managed-systems') return json({ items: [{
      id: allowedSystem, workspace_id: deniedSystem, slug: 'allowed', name: 'Allowed System',
      external_key: null, default_owner_actor_id: null, default_owner_team_id: null,
      default_reviewer_actor_id: null, default_reviewer_team_id: null,
      archived_at: null, archived_by_actor_id: null, created_at: cluster.created_at, updated_at: cluster.updated_at,
    }], total: 1 });
    if (path === '/voc-clusters' && init?.method === 'POST') {
      return json(scenario === 'invalid response' ? { ...cluster, primary_managed_system_id: 'all' } : cluster);
    }
    if (path === '/voc-clusters') return json({ items:
      url.searchParams.get('managed_system_id') === allowedSystem && scenario !== 'cached arrival denial' ? [cluster] : [],
    });
    if (path === `/voc-clusters/${cluster.id}`) return json(cluster);
    return json({ items: [], total: 0 });
  });
  vi.stubGlobal('fetch', request);
  mountAt(`${CLUSTERS}?managedSystem=${deniedSystem}`);
  if (scenario === 'denied source') {
    await screen.findByRole('heading', { name: '반복 VOC 목록' }, LAZY_MOUNT_WAIT);
  } else {
    await settleFetch(request, '/me/permissions/scope?capability=finding.read');
  }
  if (scenario === 'confirmed tab' || scenario === 'invalid response') {
    await userEvent.click(await screen.findByTestId('cluster-tab-confirmed'));
    expect(screen.getByTestId('cluster-tab-confirmed').getAttribute('aria-selected')).toBe('true');
  }
  fireEvent.click(screen.getByTestId('cluster-create-button'));
  fireEvent.change(await screen.findByTestId('cluster-title-input'), { target: { value: cluster.title } });
  const systems = screen.getByRole('combobox', { name: '시스템' });
  await waitFor(() => expect(systems.hasAttribute('disabled')).toBe(false));
  fireEvent.click(systems);
  fireEvent.click(await screen.findByRole('option', { name: 'Allowed System' }));
  if (scenario === 'cached arrival denial') {
    featureQueryClient.setQueryData(['voc-clusters', { managedSystemId: allowedSystem }], { items: [] });
    featureQueryClient.setQueryData(['permission-scope', 'finding.read', `${deniedSystem}:${allowedSystem}:developer`], {
      scope: { kind: 'scoped', managed_system_ids: [deniedSystem] },
    });
    featureQueryClient.setQueryData(['permission-check', 'finding.read', allowedSystem], {
      state: 'blocked_non_requestable', decision: { allow: false },
    });
  }
  fireEvent.click(screen.getByTestId('create-cluster-submit'));

  if (scenario === 'invalid response') {
    expect(await screen.findByTestId('create-cluster-error')).toBeTruthy();
    expect(screen.getByTestId('cluster-tab-confirmed').getAttribute('aria-selected')).toBe('true');
    expect(window.location.search).toBe(`?managedSystem=${deniedSystem}`);
    return;
  }

  await settleFetch(request, `/voc-clusters?managed_system_id=${allowedSystem}`);
  expect(Object.fromEntries(new URLSearchParams(window.location.search))).toMatchObject({
    managedSystem: allowedSystem, focus: cluster.id,
  });
  const aside = await screen.findByRole('complementary', { name: '상세 패널' });
  expect(await within(aside).findByText(cluster.title)).toBeTruthy();
  await settleFetch(request, `/voc-clusters/${cluster.id}`);
  expect(new URLSearchParams(window.location.search).get('focus')).toBe(cluster.id);
  if (scenario === 'confirmed tab') {
    expect(screen.getByTestId('cluster-tab-confirmed').getAttribute('aria-selected')).toBe('false');
  }
});
