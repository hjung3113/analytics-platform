/**
 * Home query endpoints (packages/contracts/src/menu-query.ts, #130).
 * Client-safe: declarations and data types only — notice data lives in `src/mock/`.
 */
import { defineEndpoint } from '@ap/contracts';

export type Notice = { id: string; title: { ko: string; en: string }; scopeId: string | null; until: string };

/**
 * Notices targeted at a site (08 §6). The endpoint permission is `notice:view` while the home menu is
 * `platform:view` (Q5: endpoint permission is data access, not menu entry). Home neither requires nor applies
 * Scope, so the targeted site travels as a param — targeting, not an access boundary.
 */
export const noticesEndpoint = defineEndpoint<{ targetScopeId: string | null }, Notice[]>({
  id: 'home.notices',
  menuId: 'home',
  paramKeys: { targetScopeId: true },
  permission: 'notice:view',
  requiresScope: false,
  context: {},
  kinds: [],
  mergeTimeDomain: false,
});
