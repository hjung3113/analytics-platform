// Server-side declarations of the menu ports (`menuQuery` / `menuAction`). The shapes mirror
// `EndpointSpec` / `ActionSpec` of `@ap/contracts` (packages/sdk/contracts/src/menu/menu-query.ts,
// adapter/action.ts) as plain data: platform-api source may not import that package at runtime
// (check-boundaries rule 11, ADR-0073). A module contributes declarations; the dispatch engine
// owns the judgment order (docs/integration/real-server-checklist.md §3) and never any business write.

import type { Tx } from '../../db/tx.js';
import type { PlatformActor } from '../platform-port/permissions.js';

/** `ContextKey` of the contract: the capability names a manifest/endpoint declares. */
export const CONTEXT_KEYS = [
  'time',
  'roomNames',
  'line',
  'prcGroup',
  'condition',
  'selection',
  'lot',
  'ppid',
  'recipe',
  'metric',
] as const;
export type ContextKey = (typeof CONTEXT_KEYS)[number];

export interface EndpointDeclarationSpec {
  /** '<group>.<name>', globally unique transport key. */
  id: string;
  /** Owning menu manifest id. */
  menuId: string;
  /** Runtime allow-list of `params` keys; list every key, including optional ones. */
  paramKeys: readonly string[];
  /** The endpoint's own data permission name (declared; never read from the request). */
  permission: string;
  /** Refused at startup until the server has a Scope resolver (#1087). */
  requiresScope: boolean;
  /** Applied Context keys. A key that is absent is unsupported; `reference` is carried, not a filter. */
  context: Partial<Record<ContextKey, 'apply' | 'reference'>>;
  /** Applied Context keys that must be non-null (empty sets stay present). */
  requiredContext?: readonly ContextKey[];
  limits?: { maxHours?: number; maxRows?: number };
  /** Refused at startup until the server has a Scope resolver (#1087): §6.3 needs the resolved equipment set. */
  mergeTimeDomain: boolean;
}

export type EndpointOutcome = 'ok' | 'empty' | 'error' | 'forbidden' | 'too_large' | 'timeout';

export interface EndpointResult {
  outcome: EndpointOutcome;
  data: unknown;
  /** One per kind the endpoint declares (06 §19); the module owns them. Default `[]`. */
  assessments?: readonly unknown[];
  /** Mart trust, or `null` for a non-mart source. Default `null`. */
  trust?: unknown;
  message?: string;
}

export type ParamsJudgment = { ok: true } | { ok: false; message: string };

export interface EndpointHandlerArgs {
  actor: PlatformActor;
  /** Only the applied Context keys, by their wire names (`from`, `to`, `lineNames`, …). */
  context: Record<string, unknown>;
  params: Record<string, unknown>;
  correlationId: string;
}

export interface MenuEndpointDeclaration {
  spec: EndpointDeclarationSpec;
  /** Maps the declared permission to a platform permission or a capability check. */
  authorize(actor: PlatformActor, tx?: Tx): Promise<boolean>;
  /** Value check of `params` (keys are already judged). A refusal is an `error`, not an empty result. */
  validate(params: Record<string, unknown>): ParamsJudgment;
  handle(args: EndpointHandlerArgs): Promise<EndpointResult>;
}

export interface FieldError {
  path: readonly string[];
  code: string;
}

export interface ActionDeclarationSpec {
  id: string;
  menuId: string;
  /** Runtime allow-list of `input` keys; list every key, including optional ones. */
  inputKeys: readonly string[];
  permission: string;
  /** Refused at startup until the server has a Scope resolver (#1087). */
  requiresScope: boolean;
  /** `version`: the request carries `expectedVersion`; a mismatch answers `conflict`. */
  concurrency: 'none' | 'version';
  /** Endpoint ids of the same menu the Kernel reads again after the write. */
  invalidates: readonly string[];
}

export interface ActionHandlerResult {
  data: unknown;
  /** Version after the write; required for `concurrency: 'version'`. */
  version: string | null;
}

export interface MenuActionDeclaration {
  spec: ActionDeclarationSpec;
  /** Judged before replay, and again on the transaction after the idempotency lock. */
  authorize(actor: PlatformActor, tx: Tx): Promise<boolean>;
  /** Value check of `input` (keys are already judged); an empty list means valid. */
  validate(input: Record<string, unknown>): readonly FieldError[];
  /** Required for `concurrency: 'version'`. `null` = the target does not exist (`not_found`). Lock the target here. */
  currentVersion?(tx: Tx, actor: PlatformActor, input: Record<string, unknown>): Promise<string | null>;
  /** The write. Same transaction as the idempotency record; the handler writes its own audit rows. */
  handle(
    tx: Tx,
    actor: PlatformActor,
    input: Record<string, unknown>,
    ctx: { correlationId: string },
  ): Promise<ActionHandlerResult>;
}

/** What one module contributes to the dispatch registry. */
export interface MenuDispatchContribution {
  endpoints?: readonly MenuEndpointDeclaration[];
  actions?: readonly MenuActionDeclaration[];
}

export type ActionOutcome = 'ok' | 'invalid' | 'conflict' | 'forbidden' | 'not_found' | 'error';

/** The write envelope on the wire (`ActionResponse`, packages/sdk/contracts/src/adapter/action.ts). */
export interface ActionAnswer {
  outcome: ActionOutcome;
  data: unknown;
  version: string | null;
  fieldErrors: readonly FieldError[];
  replayed: boolean;
  correlationId: string;
  message?: string;
}
