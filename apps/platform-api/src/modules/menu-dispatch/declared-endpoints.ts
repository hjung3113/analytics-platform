// Deployment rows become executable declarations here; policy stays in the platform permission
// table and data validation stays with the owner. The real registry still checks all specs and ids.
import { isCapability } from '@ap/feature-shared';

import type { CheckService } from '../permissions/check-service.js';
import { holdsPlatformPermission, PLATFORM_PERMISSION_TABLE } from '../platform-port/permissions.js';
import { DeclarationBundleError, validateDeclarationBundle, type DeclarationBundle } from './declarations-file.js';
import type { MenuForwarder } from './forwarder.js';
import { connectorFactories as defaultFactories } from './connectors/index.js';
import type { ConnectorFactories, RoutingLog } from './connectors/types.js';
import type { TargetSecrets } from './bundle/secrets.js';
import { validateParamValues } from './binding-values.js';
import { routedBootProblems } from './routing.js';
import { handleRouted } from './routed-handler.js';
import { MAX_ROWS_REASON } from './bundle/validation.js';
import { assertBundleMatchesMenuSnapshot, parseMenuSnapshot, type MenuDeclarationSnapshot } from './menu-snapshot.js';
import type { MenuDispatchContribution, MenuPermissionDeclaration } from './types.js';

/**
 * Assemble loaded bundle data; refuse inconsistent programmatic bundles too, before registration. `snapshot` is the
 * menu declaration snapshot (ADR-0156): required on both assembly paths, so a programmatic bundle meets the same rules.
 */
export function declaredContribution({ bundle, snapshot, forwarder, checkService, connectorFactories = defaultFactories, targetSecrets, timeoutMs = 27000, log }: {
  bundle: DeclarationBundle;
  snapshot: MenuDeclarationSnapshot;
  forwarder?: MenuForwarder;
  checkService: CheckService;
  connectorFactories?: ConnectorFactories;
  targetSecrets?: Readonly<Record<string, TargetSecrets>>;
  timeoutMs?: number;
  log?: (entry: RoutingLog) => void;
}): MenuDispatchContribution {
  if (Object.values(bundle.endpointOwners).some((owner) => typeof owner !== 'string')) validateDeclarationBundle(bundle);
  const problems: string[] = [];
  if (!forwarder && Object.values(bundle.endpointOwners).some((owner) => typeof owner === 'string')) problems.push('declared endpoints require a forwarder');
  problems.push(...routedBootProblems(bundle, connectorFactories));
  for (const row of bundle.endpoints) {
    if (new Set(row.kinds).size !== (row.kinds?.length ?? 0)) problems.push(`endpoint ${row.id}: kinds must not contain duplicates`);
    if (row.limits?.maxRows !== undefined && typeof bundle.endpointOwners[row.id] === 'string') problems.push(`endpoint ${row.id}: ${MAX_ROWS_REASON}`);
  }
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
  assertBundleMatchesMenuSnapshot(bundle, parseMenuSnapshot(snapshot));

  return {
    permissions,
    endpoints: bundle.endpoints.map(({ limits, requiredContext, ...spec }) => {
      const path = bundle.endpointOwners[spec.id];
      if (path === undefined) throw new DeclarationBundleError([`endpoint ${spec.id}: no owner-table row`]);
      const routed = typeof path !== 'string';
      return {
        spec: {
          ...spec,
          ...(requiredContext === undefined ? {} : { requiredContext }),
          ...(routed ? (limits === undefined ? {} : { limits: { ...(limits.maxHours === undefined ? {} : { maxHours: limits.maxHours }), ...(limits.maxRows === undefined ? {} : { maxRows: limits.maxRows }) } }) : (limits?.maxHours === undefined ? {} : { limits: { maxHours: limits.maxHours } })),
        },
        ...(routed ? { upstreamTimeoutMs: timeoutMs } : {}),
        authorize: (actor, tx) => holdsPlatformPermission(checkService, actor, spec.permission, { ...(tx ? { tx } : {}), menuPermissions: permissions }),
        // Step 2: routed calls judge typed values here; legacy envelope values stay upstream-owned.
        validate: (params) => routed ? validateParamValues(spec.paramTypes ?? {}, params) : { ok: true },
        handle: (args) => {
          if (typeof path !== 'string') return handleRouted({ ...spec, ...(limits ? { limits } : {}) }, path, bundle, { connectorFactories, timeoutMs, ...(forwarder ? { forwarder } : {}), ...(targetSecrets ? { targetSecrets } : {}), ...(log ? { log } : {}) }, args);
          if (!forwarder) throw new DeclarationBundleError(['declared endpoints require a forwarder']);
          return forwarder.forward({ endpointId: spec.id, path, args });
        },
      };
    }),
  };
}
