// Production assembly of the menu-declaration path (#1729 h, ADR-0146/0147/0148): the deployment
// bundle (`MENU_DECLARATIONS_FILE`), the Ed25519 identity key and the Scope grant-service resolver
// become one `MenuDispatchContribution` plus the resolver the dispatch registry judges site/room
// grants with. Fail closed: any missing or invalid input throws before HTTP starts, and no thrown
// message carries key or token material. `MENU_DECLARATIONS_FILE` unset → `null` and the server
// starts exactly as before. The synthetic Scope resolver is test-only; this file — part of the
// production entry's import closure — never touches it (production-graph test).

import { readFile } from 'node:fs/promises';

import type { Db } from './db/client.js';
import { createGrantTableScopeResolver } from './modules/permissions/grant-table-scope-resolver.js';
import type { ScopeCatalog } from './modules/permissions/scope-catalog.js';
import type { AppConfig } from './config.js';
import { DeclarationBundleError, loadDeclarationBundle } from './modules/menu-dispatch/declarations-file.js';
import { isEnvelope } from './modules/menu-dispatch/bundle/calls.js';
import { routeCall } from './modules/menu-dispatch/bundle/routing.js';
import { readTargetSecrets, type TargetSecrets } from './modules/menu-dispatch/bundle/secrets.js';
import { connectorFactories as defaultFactories } from './modules/menu-dispatch/connectors/index.js';
import type { ConnectorFactories, RoutingLog } from './modules/menu-dispatch/connectors/types.js';
import { routedBootProblems } from './modules/menu-dispatch/routing.js';
import { declaredContribution } from './modules/menu-dispatch/declared-endpoints.js';
import { loadMenuSnapshot, menuSnapshotProblems } from './modules/menu-dispatch/menu-snapshot.js';
import { createMenuForwarder, normalizeMenuUpstreamBaseUrl, validateMenuOwnerPath } from './modules/menu-dispatch/forwarder.js';
import { createHttpScopeResolver } from './modules/menu-dispatch/http-scope-resolver.js';
import { createIdentityTokenSigner } from './modules/menu-dispatch/identity-token.js';
import type { ScopeResolver } from './modules/menu-dispatch/scope-resolver.js';
import type { MenuDispatchContribution } from './modules/menu-dispatch/types.js';
import type { CheckService } from './modules/permissions/check-service.js';

export type MenuDeclarationConfig = Pick<
  AppConfig,
  | 'MENU_DECLARATIONS_FILE'
  | 'MENU_DECLARATIONS_SNAPSHOT_FILE'
  | 'MENU_UPSTREAM_BASE_URL'
  | 'MENU_IDENTITY_KEY_FILE'
  | 'MENU_IDENTITY_KEY_ID'
  | 'MENU_SCOPE_GRANT_SERVICE_URL'
  | 'MENU_RESOLVER_TIMEOUT_MS'
  | 'MENU_UPSTREAM_TIMEOUT_MS'
>;

export interface MenuDeclarationSetup {
  /** The declared endpoints/permissions, appended to `buildServer`'s own contributions. */
  menuDispatch: readonly MenuDispatchContribution[];
  /** Validated target credentials, opaque until a connector explicitly reveals them. */
  targetSecrets?: Readonly<Record<string, TargetSecrets>>;
  /** The sole Scope source: grant table with a catalog, or optional HTTP service (ADR-0154). */
  scopeResolver?: ScopeResolver;
  scopeCatalog?: ScopeCatalog;
}

/**
 * Builds the production declaration setup. Throws (fail closed, before `buildServer`) on a missing
 * or invalid bundle, key file or key id — never logging key material. Returns `null` when the
 * deployment sets no `MENU_DECLARATIONS_FILE`.
 */
export async function loadMenuDeclarationSetup(
  config: MenuDeclarationConfig,
  deps: { db?: Db; checkService: CheckService; fetch?: typeof globalThis.fetch; connectorFactories?: ConnectorFactories; scopeCatalog?: Readonly<Record<string, readonly string[]>>; log?: (entry: RoutingLog) => void },
): Promise<MenuDeclarationSetup | null> {
  const file = config.MENU_DECLARATIONS_FILE;
  if (file === undefined) return null;
  // #1900 (ADR-0156): the bundle must match the menu declarations the app build wrote. No snapshot, no boot; the
  // comparison's problems join the bundle's own in one refusal.
  const snapshotFile = config.MENU_DECLARATIONS_SNAPSHOT_FILE;
  if (snapshotFile === undefined) throw new DeclarationBundleError(['MENU_DECLARATIONS_SNAPSHOT_FILE is required when MENU_DECLARATIONS_FILE is set']);
  const snapshot = await loadMenuSnapshot(snapshotFile);
  // Validate before reading any secret. No partially validated target can reach a connector.
  const bundle = await loadDeclarationBundle(file, (rows) => menuSnapshotProblems(rows, snapshot));
  const scopeCatalog = bundle.scopeCatalog;
  if (scopeCatalog && config.MENU_SCOPE_GRANT_SERVICE_URL !== undefined) {
    throw new DeclarationBundleError(['scopeCatalog and MENU_SCOPE_GRANT_SERVICE_URL cannot both be configured']);
  }
  if (scopeCatalog && !deps.db) throw new DeclarationBundleError(['scopeCatalog requires a database']);
  const envelope = Object.values(bundle.endpointOwners).some((owner) =>
    typeof owner === 'string' || owner.routes.some((route) => isEnvelope(routeCall(owner, route))));
  if (envelope) {
    const missing = (['MENU_UPSTREAM_BASE_URL', 'MENU_IDENTITY_KEY_FILE', 'MENU_IDENTITY_KEY_ID'] as const)
      .filter((key) => !config[key]);
    if (missing.length) throw new DeclarationBundleError(missing.map((key) => `${key} is required when the bundle has an envelope destination`));
  }
  const targetSecrets = bundle.targets === undefined ? undefined : await readTargetSecrets(bundle.targets);
  const connectorFactories = deps.connectorFactories ?? defaultFactories;
  const problems = routedBootProblems(bundle, connectorFactories, scopeCatalog ? Object.fromEntries(scopeCatalog.sites.map(entry => [entry.site, entry.rooms])) : deps.scopeCatalog);
  if (problems.length) throw new DeclarationBundleError(problems);
  const routedDeps = { connectorFactories, timeoutMs: config.MENU_UPSTREAM_TIMEOUT_MS, ...(targetSecrets ? { targetSecrets } : {}), log: deps.log ?? ((entry: RoutingLog) => { console.info(JSON.stringify(entry)); }) };
  const scopeResolver = scopeCatalog && deps.db
    ? createGrantTableScopeResolver({ db: deps.db, catalog: scopeCatalog })
    : config.MENU_SCOPE_GRANT_SERVICE_URL === undefined
    ? undefined
    : createHttpScopeResolver({
      baseUrl: config.MENU_SCOPE_GRANT_SERVICE_URL,
      timeoutMs: config.MENU_RESOLVER_TIMEOUT_MS,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });
  if (!envelope) return {
    menuDispatch: [declaredContribution({ bundle, snapshot, checkService: deps.checkService, ...routedDeps })],
    ...(scopeResolver ? { scopeResolver } : {}),
    ...(scopeCatalog ? { scopeCatalog } : {}),
    ...(targetSecrets === undefined ? {} : { targetSecrets }),
  };
  const keyId = config.MENU_IDENTITY_KEY_ID;
  const keyFile = config.MENU_IDENTITY_KEY_FILE;
  const upstreamBaseUrl = config.MENU_UPSTREAM_BASE_URL;
  if (!keyId || !keyFile || !upstreamBaseUrl) throw new DeclarationBundleError(['envelope destination configuration is incomplete']);
  const baseUrl = normalizeMenuUpstreamBaseUrl(upstreamBaseUrl);
  for (const [id, path] of Object.entries(bundle.endpointOwners)) {
    if (typeof path !== 'string') continue;
    try { validateMenuOwnerPath(path); } catch {
      throw new Error(`Invalid endpointOwners field for ${id}: invalid menu upstream owner path`);
    }
  }

  // Step 2: the Ed25519 private key (ADR-0095 §2/§5). Fail closed on read errors; the signer
  // refuses anything that is not an Ed25519 key. Neither path exposes key material.
  let privateKeyPem: string;
  try {
    privateKeyPem = await readFile(keyFile, 'utf8');
  } catch {
    throw new Error(`identity key file at ${keyFile} cannot be read`);
  }

  // Step 3: the pieces (ADR-0147/0148) — signer, forwarder against the upstream, optional
  // grant-service resolver, and the contribution that turns the bundle rows into declarations.
  const signer = createIdentityTokenSigner({ privateKeyPem, keyId });
  const forwarder = createMenuForwarder({
    baseUrl,
    timeoutMs: config.MENU_UPSTREAM_TIMEOUT_MS,
    signer,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  return {
    ...(targetSecrets === undefined ? {} : { targetSecrets }),
    menuDispatch: [declaredContribution({ bundle, snapshot, forwarder, checkService: deps.checkService, ...routedDeps })],
    ...(scopeResolver ? { scopeResolver } : {}),
    ...(scopeCatalog ? { scopeCatalog } : {}),
  };
}
