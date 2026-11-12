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
import { loadMenuSnapshot, menuOwnedEndpoint, menuSnapshotDigest, menuSnapshotProblems, menuSnapshotSchema } from '../menu-snapshot.js';
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
  type Json = { properties?: Record<string, Json>; required?: string[]; items?: Json };
  const shape = (schema: Json | undefined): unknown => {
    if (!schema) return null;
    if (schema.items) return { items: shape(schema.items) };
    if (!schema.properties) return 'leaf';
    return { required: [...(schema.required ?? [])].sort(), properties: Object.fromEntries(Object.entries(schema.properties).sort().map(([key, inner]) => [key, shape(inner)])) };
  };
  const localShape = (schema: z.ZodTypeAny): unknown => {
    const def = schema._def as { typeName: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny; type?: z.ZodTypeAny; shape?: () => Record<string, z.ZodTypeAny> };
    if (def.typeName === 'ZodEffects') return localShape(defined(def.schema));
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') return localShape(defined(def.innerType));
    if (def.typeName === 'ZodArray') return { items: localShape(defined(def.type)) };
    if (def.typeName !== 'ZodObject') return 'leaf';
    const fields = defined(def.shape)();
    return {
      required: Object.entries(fields).filter(([, inner]) => !inner.isOptional()).map(([key]) => key).sort(),
      properties: Object.fromEntries(Object.entries(fields).sort().map(([key, inner]) => [key, localShape(inner)])),
    };
  };

  it('has the same fields, nesting and required set', () => {
    expect(localShape(menuSnapshotSchema)).toEqual(shape(toJsonSchema(menuDeclarationSnapshotSchema) as Json));
  });

  it.each([
    ['valid', (s: Record<string, unknown>) => s],
    ['unknown version', (s: Record<string, unknown>) => ({ ...s, schemaVersion: 2 })],
    ['stray field', (s: Record<string, unknown>) => ({ ...s, extra: 1 })],
    ['bad digest', (s: Record<string, unknown>) => ({ ...s, digest: 'sha256:xyz' })],
    ['duplicate menu', (s: Record<string, unknown>) => ({ ...s, menus: [...(s.menus as unknown[]), (s.menus as unknown[])[0]] })],
    ['unknown kind', (s: Record<string, unknown>) => ({ ...s, endpoints: [{ ...(s.endpoints as Record<string, unknown>[])[0], kinds: ['nope'] }] })],
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
