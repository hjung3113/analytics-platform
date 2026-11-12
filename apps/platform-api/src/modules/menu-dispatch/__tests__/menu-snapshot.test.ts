import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { menuDeclarationSnapshotSchema, toJsonSchema } from '@ap/contract-schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import type { CheckService } from '../../permissions/check-service.js';
import { defined } from '../../../test-support/defined.js';
import { menuSnapshot, menuSnapshotFor } from '../../../test-support/menu-snapshot.js';
import { DeclarationBundleError, type DeclaredAction, type DeclaredEndpoint } from '../declarations-file.js';
import { declaredContribution } from '../declared-endpoints.js';
import { loadMenuSnapshot, menuOwnedEndpoint, menuSnapshotDigest, menuSnapshotProblems, menuSnapshotSchema, parseMenuSnapshot } from '../menu-snapshot.js';
import { routedBundle } from './bundle-fixtures.js';

// #1900 (ADR-0156): the server's local copy of the menu declaration snapshot schema and the comparison rules beyond the
// four boot cases in src/__tests__/menu-declarations-menu-snapshot.test.ts. Synthetic identifiers only.

const endpoint = (over: Partial<DeclaredEndpoint> = {}): DeclaredEndpoint => ({
  id: 'syn.rows', menuId: 'syn', paramKeys: ['q', 'page'], permission: 'syn:view', requiresScope: true,
  context: { time: 'apply' }, kinds: ['coverage'], mergeTimeDomain: false, ...over,
});
const action = (over: Partial<DeclaredAction> = {}): DeclaredAction => ({
  id: 'syn.save', menuId: 'syn', inputKeys: ['name'], permission: 'syn:edit', requiresScope: true, concurrency: 'none', invalidates: ['syn.rows'], ...over,
});
const declarations = () => menuSnapshot({
  menus: [
    { id: 'syn', permission: 'syn:view', requiresScope: true, context: { time: 'apply', metric: 'reference' } },
    { id: 'other', permission: 'other:view', requiresScope: false, context: {} },
  ],
  permissions: ['other:view', 'syn:edit', 'syn:view'],
  endpoints: [
    { id: 'syn.rows', menuId: 'syn', paramKeys: ['page', 'q'], permission: 'syn:view', requiresScope: true, context: { time: 'apply' }, kinds: ['coverage'], limits: { maxRows: 5 }, mergeTimeDomain: false },
    { id: 'other.rows', menuId: 'other', paramKeys: [], permission: 'other:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false },
  ],
  actions: [{ id: 'syn.save', menuId: 'syn', inputKeys: ['name'], permission: 'syn:edit', requiresScope: true, concurrency: 'none', invalidates: ['syn.rows'] }],
});
const problemsOf = (endpoints: DeclaredEndpoint[], actions: DeclaredAction[] = [], snapshot = declarations()) => menuSnapshotProblems({ endpoints, actions }, snapshot);

describe('menu declaration snapshot comparison', () => {
  it('accepts matching rows; list order and deployment-owned fields (limits, paramTypes) are not compared', () => {
    expect(problemsOf([endpoint({ limits: { maxRows: 99 }, paramTypes: { q: { type: 'string', maxLength: 3 } } })], [action()])).toEqual([]);
  });

  it.each([
    ['paramKeys', { paramKeys: ['q'] }, '["q"]', '["page","q"]'],
    ['context', { context: { time: 'reference' as const } }, '{"time":"reference"}', '{"time":"apply"}'],
    ['requiredContext', { requiredContext: ['time' as const] }, '["time"]', '[]'],
    ['kinds', { kinds: [] }, '[]', '["coverage"]'],
    ['mergeTimeDomain', { mergeTimeDomain: true }, 'true', 'false'],
  ])('names the endpoint, the field and both values when %s differs', (field, over, bundleValue, declaredValue) => {
    expect(problemsOf([endpoint(over)])).toContain(`endpoint syn.rows: ${field} is ${bundleValue} in the bundle, ${declaredValue} in the menu declarations`);
  });

  it('refuses a bundle row the menu declarations do not have (bundle ⊆ snapshot; snapshot-only rows are fine)', () => {
    expect(problemsOf([endpoint({ id: 'syn.extra' })])).toEqual(['endpoint syn.extra: not in the menu declarations']);
    expect(problemsOf([], [action({ id: 'syn.extra' })])).toEqual(['action syn.extra: not in the menu declarations']);
  });

  it('applies the mock registration rules against the snapshot menus', () => {
    const snapshot = declarations();
    const loose = menuSnapshot({ ...snapshot, endpoints: [...snapshot.endpoints, { ...defined(snapshot.endpoints[1]), id: 'other.loose', context: { lot: 'apply' }, permission: 'nobody:view' }], actions: [...snapshot.actions, { ...defined(snapshot.actions[0]), id: 'syn.foreign', invalidates: ['other.rows'] }] });
    const found = menuSnapshotProblems({
      endpoints: [endpoint({ id: 'other.loose', menuId: 'other', paramKeys: [], context: { lot: 'apply' }, permission: 'nobody:view', requiresScope: false, kinds: [] })],
      actions: [action({ id: 'syn.foreign', invalidates: ['other.rows'] })],
    }, loose);
    expect(found).toEqual([
      'endpoint other.loose: permission nobody:view is declared neither by the menu declarations nor by the kernel',
      'endpoint other.loose: context lot is applied but menu other does not apply it',
      'action syn.foreign: invalidates other.rows, which is not an endpoint of menu syn',
    ]);
  });

  it('judges an action field by field and by its menu (permission, Scope)', () => {
    expect(problemsOf([], [action({ permission: 'platform:view', requiresScope: false })])).toEqual([
      'action syn.save: permission is platform:view in the bundle, syn:edit in the menu declarations',
      'action syn.save: requiresScope is false in the bundle, true in the menu declarations',
      'action syn.save: requiresScope is false but menu syn requires Scope',
    ]);
  });

  it('answers the menu-owned fields of one endpoint from one place', () => {
    expect(menuOwnedEndpoint(declarations(), 'syn.rows')?.permission).toBe('syn:view');
    expect(menuOwnedEndpoint(declarations(), 'nope')).toBeUndefined();
  });
});

describe('menu declaration snapshot file', () => {
  let dir: string;
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'menu-snapshot-')); });
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
  const refusal = async (content: string) => {
    const file = join(dir, `s-${Math.random().toString(36).slice(2)}.json`);
    await writeFile(file, content);
    const error = await loadMenuSnapshot(file).then(() => null, (thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(DeclarationBundleError);
    return (error as DeclarationBundleError).problems.join('\n');
  };

  it('reads a valid file', async () => {
    const file = join(dir, 'ok.json');
    await writeFile(file, JSON.stringify(declarations()));
    await expect(loadMenuSnapshot(file)).resolves.toEqual(declarations());
  });

  it('fails closed on a missing file, bad JSON, an unknown schemaVersion, a schema error and a hand edit', async () => {
    await expect(loadMenuSnapshot(join(dir, 'absent.json'))).rejects.toThrow(/cannot be read \(ENOENT\)/);
    expect(await refusal('{ not json')).toMatch(/is not valid JSON/);
    expect(await refusal(JSON.stringify({ ...declarations(), schemaVersion: 2 }))).toMatch(/schemaVersion is not 1/);
    expect(await refusal(JSON.stringify({ ...declarations(), extra: 'secret-value' }))).not.toContain('secret-value');
    const edited = declarations();
    defined(edited.endpoints[0]).permission = 'platform:view';
    expect(await refusal(JSON.stringify(edited))).toMatch(/digest does not match its content/);
  });

  it('digest equals the @ap/contracts emitter for the same body (fixed vector shared with its test)', () => {
    const body = { schemaVersion: 1 as const, sdkVersion: '1', menus: [], permissions: [], endpoints: [], actions: [] };
    expect(menuSnapshotDigest(body)).toBe('sha256:fa52fa14c7a2cce0fd5053db69be7a77e7ee26880578091d40da9dbd14556a98');
  });
});

describe('local schema copy is pinned to @ap/contract-schemas menuDeclarationSnapshotSchema', () => {
  // Both schemas are reduced to one normal form that keeps types, enum/literal values, numeric bounds, string
  // minima/patterns, required sets and object strictness. Intentional differences (the only normalisations):
  //  1. `uniqueItems` is dropped from the source: the local copy states uniqueness as `.refine` (menus, endpoints,
  //     actions by id; permissions by value), which the probes below pin by behaviour.
  //  2. `$schema` is dropped, and `const: x` / `{type: number, const: 1}` is read as the literal `x`.
  //  3. Integer bounds: `exclusiveMinimum: 0` is the same as zod 3 `.positive()` (a non-inclusive minimum of 0).
  type Json = { type?: string; const?: unknown; enum?: unknown[]; properties?: Record<string, Json>; required?: string[]; items?: Json; additionalProperties?: boolean; minLength?: number; maxLength?: number; pattern?: string; minimum?: number; maximum?: number; exclusiveMinimum?: number; exclusiveMaximum?: number };
  type Normal = Record<string, unknown>;
  const sourceNormal = (schema: Json): Normal => {
    if (schema.const !== undefined) return { literal: schema.const };
    if (schema.enum) return { type: schema.type, enum: [...schema.enum] };
    if (schema.properties) {
      return {
        type: 'object',
        strict: schema.additionalProperties === false,
        required: [...(schema.required ?? [])].sort(),
        properties: Object.fromEntries(Object.entries(schema.properties).sort().map(([key, inner]) => [key, sourceNormal(inner)])),
      };
    }
    if (schema.items) return { type: 'array', items: sourceNormal(schema.items) };
    const { minLength, maxLength, pattern, minimum, maximum, exclusiveMinimum, exclusiveMaximum } = schema;
    return Object.fromEntries(Object.entries({ type: schema.type, minLength, maxLength, pattern, minimum, maximum, exclusiveMinimum, exclusiveMaximum }).filter(([, value]) => value !== undefined));
  };
  type Def = { typeName: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny; type?: z.ZodTypeAny; shape?: () => Record<string, z.ZodTypeAny>; unknownKeys?: string; values?: unknown[]; value?: unknown; checks?: { kind: string; value?: number; inclusive?: boolean; regex?: RegExp }[] };
  const localNormal = (schema: z.ZodTypeAny): Normal => {
    const def = schema._def as Def;
    switch (def.typeName) {
      case 'ZodEffects': return localNormal(defined(def.schema));
      case 'ZodOptional': return localNormal(defined(def.innerType));
      case 'ZodArray': return { type: 'array', items: localNormal(defined(def.type)) };
      case 'ZodBoolean': return { type: 'boolean' };
      case 'ZodLiteral': return { literal: def.value };
      case 'ZodEnum': return { type: 'string', enum: [...defined(def.values)] };
      case 'ZodString': {
        const out: Normal = { type: 'string' };
        for (const check of def.checks ?? []) {
          if (check.kind === 'min') out.minLength = check.value;
          else if (check.kind === 'max') out.maxLength = check.value;
          else if (check.kind === 'regex') out.pattern = defined(check.regex).source;
          else throw new Error(`pin: unmapped string check ${check.kind}`);
        }
        return out;
      }
      case 'ZodNumber': {
        const out: Normal = { type: 'number' };
        for (const check of def.checks ?? []) {
          if (check.kind === 'int') out.type = 'integer';
          else if (check.kind === 'min') out[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
          else if (check.kind === 'max') out[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
          else throw new Error(`pin: unmapped number check ${check.kind}`);
        }
        return out;
      }
      case 'ZodObject': {
        const fields = defined(def.shape)();
        return {
          type: 'object',
          strict: def.unknownKeys === 'strict',
          required: Object.entries(fields).filter(([, inner]) => !inner.isOptional()).map(([key]) => key).sort(),
          properties: Object.fromEntries(Object.entries(fields).sort().map(([key, inner]) => [key, localNormal(inner)])),
        };
      }
      default: throw new Error(`pin: unmapped zod type ${def.typeName}`);
    }
  };
  const withoutUnique = (schema: Json): Json => JSON.parse(JSON.stringify(schema, (key, value: unknown) => (key === 'uniqueItems' || key === '$schema' ? undefined : value))) as Json;
  const sourceJson = () => withoutUnique(toJsonSchema(menuDeclarationSnapshotSchema) as Json);

  it('has the same types, vocabularies, bounds, patterns, required sets and strictness', () => {
    expect(localNormal(menuSnapshotSchema)).toEqual(sourceNormal(sourceJson()));
  });

  it('the pin sees a constraint-only change (a mutated copy of the source schema differs)', () => {
    const mutated = sourceJson() as { properties: { endpoints: { items: { properties: { limits: { properties: { maxRows: Json } } } } } } };
    mutated.properties.endpoints.items.properties.limits.properties.maxRows.maximum = 9007199254740992;
    expect(localNormal(menuSnapshotSchema)).not.toEqual(sourceNormal(mutated as unknown as Json));
  });

  const withDigest = (value: Record<string, unknown>) => ({ ...value, digest: menuSnapshotDigest(value as never) });

  it('refuses a snapshot whose maxRows is not a safe integer, even with a recomputed digest', () => {
    const value = withDigest({ ...(declarations() as unknown as Record<string, unknown>), endpoints: [{ ...declarations().endpoints[0], limits: { maxRows: 9007199254740992 } }] });
    expect(() => parseMenuSnapshot(value)).toThrow(DeclarationBundleError);
  });

  it.each([
    ['valid', (s: Record<string, unknown>) => s],
    ['unknown version', (s: Record<string, unknown>) => ({ ...s, schemaVersion: 2 })],
    ['stray field', (s: Record<string, unknown>) => ({ ...s, extra: 1 })],
    ['bad digest', (s: Record<string, unknown>) => ({ ...s, digest: 'sha256:xyz' })],
    ['duplicate menu', (s: Record<string, unknown>) => ({ ...s, menus: [...(s.menus as unknown[]), (s.menus as unknown[])[0]] })],
    ['unknown kind', (s: Record<string, unknown>) => ({ ...s, endpoints: [{ ...(s.endpoints as Record<string, unknown>[])[0], kinds: ['nope'] }] })],
    ['unsafe integer maxRows', (s: Record<string, unknown>) => withDigest({ ...s, endpoints: [{ ...(s.endpoints as Record<string, unknown>[])[0], limits: { maxRows: 9007199254740992 } }] })],
    ['safe integer maxRows', (s: Record<string, unknown>) => withDigest({ ...s, endpoints: [{ ...(s.endpoints as Record<string, unknown>[])[0], limits: { maxRows: Number.MAX_SAFE_INTEGER } }] })],
    ['fractional maxRows', (s: Record<string, unknown>) => ({ ...s, endpoints: [{ ...(s.endpoints as Record<string, unknown>[])[0], limits: { maxRows: 1.5 } }] })],
    ['empty sdkVersion', (s: Record<string, unknown>) => ({ ...s, sdkVersion: '' })],
    ['duplicate permission', (s: Record<string, unknown>) => ({ ...s, permissions: [...(s.permissions as string[]), (s.permissions as string[])[0]] })],
    ['bad concurrency', (s: Record<string, unknown>) => ({ ...s, actions: [{ ...(s.actions as Record<string, unknown>[])[0], concurrency: 'maybe' }] })],
  ])('accepts or refuses alike: %s', (_name, mutate) => {
    const value = mutate(declarations() as unknown as Record<string, unknown>);
    expect(menuSnapshotSchema.safeParse(value).success).toBe(menuDeclarationSnapshotSchema.safeParse(value).success);
  });
});

describe('programmatic assembly takes the snapshot too', () => {
  const checkService = {} as CheckService;
  it('declaredContribution refuses a bundle that differs from its snapshot and an invalid snapshot', () => {
    const bundle = routedBundle();
    const snapshot = menuSnapshotFor(bundle);
    expect(() => declaredContribution({ bundle: bundle as never, snapshot, checkService })).not.toThrow();
    const weak = routedBundle();
    defined(weak.endpoints[0]).permission = 'platform:view';
    expect(() => declaredContribution({ bundle: weak as never, snapshot, checkService })).toThrow(/syn\.rows: permission is platform:view in the bundle, syn:view/);
    expect(() => declaredContribution({ bundle: bundle as never, snapshot: { ...snapshot, digest: `sha256:${'0'.repeat(64)}` }, checkService })).toThrow(/digest does not match/);
  });
});
