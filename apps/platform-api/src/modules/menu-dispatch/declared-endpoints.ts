// Deployment rows become executable declarations here; policy stays in the platform permission
// table and data validation stays with the owner. The real registry still checks all specs and ids.
import { isCapability } from '@ap/feature-shared';

import type { CheckService } from '../permissions/check-service.js';
import { holdsPlatformPermission, PLATFORM_PERMISSION_TABLE } from '../platform-port/permissions.js';
import { DeclarationBundleError, type DeclarationBundle } from './declarations-file.js';
import type { MenuForwarder } from './forwarder.js';
import type { MenuDispatchContribution, MenuPermissionDeclaration } from './types.js';

/** Assemble loaded bundle data; refuse inconsistent programmatic bundles too, before registration. */
export function declaredContribution({ bundle, forwarder, checkService }: {
  bundle: DeclarationBundle;
  forwarder: MenuForwarder;
  checkService: CheckService;
}): MenuDispatchContribution {
  const problems: string[] = [];
  if (bundle.actions.length > 0) problems.push('declared actions are refused: the forwarder serves menu-query only');

  const ids = new Map<string, number>();
  for (const row of bundle.endpoints) ids.set(row.id, (ids.get(row.id) ?? 0) + 1);
  for (const [id, count] of ids) {
    if (count > 1) problems.push(`endpoint ${id}: declared ${count} times`);
  }
  for (const id of Object.keys(bundle.endpointOwners)) {
    if (!ids.has(id)) problems.push(`owner table names endpoint ${id}, which is not declared`);
  }
  const permissions: MenuPermissionDeclaration[] = bundle.permissions.map((row) => {
    if (!isCapability(row.capability)) {
      throw new DeclarationBundleError([`permission ${row.permission}: ${row.capability} is not a platform capability`]);
    }
    return { permission: row.permission, capability: row.capability };
  });
  for (const row of bundle.endpoints) {
    if (!Object.hasOwn(bundle.endpointOwners, row.id)) problems.push(`endpoint ${row.id}: no owner-table row`);
    if (!permissions.some((entry) => entry.permission === row.permission) &&
        !PLATFORM_PERMISSION_TABLE.some((entry) => entry.permission === row.permission)) {
      problems.push(`endpoint ${row.id}: permission ${row.permission} is neither declared in the bundle nor a kernel permission`);
    }
  }
  if (problems.length > 0) throw new DeclarationBundleError(problems);

  return {
    permissions,
    endpoints: bundle.endpoints.map(({ limits, requiredContext, ...spec }) => {
      const path = bundle.endpointOwners[spec.id];
      if (path === undefined) throw new DeclarationBundleError([`endpoint ${spec.id}: no owner-table row`]);
      return {
        spec: {
          ...spec,
          ...(requiredContext === undefined ? {} : { requiredContext }),
          ...(limits?.maxHours === undefined ? {} : { limits: { maxHours: limits.maxHours } }),
        },
        authorize: (actor, tx) => holdsPlatformPermission(checkService, actor, spec.permission, { ...(tx ? { tx } : {}), menuPermissions: permissions }),
        // judgeQueryShape already checks plain objects and paramKeys; values belong to the upstream.
        validate: () => ({ ok: true }),
        handle: (args) => forwarder.forward({ endpointId: spec.id, path, args }),
      };
    }),
  };
}
