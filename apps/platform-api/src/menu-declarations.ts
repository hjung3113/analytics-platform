// Production assembly of the menu-declaration path (#1729 h, ADR-0146/0147/0148): the deployment
// bundle (`MENU_DECLARATIONS_FILE`), the Ed25519 identity key and the Scope grant-service resolver
// become one `MenuDispatchContribution` plus the resolver the dispatch registry judges site/room
// grants with. Fail closed: any missing or invalid input throws before HTTP starts, and no thrown
// message carries key or token material. `MENU_DECLARATIONS_FILE` unset → `null` and the server
// starts exactly as before. The synthetic Scope resolver is test-only; this file — part of the
// production entry's import closure — never touches it (production-graph test).

import { readFile } from 'node:fs/promises';

import type { AppConfig } from './config.js';
import { loadDeclarationBundle } from './modules/menu-dispatch/declarations-file.js';
import { declaredContribution } from './modules/menu-dispatch/declared-endpoints.js';
import { createMenuForwarder } from './modules/menu-dispatch/forwarder.js';
import { createHttpScopeResolver } from './modules/menu-dispatch/http-scope-resolver.js';
import { createIdentityTokenSigner } from './modules/menu-dispatch/identity-token.js';
import type { ScopeResolver } from './modules/menu-dispatch/scope-resolver.js';
import type { MenuDispatchContribution } from './modules/menu-dispatch/types.js';
import type { CheckService } from './modules/permissions/check-service.js';

export type MenuDeclarationConfig = Pick<
  AppConfig,
  | 'MENU_DECLARATIONS_FILE'
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
  /** Present only when `MENU_SCOPE_GRANT_SERVICE_URL` is set (ADR-0147). */
  scopeResolver?: ScopeResolver;
}

/**
 * Builds the production declaration setup. Throws (fail closed, before `buildServer`) on a missing
 * or invalid bundle, key file or key id — never logging key material. Returns `null` when the
 * deployment sets no `MENU_DECLARATIONS_FILE`.
 */
export async function loadMenuDeclarationSetup(
  config: MenuDeclarationConfig,
  deps: { checkService: CheckService; fetch?: typeof globalThis.fetch },
): Promise<MenuDeclarationSetup | null> {
  const file = config.MENU_DECLARATIONS_FILE;
  if (file === undefined) return null;
  // config.ts already refuses these; the recheck keeps this module fail-closed on its own inputs.
  if (config.MENU_UPSTREAM_BASE_URL === undefined || config.MENU_IDENTITY_KEY_FILE === undefined) {
    throw new Error('MENU_DECLARATIONS_FILE requires MENU_UPSTREAM_BASE_URL and MENU_IDENTITY_KEY_FILE');
  }
  const keyId = config.MENU_IDENTITY_KEY_ID;
  if (keyId === undefined) {
    throw new Error('MENU_DECLARATIONS_FILE requires MENU_IDENTITY_KEY_ID (the identity token kid)');
  }

  // Step 1: the bundle (ADR-0146) — every failure mode throws from the loader itself.
  const bundle = await loadDeclarationBundle(file);

  // Step 2: the Ed25519 private key (ADR-0095 §2/§5). Fail closed on read errors; the signer
  // refuses anything that is not an Ed25519 key. Neither path exposes key material.
  let privateKeyPem: string;
  try {
    privateKeyPem = await readFile(config.MENU_IDENTITY_KEY_FILE, 'utf8');
  } catch {
    throw new Error(`identity key file at ${config.MENU_IDENTITY_KEY_FILE} cannot be read`);
  }

  // Step 3: the pieces (ADR-0147/0148) — signer, forwarder against the upstream, optional
  // grant-service resolver, and the contribution that turns the bundle rows into declarations.
  const signer = createIdentityTokenSigner({ privateKeyPem, keyId });
  const forwarder = createMenuForwarder({
    baseUrl: config.MENU_UPSTREAM_BASE_URL,
    timeoutMs: config.MENU_UPSTREAM_TIMEOUT_MS,
    signer,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  const scopeResolver = config.MENU_SCOPE_GRANT_SERVICE_URL === undefined
    ? undefined
    : createHttpScopeResolver({
      baseUrl: config.MENU_SCOPE_GRANT_SERVICE_URL,
      timeoutMs: config.MENU_RESOLVER_TIMEOUT_MS,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });
  return {
    menuDispatch: [declaredContribution({ bundle, forwarder, checkService: deps.checkService })],
    ...(scopeResolver ? { scopeResolver } : {}),
  };
}
