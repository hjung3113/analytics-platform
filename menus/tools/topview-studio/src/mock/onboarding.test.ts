import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KERNEL_PERMISSIONS, NO_FEATURES, contextCapabilities, groupId, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole } from '@ap/mock-server';
import {
  DICTIONARY_GLOBAL_EDIT_PERMISSION, EQV_READ_PERMISSION, LAYOUT_EDIT_PERMISSION, LAYOUT_PUBLISH_PERMISSION, MAPPING_PUBLISH_PERMISSION, RULES_EDIT_PERMISSION, STUDIO_VIEW_PERMISSION,
  WINDOW_IMPORT_PERMISSION, onboardingActionSpecs, onboardingReadSpecs,
} from '../endpoints';
import { resetOnboardingMock, topviewOnboardingActionsMock, topviewStudioActionsMock, topviewStudioMock } from './index';
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
  ])('%s %j answers %s', async (endpoint, params, outcome) => {
    expect((await query(endpoint, params)).outcome).toBe(outcome);
  });

  it('answers bindings with the binding count as version, and an empty file for an unpublished equipment', async () => {
    expect(await data('eqv.bindings', { equipmentId: 'eq-synth-01' })).toMatchObject({ version: '2', bindings: [{}, {}] });
    expect(await data('eqv.bindings', { equipmentId: 'eq-synth-02' })).toMatchObject({ version: '0', bindings: [] });
  });
});

describe('onboarding mock writes', () => {
  it('saveAliasRules: version 0 creates, a stale version conflicts, a scope that differs from the params is refused', async () => {
    const document = { schemaVersion: '0.4', scope: { level: 'equipment', equipmentId: 'eq-synth-02' }, rules: [] };
    expect((await act('eqv.saveAliasRules', { level: 'equipment', equipmentId: 'eq-synth-02', document }, '0')).outcome).toBe('ok');
    expect((await act('eqv.saveAliasRules', { level: 'equipment', equipmentId: 'eq-synth-02', document }, '0')).outcome).toBe('conflict');
    expect(await data('eqv.aliasRules', { level: 'equipment', equipmentId: 'eq-synth-02' })).toMatchObject({ version: '1' });
    const wrong = await act('eqv.saveAliasRules', { level: 'equipment', equipmentId: 'eq-synth-01', document }, '1');
    expect(wrong).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['document', 'scope'], code: 'scope_mismatch' }] });
  });

  it('publishMapping: needs a published Revision, opens a Binding closing the previous one, stores the Baseline, refuses same-as-latest', async () => {
    const baseline = await data<Record<string, unknown>>('eqv.observedInventory', { equipmentId: 'eq-synth-01', windowHash: G1 });
    const input = { equipmentId: 'eq-synth-01', layoutId: 'eq-synth-01-layout', layoutRevision: `sha256:${'a'.repeat(64)}`, baseline, effectiveFrom: '2026-01-01T10:30:00.000' };
    expect(await act('eqv.publishMapping', input, '2')).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['layoutRevision'], code: 'not_found' }] });
    const revision = await act('eqv.publishRevision', { layoutId: 'eq-synth-01-layout' }, '1');
    const layoutRevision = (revision.data as { revision: string }).revision;
    expect((await act('eqv.publishMapping', { ...input, layoutRevision }, '1')).outcome).toBe('conflict');
    const published = await act('eqv.publishMapping', { ...input, layoutRevision }, '2');
    expect(published.outcome).toBe('ok');
    const { mappingHash } = published.data as { mappingHash: string };
    const bindings = await data<{ bindings: { effectiveFrom: string; effectiveTo?: string; mappingHash: string }[]; version: string }>('eqv.bindings', { equipmentId: 'eq-synth-01' });
    expect(bindings.version).toBe('3');
    expect(bindings.bindings.at(-2)!.effectiveTo).toBe('2026-01-01T10:30:00.000');
    expect(bindings.bindings.at(-1)).toMatchObject({ mappingHash, layoutRevision, effectiveFrom: '2026-01-01T10:30:00.000' });
    expect(await data('eqv.baselineInventory', { equipmentId: 'eq-synth-01', mappingHash })).toEqual(baseline);
    expect((await data<Windows>('eqv.sampleWindows', { equipmentId: 'eq-synth-01' })).rows.find((w) => w.hash.endsWith(G1))!.mappingCount).toBe(3);
    expect((await data<{ rows: { equipmentId: string; status: string }[] }>('eqv.fleet')).rows[0]!.status).toBe('published');
    const again = await act('eqv.publishMapping', { ...input, layoutRevision, effectiveFrom: '2026-01-01T11:00:00.000' }, '3');
    expect(again).toMatchObject({ outcome: 'invalid', fieldErrors: [{ code: 'same-as-latest' }] });
    const early = await act('eqv.publishMapping', { ...input, layoutRevision, effectiveFrom: '2026-01-01T10:00:00.000' }, '3');
    expect(early).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['effectiveFrom'], code: 'not_after_latest' }] });
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

  it('a viewer may read but not write', async () => {
    setRole('viewer');
    const outcome = (await act('eqv.retireSampleWindow', { equipmentId: 'eq-synth-01', windowHash: G1 })).outcome;
    expect(outcome).toBe('forbidden');
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
