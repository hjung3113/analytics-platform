// `home.notices` as a menu-dispatch declaration (ADR-0095 §1, #1106). Behaviour is the one the route
// had before the registry: no Context key, one param `targetScopeId` (string or null), the endpoint's
// own `notice:view` (data access, not the Home menu's `platform:view`, Q5), then the notice read.
// Every other endpoint id is an `error`, not a proxy to a fake.

import type { Db } from '../../db/client.js';
import type { MenuDispatchContribution } from '../menu-dispatch/types.js';
import type { CheckService } from '../permissions/check-service.js';
import { createPlatformNoticeService } from '../platform-notices/index.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { unsafeText } from '../platform-port/text-safety.js';

export const HOME_NOTICES_ENDPOINT = 'home.notices';

export interface HomeNoticesDeps {
  db: Db;
  checkService: CheckService;
  now?: () => Date;
}

export function homeNoticesContribution(deps: HomeNoticesDeps): MenuDispatchContribution {
  const notices = createPlatformNoticeService({
    db: deps.db,
    checkService: deps.checkService,
    ...(deps.now ? { now: deps.now } : {}),
  });
  return {
    endpoints: [
      {
        spec: {
          id: HOME_NOTICES_ENDPOINT,
          menuId: 'home',
          paramKeys: ['targetScopeId'],
          permission: 'notice:view',
          requiresScope: false,
          context: {},
          mergeTimeDomain: false,
        },
        authorize: (actor, tx) =>
          holdsPlatformPermission(deps.checkService, actor, 'notice:view', tx ? { tx } : {}),
        validate(params) {
          const target = params.targetScopeId;
          return target !== null && (typeof target !== 'string' || unsafeText(target))
            ? { ok: false, message: 'targetScopeId must be a string or null' }
            : { ok: true };
        },
        async handle({ actor, params }) {
          const result = await notices.homeNotices(actor, params.targetScopeId as string | null);
          return { outcome: result.outcome, data: result.data };
        },
      },
    ],
  };
}
