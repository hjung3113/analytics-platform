import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { ID_A, ID_B, json, mountAt, stubFetch, switchableAdapter } from '../feature/test-support';

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/permission-requests');
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Permission requests without a feature API (mock preview)', () => {
  it('C1 shows 실서버 필요, mounts nothing from feature and requests nothing', async () => {
    setFeatureApi(null);
    const calls = stubFetch(() => new Response('{}'));
    mountAt(switchableAdapter().adapter, '/permission-requests');
    expect(await screen.findByRole('heading', { name: '권한 요청' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('permission-requests')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('Permission request prefills', () => {
  const scrollIntoView = Element.prototype.scrollIntoView;
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = () => undefined;
  });
  afterEach(() => { Element.prototype.scrollIntoView = scrollIntoView; });

  const origin = '/notices?v=1';
  const now = '2026-11-13T00:00:00.000Z';
  const inactive = '33333333-3333-4333-8333-333333333333';
  const missing = '44444444-4444-4444-8444-444444444444';
  const system = (id: string, slug: string, archived_at: string | null = null) => ({
    id, slug, name: 'Power BI', archived_at, workspace_id: 'workspace', external_key: null,
    default_owner_actor_id: null, default_owner_team_id: null,
    default_reviewer_actor_id: null, default_reviewer_team_id: null,
    archived_by_actor_id: null, created_at: now, updated_at: now,
  });
  const finding = () => screen.findByRole('checkbox', { name: /^Finding 조회/ });
  const systemPicker = () => screen.findByRole('combobox', { name: '시스템' });

  function openForm(
    params: { capability?: string; managedSystem?: string; returnTo?: string },
    options: { post?: () => Response; declared?: Promise<Response> } = {},
  ) {
    setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
    stubFetch((url, method) => {
      const { pathname } = new URL(url, window.location.origin);
      if (method === 'POST') return options.post?.() ?? json({}, 400);
      switch (pathname) {
        case '/api/features/me':
          return json({ actor: { id: 'developer', external_id: 'developer', email: '', display_name: 'Developer', role_level: 'developer' }, workspace_id: 'workspace' });
        case '/api/features/managed-systems':
          return json({ items: [system(ID_A, 'power-bi-a'), system(ID_B, 'power-bi-b'), system(inactive, 'power-bi-c', now)], total: 3 });
        case '/api/features/me/permissions/declared-capabilities':
          return options.declared ?? json({ items: [] });
        case '/api/features/permission-groups':
          return json({ items: [] });
        case '/api/features/permission-requests/mine':
          return json({ requests: [] });
        default:
          throw new Error(`Unexpected request: ${url}`);
      }
    });
    const query = new URLSearchParams(params);
    mountAt(switchableAdapter('developer').adapter, query.size ? `/permission-requests?${query}` : '/permission-requests');
  }

  async function submit(path = '/api/features/permission-requests') {
    fireEvent.change(screen.getByRole('textbox', { name: /사유/ }), { target: { value: 'Need access' } });
    fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }));
    return waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, init]) => url === path && init?.method === 'POST');
      expect(call).toBeDefined();
      return JSON.parse(String(call?.[1]?.body));
    });
  }

  it('preselects the offered capability and active system and labels duplicate names by slug', async () => {
    openForm({ capability: 'finding.read', managedSystem: ID_B });
    expect((await finding()).getAttribute('aria-checked')).toBe('true');
    const picker = await systemPicker();
    expect(picker.textContent).toBe('Power BI (power-bi-b)');
    picker.focus();
    await userEvent.setup().keyboard('{ArrowDown}');
    expect((await screen.findAllByRole('option')).map(option => option.textContent)).toEqual([
      'Power BI (power-bi-a)', 'Power BI (power-bi-b)',
    ]);
  });

  it('defaults a prefilled optional-system capability to the whole workspace', async () => {
    openForm({ capability: 'survey.export' });
    expect((await systemPicker()).textContent).toBe('전체');
  });

  it('keeps the user pick when the declared capability catalog arrives late', async () => {
    const id = 'ext.example.export';
    let resolveCatalog!: (response: Response) => void;
    const catalog = new Promise<Response>(resolve => { resolveCatalog = resolve; });
    openForm({ capability: id }, { declared: catalog });
    const picked = await screen.findByRole('checkbox', { name: '전체 읽기' });
    fireEvent.click(picked);
    resolveCatalog(json({ items: [{ id, display_name: 'Declared export', sensitive: false, requestable: true }] }));
    expect((await screen.findByRole('checkbox', { name: /^Declared export/ })).getAttribute('aria-checked')).toBe('false');
    expect(picked.getAttribute('aria-checked')).toBe('true');
  });

  it('clears the prefill and its origin after a successful request', async () => {
    openForm({ capability: 'workspace.read', returnTo: origin }, {
      post: () => json({ id: ID_A, status: 'pending', created_at: now }, 201),
    });
    const checkbox = await screen.findByRole('checkbox', { name: '전체 읽기' });
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(await submit()).toHaveProperty('return_route_intent', origin);
    await waitFor(() => expect(checkbox.getAttribute('aria-checked')).toBe('false'));

    fireEvent.click(checkbox);
    fireEvent.change(screen.getByRole('textbox', { name: /사유/ }), { target: { value: 'Another request' } });
    fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }));
    await waitFor(() => {
      const posts = vi.mocked(fetch).mock.calls.filter(([url, init]) => url === '/api/features/permission-requests' && init?.method === 'POST');
      expect(posts).toHaveLength(2);
      expect(JSON.parse(String(posts[1]?.[1]?.body))).toEqual({
        requested_capability: 'workspace.read', reason: 'Another request',
      });
    });
  });

  it.each([
    { capability: 'unknown.read', managedSystem: inactive },
    { capability: 'workspace.admin', managedSystem: missing },
    {},
  ])('leaves the form unselected for %j', async params => {
    openForm(params);
    const checkbox = await finding();
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('combobox', { name: '시스템' })).toBeNull();
    fireEvent.click(checkbox);
    expect((await systemPicker()).textContent).toBe('시스템 선택');
  });

  it.each(['single', 'batch'])('submits an accepted returnTo in a %s request', async mode => {
    openForm({ capability: 'workspace.read', returnTo: origin });
    const checkbox = await screen.findByRole('checkbox', { name: '전체 읽기' });
    // Select manually on the baseline so this assertion isolates the submit body.
    if (checkbox.getAttribute('aria-checked') !== 'true') fireEvent.click(checkbox);
    if (mode === 'batch') {
      fireEvent.click(await finding());
      const picker = await systemPicker();
      picker.focus();
      await userEvent.setup().keyboard('{ArrowDown}');
      const [first] = await screen.findAllByRole('option');
      fireEvent.click(first!);
    }
    expect(await submit(mode === 'batch' ? '/api/features/permission-requests/batch' : undefined))
      .toHaveProperty('return_route_intent', origin);
    expect(document.querySelector('[data-return-row]')).toBeNull();
  });

  it.each([
    'https://example.test/notices',
    'http:example.test',
    'javascript:void(0)',
    '//example.test/notices',
    '/\\example.test/notices',
    '/%5Cexample.test/notices',
    '/unregistered',
  ])('omits rejected returnTo %s from the request', async returnTo => {
    openForm({ returnTo });
    fireEvent.click(await screen.findByRole('checkbox', { name: '전체 읽기' }));
    expect(await submit()).not.toHaveProperty('return_route_intent');
  });
});
