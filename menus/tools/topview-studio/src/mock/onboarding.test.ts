import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KERNEL_PERMISSIONS, NO_FEATURES, contextCapabilities, groupId, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole } from '@ap/mock-server';
import {
  DICTIONARY_GLOBAL_EDIT_PERMISSION, EQV_READ_PERMISSION, LAYOUT_EDIT_PERMISSION, LAYOUT_PUBLISH_PERMISSION, MAPPING_PUBLISH_PERMISSION, RULES_EDIT_PERMISSION, STUDIO_VIEW_PERMISSION,
  WINDOW_IMPORT_PERMISSION, onboardingActionSpecs, onboardingReadSpecs,
} from '../endpoints';
import { resetOnboardingMock, setSampleWindowImport, topviewOnboardingActionsMock, topviewStudioActionsMock, topviewStudioMock, type SampleWindowImportHooks } from './index';
import { flattenRules } from './onboarding-actions';

/** Mirror the two manifests in '../index.ts' (importing it from `src/mock/**` is lint-banned); change them together. */
const base = { group: groupId('topviewStudio'), description: { ko: 'd', en: 'd' }, permission: STUDIO_VIEW_PERMISSION, requiresScope: false, context: contextCapabilities(), features: NO_FEATURES };
const menus: MenuMeta[] = [
  { ...base, id: 'eqv-studio', label: { ko: '레이아웃', en: 'Layouts' }, path: '/tools/eqv-studio', pageType: 'catalog', pageKeys: ['layout', 'revision', 'template'] },
  { ...base, id: 'eqv-onboarding', label: { ko: '설비 온보딩', en: 'Equipment onboarding' }, path: '/tools/eqv-onboarding', pageType: 'management', pageKeys: ['equipment', 'step', 'window'] },
];
const permissions = [...KERNEL_PERMISSIONS, STUDIO_VIEW_PERMISSION, EQV_READ_PERMISSION, LAYOUT_EDIT_PERMISSION, LAYOUT_PUBLISH_PERMISSION, RULES_EDIT_PERMISSION, DICTIONARY_GLOBAL_EDIT_PERMISSION, MAPPING_PUBLISH_PERMISSION, WINDOW_IMPORT_PERMISSION];
const adapter = createMockAdapter({ endpoints: [...topviewStudioMock], actions: [...topviewStudioActionsMock, ...topviewOnboardingActionsMock], registry: { menus }, permissions });

const previousRole = getRole();
beforeEach(() => { resetOnboardingMock(); setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

const query = async (endpoint: string, params: Record<string, unknown> = {}) => adapter.menuQuery({ endpoint, context: {}, params });
const data = async <T,>(endpoint: string, params: Record<string, unknown> = {}) => (await query(endpoint, params)).data as T;
const act = (action: string, input: Record<string, unknown>, expectedVersion?: string) => adapter.menuAction({
  action, context: {}, input, idempotencyKey: crypto.randomUUID(), ...(expectedVersion === undefined ? {} : { expectedVersion }),
});
const G1 = '23e9e214b396bfaa4539e7b30c5f8f9163fbac6c50201430231f641ff7c822ba';
type Windows = { rows: { hash: string; state: string; mappingCount: number }[] };

describe('onboarding mock reads', () => {
  it('registers every declared read and write', () => {
    expect(topviewStudioMock.filter((e) => e.spec.menuId === 'eqv-onboarding').map((e) => e.spec.id)).toEqual(onboardingReadSpecs.map((s) => s.id));
    expect(topviewOnboardingActionsMock.map((a) => a.spec.id)).toEqual(onboardingActionSpecs.map((s) => s.id));
  });

  it('serves the three synthetic equipment with status codes and the latest active window', async () => {
    const { rows } = await data<{ rows: { equipmentId: string; status: string; latestWindow: { hash: string } | null }[] }>('eqv.fleet');
    expect(rows.map(({ equipmentId, status }) => [equipmentId, status])).toEqual([['eq-synth-01', 'drift-unknown'], ['eq-synth-02', 'draft'], ['eq-synth-03', 'no-observations']]);
    expect(rows[0]!.latestWindow?.hash).toBe(`sha256:${G1}`);
    expect(rows[2]!.latestWindow).toBeNull();
  });

  it.each([
    ['eqv.aliasRules', { level: 'model', vendorId: 'synth-maker', modelId: 'synth-model' }, 'ok'],
    ['eqv.aliasRules', { level: 'maker', vendorId: 'synth-maker' }, 'empty'],
    ['eqv.aliasRules', { level: 'model', vendorId: 'synth-maker' }, 'error'],
    ['eqv.typeDictionary', { level: 'global' }, 'empty'],
    ['eqv.equipmentScopes', { equipmentId: 'eq-synth-01' }, 'ok'],
    ['eqv.equipmentScopes', { equipmentId: 'eq-unknown' }, 'empty'],
    ['eqv.observedInventory', { equipmentId: 'eq-synth-01', windowHash: G1 }, 'ok'],
    ['eqv.observedInventory', { equipmentId: 'eq-synth-02', windowHash: G1 }, 'empty'],
    ['eqv.baselineInventory', { equipmentId: 'eq-synth-01', mappingHash: `sha256:${'0'.repeat(64)}` }, 'empty'],
    ['eqv.bindings', { equipmentId: 'eq-unknown' }, 'empty'],
  ])('%s %j answers %s', async (endpoint, params, outcome) => {
    expect((await query(endpoint, params)).outcome).toBe(outcome);
  });

  it('answers bindings as the server does, { document, version } with the binding count as version, and an empty file for an unpublished equipment', async () => {
    expect(await data('eqv.bindings', { equipmentId: 'eq-synth-01' })).toMatchObject({ document: { schemaVersion: '0.4', equipmentId: 'eq-synth-01', bindings: [{}, {}] }, version: '2' });
    expect(await data('eqv.bindings', { equipmentId: 'eq-synth-02' })).toEqual({ document: { schemaVersion: '0.4', equipmentId: 'eq-synth-02', bindings: [] }, version: '0' });
  });

  it('answers a Mapping Version as { layoutRevision, publishedAt, document } like the server', async () => {
    const { document } = await data<{ document: { bindings: { mappingHash: string }[] } }>('eqv.bindings', { equipmentId: 'eq-synth-01' });
    const hash = document.bindings.at(-1)!.mappingHash;
    const read = await data<{ layoutRevision: string | null; publishedAt: string; document: { hash: string } }>('eqv.mappingVersion', { equipmentId: 'eq-synth-01', hash });
    expect(Object.keys(read).sort()).toEqual(['document', 'layoutRevision', 'publishedAt']);
    expect(read.document.hash).toBe(hash);
  });
});

describe('onboarding mock writes', () => {
  it('saveAliasRules: version 0 creates, a stale version conflicts, a scope that differs from the params is refused', async () => {
    const document = { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId: 'eq-synth-02' }, rules: [] };
    const created = await act('eqv.saveAliasRules', { level: 'equipment', equipmentId: 'eq-synth-02', document }, '0');
    expect(created).toMatchObject({ outcome: 'ok', data: { id: expect.any(String), version: '1' } });
    expect(Object.keys(created.data as object).sort()).toEqual(['id', 'version']);
    expect((await act('eqv.saveAliasRules', { level: 'equipment', equipmentId: 'eq-synth-02', document }, '0')).outcome).toBe('conflict');
    expect(await data('eqv.aliasRules', { level: 'equipment', equipmentId: 'eq-synth-02' })).toMatchObject({ version: '1' });
    const wrong = await act('eqv.saveAliasRules', { level: 'equipment', equipmentId: 'eq-synth-01', document }, '1');
    expect(wrong).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['document', 'scope'], code: 'scope_mismatch' }] });
  });

  it('publishMapping: needs a published Revision, opens a Binding closing the previous one, stores the Baseline, refuses same-as-latest', async () => {
    const baseline = await data<Record<string, unknown>>('eqv.observedInventory', { equipmentId: 'eq-synth-01', windowHash: G1 });
    const input = { equipmentId: 'eq-synth-01', layoutId: 'eq-synth-01-layout', layoutRevision: `sha256:${'a'.repeat(64)}`, windowHash: G1, effectiveFrom: '2026-01-01T10:30:00.000' };
    expect(await act('eqv.publishMapping', input, '2')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['layoutRevision'], code: 'not_found' }] });
    const revision = await act('eqv.publishRevision', { layoutId: 'eq-synth-01-layout' }, '1');
    const layoutRevision = (revision.data as { revision: string }).revision;
    expect((await act('eqv.publishMapping', { ...input, layoutRevision }, '1')).outcome).toBe('conflict');
    const published = await act('eqv.publishMapping', { ...input, layoutRevision }, '2');
    expect(published.outcome).toBe('ok');
    expect(Object.keys(published.data as object).sort()).toEqual(['bindingId', 'mappingHash', 'version']);
    const { mappingHash } = published.data as { mappingHash: string };
    const bindings = await data<{ document: { bindings: { effectiveFrom: string; effectiveTo?: string; mappingHash: string }[] }; version: string }>('eqv.bindings', { equipmentId: 'eq-synth-01' });
    expect(bindings.version).toBe('3');
    expect(bindings.document.bindings.at(-2)!.effectiveTo).toBe('2026-01-01T10:30:00.000');
    expect(bindings.document.bindings.at(-1)).toMatchObject({ mappingHash, layoutRevision, effectiveFrom: '2026-01-01T10:30:00.000' });
    expect(await data('eqv.baselineInventory', { equipmentId: 'eq-synth-01', mappingHash })).toEqual({ document: baseline });
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-01' })).rows.find((w) => w.hash.endsWith(G1))!.mappingCount).toBe(3);
    expect((await data<{ rows: { equipmentId: string; status: string }[] }>('eqv.fleet')).rows[0]!.status).toBe('published');
    const again = await act('eqv.publishMapping', { ...input, layoutRevision, effectiveFrom: '2026-01-01T11:00:00.000' }, '3');
    expect(again).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['mapping'], code: 'same-as-latest' }] });
    const early = await act('eqv.publishMapping', { ...input, layoutRevision, effectiveFrom: '2026-01-01T10:00:00.000' }, '3');
    expect(early).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['effectiveFrom'], code: 'not_after_latest' }] });
  });

  it('publishMapping takes the Baseline from an active window of the equipment: a staged, retired or foreign window is windowHash/not_active and nothing is stored', async () => {
    const revision = await act('eqv.publishRevision', { layoutId: 'eq-synth-01-layout' }, '1');
    const layoutRevision = (revision.data as { revision: string }).revision;
    const base = { equipmentId: 'eq-synth-01', layoutId: 'eq-synth-01-layout', layoutRevision, effectiveFrom: '2026-01-01T10:30:00.000' };
    const staged = (await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-01' })).rows.find((w) => w.state === 'staged')!;
    for (const windowHash of [staged.hash.slice(7), 'f'.repeat(64)]) {
      expect(await act('eqv.publishMapping', { ...base, windowHash }, '2')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['windowHash'], code: 'not_active' }] });
    }
    expect((await act('eqv.publishMapping', { ...base, windowHash: 'xyz' }, '2')).fieldErrors).toEqual([{ path: ['windowHash'], code: 'invalid' }]);
    expect((await data<{ version: string }>('eqv.bindings', { equipmentId: 'eq-synth-01' })).version).toBe('2');
  });

  it('replace activates the staged generation and marks the old one replaced; retire refuses a window that is not active', async () => {
    const before = await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-01' });
    const staged = before.rows.find((w) => w.state === 'staged')!;
    expect((await act('eqv.replaceSampleWindow', { equipmentId: 'eq-synth-01', windowHash: staged.hash.slice(7) })).outcome).toBe('ok');
    const after = await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-01' });
    expect(after.rows.map((w) => w.state)).toEqual(['replaced', 'active']);
    expect(await act('eqv.retireSampleWindow', { equipmentId: 'eq-synth-01', windowHash: G1 })).toMatchObject({ outcome: 'invalid', fieldErrors: [{ code: 'not_active' }] });
    expect((await act('eqv.retireSampleWindow', { equipmentId: 'eq-synth-01', windowHash: staged.hash.slice(7) })).outcome).toBe('ok');
  });

  it('a global-level save also needs eqv-studio:dictionary-global-edit', async () => {
    const global = { level: 'global', document: { schemaVersion: '0.4', scope: { level: 'global' }, rules: [] } };
    // A mock adapter installs its permission vocabulary as the roles' world: build one without the global permission, then restore.
    const build = (list: readonly string[]) => createMockAdapter({ endpoints: [...topviewStudioMock], actions: [...topviewStudioActionsMock, ...topviewOnboardingActionsMock], registry: { menus }, permissions: list as typeof permissions });
    const withoutGlobal = build(permissions.filter((p) => p !== DICTIONARY_GLOBAL_EDIT_PERMISSION));
    try {
      const send = (input: Record<string, unknown>) => withoutGlobal.menuAction({ action: 'eqv.saveAliasRules', context: {}, input, idempotencyKey: crypto.randomUUID(), expectedVersion: '0' });
      expect((await send(global)).outcome).toBe('forbidden');
      expect((await send({ level: 'equipment', equipmentId: 'eq-synth-02', document: { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId: 'eq-synth-02' }, rules: [] } })).outcome).toBe('ok');
    } finally { build(permissions); }
    expect((await act('eqv.saveAliasRules', global, '0')).outcome).toBe('ok');
  });

  it('a viewer may read but not write', async () => {
    setRole('viewer');
    const outcome = (await act('eqv.retireSampleWindow', { equipmentId: 'eq-synth-01', windowHash: G1 })).outcome;
    expect(outcome).toBe('forbidden');
  });
});

// The app wires `@eqv/core`'s `checkSampleWindowImport` and `buildInventory` (`apps/platform-web/src/dev/eqv-onboarding-import.test.ts` runs
// them on synthetic batches); mock code may not import core, so these tests drive the store with a stand-in verdict over the file's fields.
type Batch = { equipmentId: string; from: string; to: string; timeDomain: string; dataGeneration: string; hash: string; bad?: boolean };
const stub: SampleWindowImportHooks = {
  async check(raw, ctx) {
    const b = raw as Batch;
    if (b.bad) return { ok: false, issues: [{ code: 'schema', path: ['occurrences', 0] }] };
    const sameRange = ctx.existing.filter((r) => r.from === b.from && r.to === b.to);
    const summary = { from: b.from, to: b.to, timeDomain: b.timeDomain, dataGeneration: b.dataGeneration, occurrences: 3, hash: b.hash };
    return { ok: true, batch: b, summary, same: ctx.existing.find((r) => r.hash === b.hash) ?? null, replaces: ctx.sameRangeReplaces ? sameRange.filter((r) => r.hash !== b.hash) : [] };
  },
  inventory: (batch) => ({ schemaVersion: '0.4', equipmentId: (batch as Batch).equipmentId, aliases: [] }),
};
const H = (c: string) => `sha256:${c.repeat(64)}`;
const upload = async (body: unknown, name = 'w.batch.json') => {
  const answer = await adapter.uploadFile!({ file: new Blob([typeof body === 'string' ? body : JSON.stringify(body)], { type: 'application/json' }), name, idempotencyKey: crypto.randomUUID() });
  return answer.data!.id;
};
const batch = (over: Partial<Batch> = {}): Batch => ({ equipmentId: 'eq-synth-03', from: '2026-01-02T10:00:00.000', to: '2026-01-02T10:30:00.000', timeDomain: 'site-synth', dataGeneration: 'g1', hash: H('d'), ...over });

describe('onboarding mock import and registration', () => {
  beforeEach(() => setSampleWindowImport(stub));

  it('importSampleWindow stores the uploaded window as an active row, serves its Inventory and moves Fleet off no-observations (its Model has rules: draft)', async () => {
    const answer = await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch()) });
    expect(answer).toMatchObject({ outcome: 'ok', data: { hash: H('d'), dataGeneration: 'g1', state: 'active', counterpart: null, mappingCount: 0, occurrences: 3, timeDomain: 'site-synth' } });
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows.map((w) => w.hash)).toEqual([H('d')]);
    expect(await data('eqv.observedInventory', { equipmentId: 'eq-synth-03', windowHash: 'd'.repeat(64) })).toMatchObject({ equipmentId: 'eq-synth-03' });
    const fleet = await data<{ rows: { equipmentId: string; status: string; latestWindow: { hash: string } | null }[] }>('eqv.fleet');
    expect(fleet.rows[2]).toMatchObject({ equipmentId: 'eq-synth-03', status: 'draft', latestWindow: { hash: H('d') } });
  });

  it('the same content again answers the stored row and adds nothing', async () => {
    await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch()) });
    expect(await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch(), 'again.batch.json') })).toMatchObject({ outcome: 'ok', data: { hash: H('d'), state: 'active' } });
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows).toHaveLength(1);
  });

  it('a reprocessed generation of an active window\'s range is staged against it, never replacing it on import', async () => {
    await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch()) });
    const staged = await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch({ dataGeneration: 'g2', hash: H('e') }), 'g2.batch.json') });
    expect(staged).toMatchObject({ outcome: 'ok', data: { hash: H('e'), state: 'staged', counterpart: H('d') } });
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows.map((w) => w.state)).toEqual(['active', 'staged']);
  });

  it.each([
    ['another user\'s upload', async () => { setRole('admin'); const id = await upload(batch()); setRole('engineer'); return id; }, [{ path: ['uploadId'], code: 'not_found' }]],
    ['an unknown upload id', async () => 'F-mock-404', [{ path: ['uploadId'], code: 'not_found' }]],
    ['a file that is not JSON', async () => upload('{not json'), [{ path: ['file'], code: 'not_json' }]],
    ['a file the validator refuses', async () => upload(batch({ bad: true })), [{ path: ['file', 'occurrences', '0'], code: 'schema' }]],
  ])('importSampleWindow refuses %s as invalid and stores nothing', async (_what, uploadId, fieldErrors) => {
    expect(await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await uploadId() })).toMatchObject({ outcome: 'invalid', fieldErrors });
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows).toEqual([]);
  });

  it('one active window per range: import A, stage B, retire A, then C is refused while B waits, and replacing B leaves one active row', async () => {
    const imp = async (over: Partial<Batch>, name: string) => act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch(over), name) });
    const active = async () => (await data<Windows & { rows: { from: string }[] }>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows.filter((w) => w.state === 'active');
    await imp({}, 'a.batch.json');
    expect(await imp({ dataGeneration: 'g2', hash: H('e') }, 'b.batch.json')).toMatchObject({ data: { state: 'staged' } });
    await act('eqv.retireSampleWindow', { equipmentId: 'eq-synth-03', windowHash: 'd'.repeat(64) });
    expect(await active()).toHaveLength(0);
    expect(await imp({ dataGeneration: 'g3', hash: H('f') }, 'c.batch.json')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['file'], code: 'staged_exists' }] });
    expect(await act('eqv.replaceSampleWindow', { equipmentId: 'eq-synth-03', windowHash: 'e'.repeat(64) })).toMatchObject({ outcome: 'ok', data: { activeHash: H('e'), replacedHash: '' } });
    expect((await active()).map((w) => w.hash)).toEqual([H('e')]);
  });

  it('replace retires nothing but the active window of the staged row\'s exact range', async () => {
    await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch()) });
    await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch({ dataGeneration: 'g2', hash: H('e') }), 'b.batch.json') });
    expect(await act('eqv.replaceSampleWindow', { equipmentId: 'eq-synth-03', windowHash: 'e'.repeat(64) })).toMatchObject({ data: { replacedHash: H('d') } });
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows.map((w) => w.state)).toEqual(['replaced', 'active']);
  });

  it('the content of a retired window is refused as file/retired and stays retired', async () => {
    await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch()) });
    expect((await act('eqv.retireSampleWindow', { equipmentId: 'eq-synth-03', windowHash: 'd'.repeat(64) })).outcome).toBe('ok');
    expect(await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: await upload(batch(), 'again.batch.json') })).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['file'], code: 'retired' }] });
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows.map((w) => w.state)).toEqual(['retired']);
  });

  it('two imports for one equipment in flight together both land (the rows are read again after the check)', async () => {
    const [a, b] = await Promise.all([upload(batch()), upload(batch({ from: '2026-01-03T10:00:00.000', to: '2026-01-03T10:30:00.000', hash: H('f') }), 'b.batch.json')]);
    // A check slow enough that both handlers are waiting on it at once.
    setSampleWindowImport({ ...stub, check: async (raw, ctx) => { await new Promise((resolve) => setTimeout(resolve, 20)); return stub.check(raw, ctx); } });
    const answers = await Promise.all([act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: a }), act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: b })]);
    expect(answers.map((x) => x.outcome)).toEqual(['ok', 'ok']);
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows.map((w) => w.hash).sort()).toEqual([H('d'), H('f')]);
  });

  it('importSampleWindow refuses an unknown equipment', async () => {
    expect(await act('eqv.importSampleWindow', { equipmentId: 'eq-unknown', uploadId: await upload(batch()) })).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['equipmentId'], code: 'not_found' }] });
  });

  it('registerEquipment adds a no-observations Fleet row under a known Hub model, with its scope', async () => {
    const answer = await act('eqv.registerEquipment', { equipmentId: 'eq-new-01', label: ' New 01 ', vendorId: 'synth-maker', modelId: 'synth-model' });
    expect(answer).toMatchObject({ outcome: 'ok', data: { equipmentId: 'eq-new-01' } });
    const fleet = await data<{ rows: Record<string, unknown>[] }>('eqv.fleet');
    expect(fleet.rows.at(-1)).toEqual({ equipmentId: 'eq-new-01', label: 'New 01', vendorId: 'synth-maker', vendorName: 'Synth Maker', modelId: 'synth-model', modelName: 'Synth Model', status: 'no-observations', latestWindow: null, coverage: null, unmappedReferences: null });
    expect(await data('eqv.equipmentScopes', { equipmentId: 'eq-new-01' })).toEqual({ equipmentId: 'eq-new-01', vendorId: 'synth-maker', modelId: 'synth-model' });
    expect(await data('eqv.bindings', { equipmentId: 'eq-new-01' })).toMatchObject({ version: '0' });
  });

  it.each([
    ['an id that differs only by case', { equipmentId: 'EQ-SYNTH-01' }, [{ path: ['equipmentId'], code: 'exists' }]],
    ['an id the address cannot carry', { equipmentId: 'eq new' }, [{ path: ['equipmentId'], code: 'invalid' }]],
    ['an empty label', { label: '  ' }, [{ path: ['label'], code: 'invalid' }]],
    ['an unknown Hub model', { modelId: 'other-model' }, [{ path: ['modelId'], code: 'not_found' }]],
    ['an unknown Hub vendor', { vendorId: 'other-maker' }, [{ path: ['vendorId'], code: 'not_found' }]],
  ])('registerEquipment refuses %s', async (_what, over, fieldErrors) => {
    const answer = await act('eqv.registerEquipment', { equipmentId: 'eq-new-02', label: 'New 02', vendorId: 'synth-maker', modelId: 'synth-model', ...over });
    expect(answer).toMatchObject({ outcome: 'invalid', fieldErrors });
    expect((await data<{ rows: unknown[] }>('eqv.fleet')).rows).toHaveLength(3);
  });

  it('both writes need eqv-studio:window-import', async () => {
    setRole('viewer');
    expect((await act('eqv.registerEquipment', { equipmentId: 'eq-new-03', label: 'x', vendorId: 'synth-maker', modelId: 'synth-model' })).outcome).toBe('forbidden');
    expect((await act('eqv.importSampleWindow', { equipmentId: 'eq-synth-03', uploadId: 'F-mock-1' })).outcome).toBe('forbidden');
  });
});

describe('flattenRules (stand-in for core resolution)', () => {
  const scope = (level: string) => ({ level });
  it.each([
    ['an equipment exact rule beats a model rule', 'PM2', 'pm-x'],
    ['a model exact rule beats the model pattern', 'LLA', 'll-a'],
    ['a pattern substitutes {n:letter}', 'PM3', 'pm-c'],
    ['no match leaves the alias unmapped', 'VIRT', null],
  ])('%s', (_name, alias, componentId) => {
    const files = [
      { scope: scope('equipment'), rules: [{ id: 'e', match: { exact: ['PM2'] }, target: { componentId: 'pm-x' }, certainty: 'verified' }] },
      { scope: scope('model'), rules: [{ id: 'p', match: { pattern: 'PM{n}' }, target: { componentId: 'pm-{n:letter}' }, certainty: 'verified' }, { id: 'l', match: { exact: ['LLA'] }, target: { componentId: 'll-a' }, certainty: 'verified' }] },
    ];
    const [entry] = flattenRules(files, [alias]);
    expect(entry?.target.componentId ?? null).toBe(componentId);
  });
});
