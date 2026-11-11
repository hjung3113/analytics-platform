// The 설비 온보딩 mock seed (`src/mock/onboarding/*.json`) is a copy of synthetic files in `packages/eqv/assets` plus figures the mock cannot
// compute (it may not import `@eqv/core`). This test re-derives every one of them, so a changed asset fails here instead of drifting.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aliasMetadataFileSchema, buildInventory, computeCoverage, latestBinding, validateLayout, validateSampleWindow, type MappingVersion, type ObservedInventory } from '@eqv/core';

const ASSETS = join(process.cwd(), '../../../packages/eqv/assets');
const SEED = join(process.cwd(), 'src/mock/onboarding');
const asset = (path: string) => JSON.parse(readFileSync(join(ASSETS, path), 'utf8')) as unknown;
const seed = <T,>(name: string) => JSON.parse(readFileSync(join(SEED, name), 'utf8')) as T;

describe('onboarding mock seed', () => {
  it('copies the synthetic rules, Type Dictionary, bindings, Mapping Versions, Layout draft and EV Templates unchanged', () => {
    expect(seed('rules.json')).toEqual({
      'model/synth-maker/synth-model': asset('onboarding/scopes/model/synth-maker/synth-model/alias-rules.json'),
      'equipment/eq-synth-01': asset('onboarding/scopes/equipment/eq-synth-01/alias-rules.json'),
    });
    expect(seed('dictionaries.json')).toEqual({ 'model/synth-maker/synth-model': asset('onboarding/scopes/model/synth-maker/synth-model/type-dictionary.json') });
    expect(seed('bindings.json')).toEqual({ 'eq-synth-01': asset('onboarding/bindings/eq-synth-01.bindings.json') });
    const mappings = Object.fromEntries(readdirSync(join(ASSETS, 'onboarding/mappings/eq-synth-01')).map((file) => {
      const m = asset(`onboarding/mappings/eq-synth-01/${file}`) as MappingVersion;
      return [m.hash, m];
    }));
    expect(seed('mappings.json')).toEqual({ 'eq-synth-01': mappings });
    expect(seed('layout-eq-synth-01.json')).toEqual(asset('layouts/eq-synth-01-layout/draft.layout.json'));
    for (const row of seed<{ templateId: string; document: unknown }[]>('templates.json')) {
      expect(row.document, row.templateId).toEqual(asset(`templates/${row.templateId}.template.json`));
      expect(validateLayout(row.document).ok, row.templateId).toBe(true);
    }
  });

  it('serves each window\'s Inventory as buildInventory of its batch and alias metadata; the staged g2 reuses g1\'s', async () => {
    const inventories = seed<Record<string, ObservedInventory>>('inventories.json');
    const windows = seed<Record<string, { hash: string; state: string; counterpart: string | null; dataGeneration: string; occurrences: number }[]>>('windows.json');
    for (const id of ['eq-synth-01', 'eq-synth-02']) {
      const dir = `observations/${id}/windows`;
      for (const file of readdirSync(join(ASSETS, dir))) {
        const result = await validateSampleWindow(asset(`${dir}/${file}`), { equipmentId: id, existing: [] });
        if (!result.ok) throw new Error(file);
        const hex = file.split('_')[2]!.replace('.batch.json', '');
        expect(inventories[hex], file).toEqual(buildInventory(result.batch, aliasMetadataFileSchema.parse(asset(`observations/${id}/alias-metadata.json`))));
        expect(windows[id]!.find((w) => w.hash === `sha256:${hex}`), file).toMatchObject({ state: 'active', dataGeneration: result.batch.dataGeneration, occurrences: result.batch.occurrences.length });
      }
    }
    const staged = windows['eq-synth-01']!.find((w) => w.state === 'staged')!;
    expect(inventories[staged.hash.slice(7)]).toEqual(inventories[staged.counterpart!.slice(7)]);
    expect(windows['eq-synth-03']).toEqual([]);
  });

  it('carries the Fleet figures of the latest Binding against the latest window', () => {
    const equipment = seed<{ equipmentId: string; status: string; coverage: unknown; unmappedReferences: number | null }[]>('equipment.json');
    const inventories = seed<Record<string, ObservedInventory>>('inventories.json');
    const windows = seed<Record<string, { hash: string; state: string }[]>>('windows.json');
    const bindings = asset('onboarding/bindings/eq-synth-01.bindings.json') as { bindings: Parameters<typeof latestBinding>[0] };
    const mapping = asset(`onboarding/mappings/eq-synth-01/${latestBinding(bindings.bindings)!.mappingHash.slice(7)}.mapping.json`) as MappingVersion;
    const coverage = computeCoverage(inventories[windows['eq-synth-01']![0]!.hash.slice(7)]!, mapping);
    expect(equipment.find((e) => e.equipmentId === 'eq-synth-01')).toMatchObject({
      status: 'drift-unknown', unmappedReferences: coverage.unmapped.reduce((s, u) => s + u.references, 0),
      coverage: { referenceRatio: coverage.references.ratio, aliasRatio: coverage.aliases.ratio, assumedRatio: coverage.assumed.ratio },
    });
    const eq02 = inventories[windows['eq-synth-02']![0]!.hash.slice(7)]!;
    expect(equipment.find((e) => e.equipmentId === 'eq-synth-02')).toMatchObject({ status: 'draft', coverage: null, unmappedReferences: eq02.aliases.reduce((s, a) => s + a.references, 0) });
    expect(equipment.find((e) => e.equipmentId === 'eq-synth-03')).toMatchObject({ status: 'no-observations', unmappedReferences: null });
    expect(equipment.every((e) => /^eq-synth-\d+$/.test(e.equipmentId))).toBe(true);
  });
});
