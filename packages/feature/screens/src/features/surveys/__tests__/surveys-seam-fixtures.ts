// Shared fetch fake and seam for the #764 l seam tests (SurveysScreen, useSurveyDetailParts).
import { vi } from 'vitest';
export const MS_1 = '99999999-9999-9999-9999-999999999901';
export const S1_ID = '11111111-1111-4111-8111-111111111111';
export const S2_ID = '44444444-4444-4444-4444-444444444444';
export const STALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const DENIED_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export const S1 = {
  id: S1_ID,
  workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  display_id: 'SRV-1',
  type: 'discovery',
  status: 'open',
  title: '온보딩 설문',
  description: null,
  primary_managed_system_id: MS_1,
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: '22222222-2222-4222-8222-222222222222',
  opened_at: '2026-01-02T00:00:00.000Z',
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  questions: [],
};
export const S2 = {
  ...S1,
  id: S2_ID,
  display_id: 'SRV-2',
  status: 'closed',
  title: '결과 확인 설문',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function installSurveysFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/surveys') return json([S1, S2]);
    if (path === `/surveys/${S1_ID}`) return json(S1);
    if (path === `/surveys/${S2_ID}`) return json(S2);
    if (path === `/surveys/${DENIED_ID}`) return json({ code: 'permission.denied' }, 403);
    if (path.startsWith('/surveys/')) return json({ code: 'not_found.record' }, 404);
    if (path === '/managed-systems') return json({ items: [], total: 0 });
    if (path === '/actors') return json({ actors: [] });
    if (path === '/me')
      return json({
        actor: {
          id: '22222222-2222-4222-8222-222222222222',
          external_id: 'user-1',
          email: 'user@example.com',
          display_name: '사용자',
          role_level: 'user',
        },
        workspace_id: 'ws',
      });
    if (path === '/me/permissions/check')
      return json({ state: 'approved', decision: { allow: true, via: 'role', requestable: null } });
    return json({ code: 'not_mocked' }, 500);
  }) as typeof globalThis.fetch;
}
