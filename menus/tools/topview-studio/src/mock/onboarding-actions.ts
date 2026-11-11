/**
 * The 설비 온보딩 writes (#1658), answered like the server without `@eqv/core`. `publishMapping` flattens the saved rules with a
 * small stand-in of core's resolution (equipment > model > maker > global; exact before pattern; `{n}` and `{n:letter}` captures) and
 * hashes the Mapping Version with `fakeRevision`, so a mock hash never equals the one the screen computes; the mock still refuses a
 * publish whose own hash and Layout Revision equal the latest Binding's (`same-as-latest`). No audit row (the engine has no audit hook).
 */
import { defineMockAction, MockActionInvalid, type AnyMockAction } from '@ap/mock-server';
import type { FieldError } from '@ap/contracts';
import {
  DICTIONARY_GLOBAL_EDIT_PERMISSION, EQUIPMENT_ID_PATTERN, REVISION_PATTERN, TEMPLATE_ID_PATTERN, WALL_CLOCK_PATTERN, WINDOW_HEX_PATTERN,
  publishMapping, replaceSampleWindow, retireSampleWindow, saveAliasRules, saveTypeDictionary, type JsonDocument, type ScopeLevel,
} from '../endpoints';
import { fakeRevision } from './hash';
import { equipmentById, hexOf, onboarding, scopeKey, type Binding } from './onboarding-store';
import { mockId, revisions, stamp } from './store';

const err = (path: string[], code: string): FieldError => ({ path, code });
const LEVELS: readonly ScopeLevel[] = ['global', 'maker', 'model', 'equipment'];
const isObject = (value: unknown): value is JsonDocument => typeof value === 'object' && value !== null && !Array.isArray(value);

function scopedErrors(input: { level: ScopeLevel; vendorId?: string; modelId?: string; equipmentId?: string; document: unknown }, list: 'rules' | 'entries'): FieldError[] {
  if (!LEVELS.includes(input.level)) return [err(['level'], 'invalid')];
  if (scopeKey(input) === null) return [err(['level'], 'missing_scope_id')];
  if (!isObject(input.document) || !Array.isArray(input.document[list])) return [err(['document'], 'invalid')];
  const scope = input.document.scope as Record<string, unknown> | undefined;
  const expected = { level: input.level, ...(input.level === 'maker' || input.level === 'model' ? { maker: input.vendorId } : {}), ...(input.level === 'model' ? { model: input.modelId } : {}), ...(input.level === 'equipment' ? { equipmentId: input.equipmentId } : {}) };
  return scope && Object.entries(expected).every(([k, v]) => scope[k] === v) ? [] : [err(['document', 'scope'], 'scope_mismatch')];
}

function scopedWrite(store: 'rules' | 'dictionaries') {
  return {
    // The engine first checks the declared rules-edit permission; a `global` level then also needs the global one. Stricter than
    // the server (global only needs dictionary-global-edit), and the screen never saves at `global`.
    authorize: ({ input, can }: { input: { level: ScopeLevel }; can(permission: string): boolean }) => input.level !== 'global' || can(DICTIONARY_GLOBAL_EDIT_PERMISSION),
    version: ({ input }: { input: { level: ScopeLevel; vendorId?: string; modelId?: string; equipmentId?: string } }) => {
      const key = scopeKey(input);
      return String((key && onboarding()[store].get(key)?.version) ?? 0);
    },
    handle: ({ input }: { input: { level: ScopeLevel; vendorId?: string; modelId?: string; equipmentId?: string; document: JsonDocument } }) => {
      const key = scopeKey(input)!;
      const current = onboarding()[store].get(key);
      const next = (current?.version ?? 0) + 1;
      const id = current?.id ?? mockId();
      onboarding()[store].set(key, { id, document: structuredClone(input.document), version: next });
      return { data: { id, version: String(next) }, version: String(next) };
    },
  };
}

type Rule = { id: string; match: { exact?: string[]; pattern?: string }; target: Record<string, unknown>; certainty: string };
type RuleFile = { scope: JsonDocument; rules: Rule[] };

/** `PM{n}` → regex with one numeric capture; `pm-{n:letter}` substitutes 1 → a. */
function matchPattern(pattern: string, alias: string): string | null {
  const source = pattern.split('{n}').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([0-9]+)');
  return new RegExp(`^${source}$`).exec(alias)?.[1] ?? null;
}
function substitute(target: Record<string, unknown>, n: string): Record<string, unknown> {
  if (typeof target.componentId !== 'string') return target;
  const letter = Number(n) >= 1 && Number(n) <= 26 ? String.fromCharCode(96 + Number(n)) : n;
  return { ...target, componentId: target.componentId.replace('{n:letter}', letter).replace('{n}', String(Number(n))) };
}

/** The winning entry per alias: the narrowest scope with a match; within a file an exact rule beats a pattern. */
export function flattenRules(files: readonly RuleFile[], aliases: readonly string[]): { alias: string; target: Record<string, unknown>; certainty: string; rule: { scope: JsonDocument; ruleId: string } }[] {
  return aliases.flatMap((alias) => {
    for (const file of files) {
      const exact = file.rules.find((rule) => rule.match.exact?.includes(alias));
      if (exact) return [{ alias, target: exact.target, certainty: exact.certainty, rule: { scope: file.scope, ruleId: exact.id } }];
      for (const rule of file.rules) {
        const n = rule.match.pattern ? matchPattern(rule.match.pattern, alias) : null;
        if (n !== null) return [{ alias, target: substitute(rule.target, n), certainty: rule.certainty, rule: { scope: file.scope, ruleId: rule.id } }];
      }
    }
    return [];
  });
}

const latestOf = (bindings: readonly Binding[]): Binding | undefined => [...bindings].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];

export const onboardingActionsMock: readonly AnyMockAction[] = [
  defineMockAction(saveAliasRules, { validate: (input) => scopedErrors(input, 'rules'), ...scopedWrite('rules') }),
  defineMockAction(saveTypeDictionary, { validate: (input) => scopedErrors({ ...input }, 'entries'), ...scopedWrite('dictionaries') }),
  defineMockAction(publishMapping, {
    validate: (input) => {
      const errors: FieldError[] = [];
      if (typeof input.equipmentId !== 'string' || !EQUIPMENT_ID_PATTERN.test(input.equipmentId) || !equipmentById(input.equipmentId)) errors.push(err(['equipmentId'], 'not_found'));
      if (typeof input.layoutId !== 'string' || !TEMPLATE_ID_PATTERN.test(input.layoutId)) errors.push(err(['layoutId'], 'invalid'));
      if (typeof input.layoutRevision !== 'string' || !REVISION_PATTERN.test(input.layoutRevision)) errors.push(err(['layoutRevision'], 'invalid'));
      if (typeof input.effectiveFrom !== 'string' || !WALL_CLOCK_PATTERN.test(input.effectiveFrom)) errors.push(err(['effectiveFrom'], 'invalid'));
      if (!isObject(input.baseline) || input.baseline.equipmentId !== input.equipmentId || !Array.isArray(input.baseline.aliases)) errors.push(err(['baseline'], 'invalid'));
      return errors;
    },
    version: ({ input }) => String(onboarding().bindings.get(input.equipmentId)?.length ?? 0),
    handle: ({ input }) => {
      const { equipmentId, layoutId, layoutRevision, effectiveFrom } = input;
      if (!revisions().some((r) => r.layoutId === layoutId && r.revision === layoutRevision)) throw new MockActionInvalid([err(['layoutRevision'], 'not_found')]);
      const bindings = onboarding().bindings.get(equipmentId) ?? [];
      const latest = latestOf(bindings);
      if (latest && effectiveFrom <= latest.effectiveFrom) throw new MockActionInvalid([err(['effectiveFrom'], 'not_after_latest')]);
      const equipment = equipmentById(equipmentId)!;
      const files = [`equipment/${equipmentId}`, `model/${equipment.vendorId}/${equipment.modelId}`, `maker/${equipment.vendorId}`, 'global']
        .flatMap((key) => { const found = onboarding().rules.get(key); return found ? [found.document as unknown as RuleFile] : []; });
      const aliases = (input.baseline.aliases as { alias: string }[]).map(({ alias }) => alias);
      const body = { schemaVersion: '0.4', equipmentId, layoutId, entries: flattenRules(files, aliases) };
      const mappingHash = fakeRevision(body);
      if (latest && latest.mappingHash === mappingHash && latest.layoutRevision === layoutRevision) throw new MockActionInvalid([err(['mapping'], 'same-as-latest')]);
      const next: Binding[] = [...bindings.map((b) => (b === latest && b.effectiveTo === undefined ? { ...b, effectiveTo: effectiveFrom } : b)), { layoutId, mappingHash, layoutRevision, effectiveFrom }];
      onboarding().bindings.set(equipmentId, next);
      const byHash = onboarding().mappings.get(equipmentId) ?? new Map();
      if (!byHash.has(mappingHash)) byHash.set(mappingHash, { document: { ...body, hash: mappingHash }, layoutRevision, publishedAt: stamp() });
      onboarding().mappings.set(equipmentId, byHash);
      const baselineKey = `${equipmentId}/${mappingHash}`;
      if (!onboarding().baselines.has(baselineKey)) onboarding().baselines.set(baselineKey, structuredClone(input.baseline));
      // The window the Baseline came from now backs one more Mapping Version.
      const window = onboarding().windows.get(equipmentId)?.find((w) => w.state === 'active' && w.from === input.baseline.from && w.to === input.baseline.to);
      if (window) window.mappingCount += 1;
      equipment.status = 'published';
      return { data: { mappingHash, bindingId: mockId(), version: String(next.length) }, version: String(next.length) };
    },
  }),
  defineMockAction(replaceSampleWindow, {
    validate: (input) => (typeof input.windowHash === 'string' && WINDOW_HEX_PATTERN.test(input.windowHash) ? [] : [err(['windowHash'], 'invalid')]),
    handle: ({ input }) => {
      const rows = onboarding().windows.get(input.equipmentId) ?? [];
      const staged = rows.find((w) => hexOf(w.hash) === input.windowHash);
      if (!staged || staged.state !== 'staged') throw new MockActionInvalid([err(['windowHash'], 'not_staged')]);
      const replaced = rows.find((w) => w.hash === staged.counterpart);
      staged.state = 'active';
      if (replaced) { replaced.state = 'replaced'; replaced.counterpart = staged.hash; }
      return { data: { equipmentId: input.equipmentId, activeHash: staged.hash, replacedHash: replaced?.hash ?? '' }, version: null };
    },
  }),
  defineMockAction(retireSampleWindow, {
    validate: (input) => (typeof input.windowHash === 'string' && WINDOW_HEX_PATTERN.test(input.windowHash) ? [] : [err(['windowHash'], 'invalid')]),
    handle: ({ input }) => {
      const found = onboarding().windows.get(input.equipmentId)?.find((w) => hexOf(w.hash) === input.windowHash);
      if (!found || found.state !== 'active') throw new MockActionInvalid([err(['windowHash'], 'not_active')]);
      found.state = 'retired';
      return { data: { equipmentId: input.equipmentId, retiredHash: found.hash }, version: null };
    },
  }),
];
