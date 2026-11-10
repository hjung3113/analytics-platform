// Pure judgments of the Onboarding writes and reads (#1658, ADR-0139). `@eqv/core`'s validators are the final verdict; their zod 4 issue
// objects are mapped to plain `{ path, code }` here and never leave this file (zod messages can quote user input). A Mapping Scope on the
// wire is `{ level, vendorId?, modelId?, equipmentId? }` with Hub ids; `toCoreScope` turns it into the core shape (`maker` = vendor id,
// `model` = model id, both as strings), so no free maker/model string exists anywhere on the server.
import {
  diagnoseWallClock,
  observedInventorySchema,
  validateAliasRules,
  validateTypeDictionary,
  wallClockToMillis,
  type AliasRulesFile,
  type MappingIssue,
  type MappingScope,
  type ObservedInventory,
  type TypeDictionaryFile,
} from '@eqv/core';

import type { FieldError } from '../../menu-dispatch/types.js';

const ISSUES_MAX = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EQUIPMENT_ID_MAX = 200;

export type ScopeLevel = 'global' | 'maker' | 'model' | 'equipment';
export type MappingScopeRef =
  | { level: 'global' }
  | { level: 'maker'; vendorId: string }
  | { level: 'model'; vendorId: string; modelId: string }
  | { level: 'equipment'; equipmentId: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_PATTERN.test(v);
// eslint-disable-next-line no-control-regex -- equipment ids are printable text; control characters are refused
export const isEquipmentId = (v: unknown): v is string => typeof v === 'string' && v.length >= 1 && v.length <= EQUIPMENT_ID_MAX && !/[\u0000-\u001f\u007f]/.test(v);

export type ParsedScope = { ok: true; scope: MappingScopeRef } | { ok: false; errors: FieldError[] };

/**
 * Reads `{ level, vendorId?, modelId?, equipmentId? }` strictly: exactly the ids the level needs are present (a surplus id is refused, not
 * ignored, so a client cannot address one scope and be answered for another).
 */
export function parseScope(input: Record<string, unknown>, allowEquipment: boolean): ParsedScope {
  const level = input.level;
  const needs: Record<ScopeLevel, readonly ('vendorId' | 'modelId' | 'equipmentId')[]> = {
    global: [],
    maker: ['vendorId'],
    model: ['vendorId', 'modelId'],
    equipment: ['equipmentId'],
  };
  if (typeof level !== 'string' || !(['global', 'maker', 'model', 'equipment'] as const).some((l) => l === level) || (level === 'equipment' && !allowEquipment)) {
    return { ok: false, errors: [{ path: ['level'], code: 'invalid' }] };
  }
  const wanted = needs[level as ScopeLevel];
  const errors: FieldError[] = [];
  for (const key of ['vendorId', 'modelId', 'equipmentId'] as const) {
    const value = input[key];
    if (!wanted.includes(key)) {
      if (value !== undefined && value !== null) errors.push({ path: [key], code: 'unexpected' });
    } else if (!(key === 'equipmentId' ? isEquipmentId(value) : isUuid(value))) {
      errors.push({ path: [key], code: 'invalid' });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  switch (level as ScopeLevel) {
    case 'global':
      return { ok: true, scope: { level: 'global' } };
    case 'maker':
      return { ok: true, scope: { level: 'maker', vendorId: String(input.vendorId).toLowerCase() } };
    case 'model':
      return { ok: true, scope: { level: 'model', vendorId: String(input.vendorId).toLowerCase(), modelId: String(input.modelId).toLowerCase() } };
    case 'equipment':
      return { ok: true, scope: { level: 'equipment', equipmentId: String(input.equipmentId) } };
  }
}

/** The scope as `@eqv/core` spells it: Hub ids as the `maker` and `model` strings. */
export function toCoreScope(scope: MappingScopeRef): MappingScope {
  switch (scope.level) {
    case 'global':
      return { level: 'global' };
    case 'maker':
      return { level: 'maker', maker: scope.vendorId };
    case 'model':
      return { level: 'model', maker: scope.vendorId, model: scope.modelId };
    case 'equipment':
      return { level: 'equipment', equipmentId: scope.equipmentId };
  }
}

/** A stable key of one scope (advisory lock id). */
export const scopeKey = (scope: MappingScopeRef): string =>
  `${scope.level}:${'vendorId' in scope ? scope.vendorId : ''}:${'modelId' in scope ? scope.modelId : ''}:${'equipmentId' in scope ? scope.equipmentId : ''}`;

export function sameScope(a: MappingScope, b: MappingScope): boolean {
  if (a.level !== b.level) return false;
  if (a.level === 'maker' && b.level === 'maker') return a.maker === b.maker;
  if (a.level === 'model' && b.level === 'model') return a.maker === b.maker && a.model === b.model;
  if (a.level === 'equipment' && b.level === 'equipment') return a.equipmentId === b.equipmentId;
  return true;
}

/** Issues as plain field errors: code and path only, the core message (it can quote user text) is dropped. */
export const issueErrors = (issues: readonly MappingIssue[], prefix: readonly string[]): FieldError[] =>
  issues.slice(0, ISSUES_MAX).map((issue) => ({ path: [...prefix, ...issue.path.map(String)], code: issue.code }));

export type CheckedAliasRules = { ok: true; file: AliasRulesFile } | { ok: false; errors: FieldError[] };
export type CheckedTypeDictionary = { ok: true; file: TypeDictionaryFile } | { ok: false; errors: FieldError[] };

/** `validateAliasRules` is the verdict; the document's own `scope` must equal the addressed scope. Only the validated file is stored. */
export function checkAliasRules(scope: MappingScopeRef, document: unknown, prefix: readonly string[] = ['document']): CheckedAliasRules {
  const result = validateAliasRules(document);
  if (!result.ok) return { ok: false, errors: issueErrors(result.issues, prefix) };
  if (!sameScope(result.file.scope, toCoreScope(scope))) return { ok: false, errors: [{ path: [...prefix, 'scope'], code: 'scope_mismatch' }] };
  return { ok: true, file: result.file };
}

export function checkTypeDictionary(scope: MappingScopeRef, document: unknown, prefix: readonly string[] = ['document']): CheckedTypeDictionary {
  const result = validateTypeDictionary(document);
  if (!result.ok) return { ok: false, errors: issueErrors(result.issues, prefix) };
  if (!sameScope(result.file.scope, toCoreScope(scope))) return { ok: false, errors: [{ path: [...prefix, 'scope'], code: 'scope_mismatch' }] };
  return { ok: true, file: result.file };
}

export type CheckedBaseline = { ok: true; inventory: ObservedInventory } | { ok: false; errors: FieldError[] };

/** The client-supplied Baseline (interim, ADR-0139): `observedInventorySchema` is the verdict and it must belong to the addressed equipment. */
export function checkBaseline(equipmentId: string, baseline: unknown, prefix: readonly string[] = ['baseline']): CheckedBaseline {
  const parsed = observedInventorySchema.safeParse(baseline);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, ISSUES_MAX).map((issue) => ({ path: [...prefix, ...issue.path.map(String)], code: issue.code })),
    };
  }
  if (parsed.data.equipmentId !== equipmentId) return { ok: false, errors: [{ path: [...prefix, 'equipmentId'], code: 'equipment_mismatch' }] };
  return { ok: true, inventory: parsed.data };
}

/**
 * A strict Site Wall-clock (`YYYY-MM-DDTHH:mm:ss.fff`, a real calendar instant). Nothing is fixed, padded or truncated (EV ADR-0009): the
 * code names why a value is refused (`fraction-too-long`, `fraction-missing`, `offset`, `malformed`, or `impossible` for a shape-valid
 * value that is not a real instant).
 */
export function wallClockProblem(value: unknown): string | null {
  if (typeof value !== 'string') return 'malformed';
  const diagnosis = diagnoseWallClock(value);
  if (!diagnosis.ok) return diagnosis.reason;
  try {
    wallClockToMillis(value);
    return null;
  } catch {
    return 'impossible';
  }
}

export { isObject };
