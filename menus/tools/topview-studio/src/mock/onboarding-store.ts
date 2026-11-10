/**
 * In-memory state of the 설비 온보딩 mock (#1658), seeded from `./onboarding/*.json` — copies of the synthetic files in
 * `packages/eqv/assets` (`src/onboarding-fixture.test.ts` proves the copies and the precomputed inventories and Fleet figures with
 * `@eqv/core`, which mock code may not import). Three synthetic equipment: `eq-synth-01` published (no stored Baseline Inventory, so
 * Drift is unknown) with a staged reprocessed window, `eq-synth-02` with rules but no Layout draft, `eq-synth-03` with no window.
 */
import type { FleetStatusCode, JsonDocument, SampleWindowRow, ScopeLevel } from '../endpoints';
import { drafts, mockId, resetStudioMock, stamp } from './store';
import bindingsSeed from './onboarding/bindings.json';
import dictionariesSeed from './onboarding/dictionaries.json';
import equipmentSeed from './onboarding/equipment.json';
import inventoriesSeed from './onboarding/inventories.json';
import layoutSeed from './onboarding/layout-eq-synth-01.json';
import mappingsSeed from './onboarding/mappings.json';
import rulesSeed from './onboarding/rules.json';
import templatesSeed from './onboarding/templates.json';
import windowsSeed from './onboarding/windows.json';

export type EquipmentRec = {
  equipmentId: string; label: string; vendorId: string; vendorName: string; modelId: string; modelName: string;
  status: FleetStatusCode; coverage: { referenceRatio: number | null; aliasRatio: number | null; assumedRatio: number | null } | null; unmappedReferences: number | null;
};
export type Binding = { layoutId: string; mappingHash: string; layoutRevision?: string; effectiveFrom: string; effectiveTo?: string };
export type MappingRec = { document: JsonDocument & { hash: string; layoutId: string; entries: unknown[] }; layoutRevision: string | null; publishedAt: string };
type Versioned = { document: JsonDocument; version: number };

type State = {
  equipment: EquipmentRec[];
  windows: Map<string, SampleWindowRow[]>;
  /** By the window's 64 hex digits. */
  inventories: Map<string, JsonDocument>;
  rules: Map<string, Versioned>;
  dictionaries: Map<string, Versioned>;
  mappings: Map<string, Map<string, MappingRec>>;
  bindings: Map<string, Binding[]>;
  /** By `<equipmentId>/<mappingHash>`. */
  baselines: Map<string, JsonDocument>;
};

const state: State = { equipment: [], windows: new Map(), inventories: new Map(), rules: new Map(), dictionaries: new Map(), mappings: new Map(), bindings: new Map(), baselines: new Map() };
export const onboarding = () => state;

/** Store key of a scoped file: `global`, `maker/<vendor>`, `model/<vendor>/<model>`, `equipment/<id>`; null when a level's id is missing. */
export function scopeKey(params: { level: ScopeLevel; vendorId?: string | undefined; modelId?: string | undefined; equipmentId?: string | undefined }): string | null {
  switch (params.level) {
    case 'global': return 'global';
    case 'maker': return params.vendorId ? `maker/${params.vendorId}` : null;
    case 'model': return params.vendorId && params.modelId ? `model/${params.vendorId}/${params.modelId}` : null;
    case 'equipment': return params.equipmentId ? `equipment/${params.equipmentId}` : null;
  }
}

const SEEDED_AT = '2026-01-01T01:04:30.000Z';

/** Back to the seed. Resets the Layouts mock as well and adds the equipment Layout draft the Mapping Board edits. */
export function resetOnboardingMock(): void {
  resetStudioMock();
  state.equipment = structuredClone(equipmentSeed) as EquipmentRec[];
  state.windows = new Map(Object.entries(structuredClone(windowsSeed) as Record<string, SampleWindowRow[]>));
  state.inventories = new Map(Object.entries(structuredClone(inventoriesSeed) as Record<string, JsonDocument>));
  state.rules = new Map(Object.entries(structuredClone(rulesSeed) as Record<string, JsonDocument>).map(([key, document]) => [key, { document, version: 1 }]));
  state.dictionaries = new Map(Object.entries(structuredClone(dictionariesSeed) as Record<string, JsonDocument>).map(([key, document]) => [key, { document, version: 1 }]));
  state.bindings = new Map(Object.entries(structuredClone(bindingsSeed) as Record<string, { bindings: Binding[] }>).map(([id, file]) => [id, file.bindings]));
  state.mappings = new Map(Object.entries(structuredClone(mappingsSeed) as unknown as Record<string, Record<string, MappingRec['document']>>)
    .map(([id, byHash]) => [id, new Map(Object.entries(byHash).map(([hash, document]) => [hash, { document, layoutRevision: null, publishedAt: SEEDED_AT }]))]));
  state.baselines = new Map();
  const layout = structuredClone(layoutSeed) as JsonDocument & { id: string; kind: string };
  drafts().set(layout.id, { id: mockId(), layoutId: layout.id, version: 1, document: layout, updatedAt: stamp() });
}

export const bundledTemplates = () => templatesSeed as unknown as { templateId: string; name: string; document: JsonDocument & { id: string; kind: string } }[];
export const equipmentById = (id: string) => state.equipment.find((e) => e.equipmentId === id);
export const hexOf = (hash: string) => hash.replace(/^sha256:/, '');

let staged = 0;
/**
 * Adds a synthetic window to `eq-synth-02` for a write sample (the app's conformance test): `staged` replaces the current active one,
 * `active` can be retired. Its Inventory is the seeded window's. Returns the 64 hex digits.
 */
export function stageOnboardingWindow(state: 'staged' | 'active'): string {
  const rows = onboarding().windows.get('eq-synth-02') ?? [];
  const base = rows[0]!;
  const hex = (++staged).toString(16).padStart(64, 'c');
  onboarding().inventories.set(hex, structuredClone(onboarding().inventories.get(hexOf(base.hash))!));
  const active = rows.find((w) => w.state === 'active');
  rows.push({ ...base, hash: `sha256:${hex}`, dataGeneration: `g-cf-${staged}`, state, counterpart: state === 'staged' ? active?.hash ?? null : null, mappingCount: 0 });
  onboarding().windows.set('eq-synth-02', rows);
  return hex;
}

resetOnboardingMock();
