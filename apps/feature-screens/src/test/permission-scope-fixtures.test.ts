// The Site·공정 fixtures the 1844f2 screen tests use are the #1844c server DTOs: each body round-trips through its
// shared transport schema unchanged (a stripped or renamed key would fail here, not silently in a screen test).

import {
  createPermissionRequestResultSchema,
  minePermissionRequestRowSchema,
  permissionGrantAdminItemSchema,
  permissionGrantOptionsSchema,
  permissionRequestAdminDetailSchema,
  permissionScopeCandidatesResponseSchema,
} from '@ap/feature-shared';
import { describe, expect, it } from 'vitest';

import {
  SCOPE_ACTOR,
  scopeAdminDetailBody,
  scopeAdminRowBody,
  scopeCandidatesBody,
  scopeCreateResultBody,
  scopeGrantItemBody,
  scopeGrantOptionsBody,
  scopeMineRowBody,
} from './fixtures/permission-scope';

const ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';

describe('Site·공정 fixtures match the server DTOs', () => {
  it.each([
    ['scope-candidates', permissionScopeCandidatesResponseSchema, scopeCandidatesBody()],
    ['create result', createPermissionRequestResultSchema, scopeCreateResultBody(ID, 'site_room', 'SITE-A', 'RA2')],
    ['mine row', minePermissionRequestRowSchema, scopeMineRowBody(ID, 'pending', 'site', 'SITE-B')],
    ['admin detail', permissionRequestAdminDetailSchema, scopeAdminDetailBody(scopeAdminRowBody(ID, 'site', 'SITE-A'))],
    ['grant item', permissionGrantAdminItemSchema, scopeGrantItemBody(ID, 'site_room', 'SITE-Z', 'RZ9', false)],
    ['grant options', permissionGrantOptionsSchema, scopeGrantOptionsBody(SCOPE_ACTOR, 'Actor One')],
  ] as const)('%s round-trips unchanged', (_name, schema, body) => {
    expect(schema.parse(body)).toEqual(body);
  });

  it('the selected detail offers only the requested target, never a widened one', () => {
    const detail = scopeAdminDetailBody(scopeAdminRowBody(ID, 'site', 'SITE-A'));
    expect(detail.approval_scope_candidates).toEqual([
      { managed_system_id: null, scope_kind: 'site', scope_site: 'SITE-A', scope_room: null },
    ]);
    expect(detail.allowed_actions).not.toContain('deny');
  });

  it('site/room grant items carry in_catalog and no Managed System', () => {
    const item = scopeGrantItemBody(ID, 'site', 'SITE-A', null, true);
    expect(item).toMatchObject({ capability: 'scope.read', managed_system_id: null, in_catalog: true });
  });
});
