import { canonicalJson, collectDeclarations, defineAction, defineEndpoint, menuDeclarationSnapshot, MENU_DECLARATION_SNAPSHOT_VERSION, MenuDeclarationSnapshotError, menuPermission } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { menuDeclarationSnapshotSchema, MENU_DECLARATION_SNAPSHOT_SCHEMA_VERSION, SCHEMA_FILES, toJsonSchema } from './index.ts';

// The emitter lives in @ap/contracts (the one SDK package both the repo app and the out-of-repo start kit install); these
// tests pin its output to this schema (#1900).
const rows = defineEndpoint<{ q: string }, unknown>({
  id: 'syn.rows', menuId: 'syn', paramKeys: { q: true }, permission: menuPermission('syn:view'), requiresScope: true,
  context: { time: 'apply' }, kinds: ['coverage'], limits: { maxRows: 10 }, mergeTimeDomain: false,
});
const sum = defineEndpoint<Record<never, true>, unknown>({
  id: 'syn.sum', menuId: 'syn', paramKeys: {}, permission: menuPermission('syn:view'), requiresScope: true, context: {}, kinds: [], mergeTimeDomain: false,
});
const save = defineAction<{ name: string }, unknown>({
  id: 'syn.save', menuId: 'syn', inputKeys: { name: true }, permission: menuPermission('syn:edit'), requiresScope: true, concurrency: 'none', invalidates: [rows],
});
const menus = [
  { id: 'syn', permission: 'syn:view', requiresScope: true, context: { time: 'apply', roomNames: 'unsupported', metric: 'reference' } as const },
  { id: 'alpha', permission: 'platform:view', requiresScope: false, context: {} },
];
const input = { sdkVersion: '0.0.0-test', menus, permissions: ['syn:view', 'syn:edit', 'syn:view'], endpoints: [sum, rows], actions: [save] };

describe('menu declaration snapshot', () => {
  it('emits a file the schema accepts: version 1, applied Context only, key lists, invalidates as ids', () => {
    const snapshot = menuDeclarationSnapshot(input);
    expect(menuDeclarationSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(MENU_DECLARATION_SNAPSHOT_VERSION).toBe(MENU_DECLARATION_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.menus.find((menu) => menu.id === 'syn')?.context).toEqual({ metric: 'reference', time: 'apply' });
    expect(snapshot.endpoints.find((row) => row.id === 'syn.rows')).toEqual({
      id: 'syn.rows', menuId: 'syn', paramKeys: ['q'], permission: 'syn:view', requiresScope: true, context: { time: 'apply' }, kinds: ['coverage'], limits: { maxRows: 10 }, mergeTimeDomain: false,
    });
    expect(snapshot.actions).toEqual([{ id: 'syn.save', menuId: 'syn', inputKeys: ['name'], permission: 'syn:edit', requiresScope: true, concurrency: 'none', invalidates: ['syn.rows'] }]);
  });

  it('orders rows by id and the vocabulary sorted and distinct, whatever the input order', () => {
    const snapshot = menuDeclarationSnapshot(input);
    expect(snapshot.menus.map((menu) => menu.id)).toEqual(['alpha', 'syn']);
    expect(snapshot.endpoints.map((row) => row.id)).toEqual(['syn.rows', 'syn.sum']);
    expect(snapshot.permissions).toEqual(['syn:edit', 'syn:view']);
    const reversed = menuDeclarationSnapshot({ ...input, menus: [...menus].reverse(), endpoints: [rows, sum], permissions: ['syn:edit', 'syn:view'] });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(snapshot));
  });

  it('digest is sha256 over the canonical JSON of the rest, stable, and moves with any menu-owned field', () => {
    const snapshot = menuDeclarationSnapshot(input);
    expect(snapshot.digest).toBe(menuDeclarationSnapshot(input).digest);
    expect(canonicalJson({ b: [2, { d: 1, c: 'é' }], a: null })).toBe('{"a":null,"b":[2,{"c":"é","d":1}]}');
    // Fixed vector, computed once with node:crypto over the canonical JSON; the core server pins the same value.
    const minimal = menuDeclarationSnapshot({ sdkVersion: '1', menus: [], endpoints: [] });
    expect(minimal.digest).toBe(DIGEST_OF_MINIMAL);
    const weaker = menuDeclarationSnapshot({ ...input, endpoints: [sum, { ...rows, permission: menuPermission('platform:view') }] });
    expect(weaker.digest).not.toBe(snapshot.digest);
  });

  it.each([
    ['menu', { ...input, menus: [...menus, menus[0]!] }, 'menu syn'],
    ['endpoint', { ...input, endpoints: [rows, { ...rows }] }, 'endpoint syn.rows'],
    ['action', { ...input, actions: [save, { ...save }] }, 'action syn.save'],
  ])('refuses a duplicate %s id', (_kind, duplicated, named) => {
    expect(() => menuDeclarationSnapshot(duplicated)).toThrow(MenuDeclarationSnapshotError);
    expect(() => menuDeclarationSnapshot(duplicated)).toThrow(named);
  });

  it('collects endpoints and actions from module exports, grouped objects included, one row per declaration', () => {
    const found = collectDeclarations([{ rows, grouped: { rows, sum }, save, other: 3, list: [rows] }]);
    expect(found.endpoints).toEqual([rows, sum]);
    expect(found.actions).toEqual([save]);
  });

  it('schema refuses an unknown schemaVersion, a stray field and a malformed digest', () => {
    const snapshot = menuDeclarationSnapshot(input);
    expect(menuDeclarationSnapshotSchema.safeParse({ ...snapshot, schemaVersion: 2 }).success).toBe(false);
    expect(menuDeclarationSnapshotSchema.safeParse({ ...snapshot, extra: true }).success).toBe(false);
    expect(menuDeclarationSnapshotSchema.safeParse({ ...snapshot, digest: 'md5:00' }).success).toBe(false);
    expect(Object.keys(SCHEMA_FILES)).toContain('menuDeclarationSnapshot');
    expect(toJsonSchema(menuDeclarationSnapshotSchema)).toMatchObject({ additionalProperties: false });
  });
});

const DIGEST_OF_MINIMAL = 'sha256:fa52fa14c7a2cce0fd5053db69be7a77e7ee26880578091d40da9dbd14556a98';
