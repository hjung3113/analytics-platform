// #1291 B2 / U2 — the real Survey 관리 screen through the bridge: Survey 생성 is drawn in the platform page head, once, gated by survey.manage, and stays there on an empty list.
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { mountAt, warmPages } from '../test-support';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** Controlled server: survey.manage scope is `all` or none; the survey list holds `surveys`. */
function installFetch(manage: boolean, surveys: unknown[]) {
  const request = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/me/permissions/scope')) return json({ scope: manage ? { kind: 'all' } : { kind: 'scoped', managed_system_ids: [] } });
    if (url.includes('/api/features/me')) return json({ actor: { id: 'a1', external_id: 'a1', email: 'a@x', display_name: 'Admin', role_level: 'admin' }, workspace_id: 'w1' });
    if (url.includes('/surveys')) return json(surveys);
    return json({ items: [], total: 0 });
  });
  vi.stubGlobal('fetch', request);
  return request;
}
const survey = { id: '99999999-9999-4999-8999-99999999999a', display_id: 'SRV-1', title: 'Q3 사용성 진단', type: 'discovery', status: 'draft', description: '', primary_managed_system_id: '33333333-3333-4333-8333-333333333333', analytics_area_id: null, operator_actor_id: null, responses_identity_protected: true, created_by: '11111111-1111-4111-8111-111111111111', opened_at: null, closed_at: null, created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z', questions: [] };
const LIST = '/flow/survey-management';

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Survey 생성 through the bridge', () => {
  it('is drawn once in the page head for a nonempty list', async () => {
    installFetch(true, [survey]);
    const { container } = mountAt(LIST);
    const button = await screen.findByRole('button', { name: 'Survey 생성' }, LAZY_MOUNT_WAIT);
    expect(container.querySelector('header [data-feature-primary-action]')?.contains(button)).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Survey 생성' })).toHaveLength(1);
  });

  it('stays in the page head on a truly empty list, beside the empty state call to action (U2)', async () => {
    installFetch(true, []);
    const { container } = mountAt(LIST);
    const empty = await screen.findByTestId('survey-empty-create-button', undefined, LAZY_MOUNT_WAIT);
    const head = await waitFor(() => {
      const found = container.querySelector('header [data-feature-primary-action] [data-testid="survey-create-button"]');
      expect(found).not.toBeNull();
      return found;
    });
    expect(head).not.toBe(empty);
    expect(container.querySelectorAll('[data-testid="survey-create-button"]')).toHaveLength(1);
  });

  it('is absent for a user without survey.manage', async () => {
    const request = installFetch(false, [survey]);
    const { container } = mountAt(LIST);
    await screen.findByText('Q3 사용성 진단', undefined, LAZY_MOUNT_WAIT);
    await waitFor(() => expect(request.mock.calls.some(([input]) => String(input).includes('/me/permissions/scope'))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('button', { name: 'Survey 생성' })).toBeNull();
    expect(container.querySelector('header [data-feature-primary-action] button')).toBeNull();
  });
});
