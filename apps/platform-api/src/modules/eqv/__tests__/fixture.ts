// Synthetic Layout fixture of the eqv tests: the cluster-single fixture of `packages/eqv/fixtures` with its id replaced.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type AliasRulesFile, type EquipmentLayoutDocument, publishMapping } from '@eqv/core';

const SOURCE = fileURLToPath(new URL('../../../../../../packages/eqv/fixtures/cluster-single/layout.json', import.meta.url));

export type LayoutJson = Record<string, unknown> & { id: string; components: { id: string; parentId?: string }[] };

export function layoutFixture(id: string): LayoutJson {
  const layout = JSON.parse(readFileSync(SOURCE, 'utf8')) as LayoutJson;
  return { ...layout, id };
}

/** The same Layout with a `parentId` cycle (EV#170): the first parented Component becomes its own ancestor's child. */
export function cyclicLayoutFixture(id: string): LayoutJson {
  const layout = layoutFixture(id);
  const child = layout.components.find((c) => c.parentId !== undefined);
  const parent = layout.components.find((c) => c.id === child?.parentId);
  if (!child || !parent) throw new Error('fixture has no parented Component');
  return { ...layout, components: layout.components.map((c) => (c.id === parent.id ? { ...c, parentId: child.id } : c)) };
}

type Query = (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** A hash that no flattening produces: the input of a publish that core `publishMapping` refuses before the hash is compared. */
export const UNREVIEWED_HASH = `sha256:${'0'.repeat(64)}`;

/**
 * The Mapping hash the author reviewed (#2053): what the browser computes with `@eqv/core` `publishMapping` over the saved rule files of the
 * equipment (global, maker, model, equipment), the window's aliases and the Layout document. Answers `UNREVIEWED_HASH` when core refuses.
 */
export async function reviewedMappingHash(sql: Query, workspaceId: string, equipmentId: string, layoutId: string, aliases: string[]): Promise<string> {
  const [eq] = (
    await sql('select e.model_id::text as model_id, m.vendor_id::text as vendor_id from eqv.equipment e join knowledge.equipment_model m on m.id::text = e.model_id::text where e.workspace_id = $1 and e.equipment_id = $2', [
      workspaceId,
      equipmentId,
    ])
  ).rows;
  if (!eq) return UNREVIEWED_HASH;
  const [vendorId, modelId] = [String(eq.vendor_id), String(eq.model_id)];
  const ruleFiles: AliasRulesFile[] = [];
  for (const [level, v, m, e] of [['global', null, null, null], ['maker', vendorId, null, null], ['model', vendorId, modelId, null], ['equipment', null, null, equipmentId]] as const) {
    const [row] = (
      await sql(
        'select document from eqv.alias_rules where workspace_id = $1 and level = $2 and vendor_id is not distinct from $3::uuid and model_id is not distinct from $4::uuid and equipment_id is not distinct from $5',
        [workspaceId, level, v, m, e],
      )
    ).rows;
    if (row) ruleFiles.push(row.document as AliasRulesFile);
  }
  const published = await publishMapping({ equipmentId, maker: vendorId, model: modelId, ruleFiles, aliases, layout: layoutFixture(layoutId) as unknown as EquipmentLayoutDocument });
  return published.ok ? published.mapping.hash : UNREVIEWED_HASH;
}

const BATCH_DIR = fileURLToPath(new URL('../../../../../../packages/eqv/assets/observations/eq-synth-02/windows/', import.meta.url));

/**
 * A valid synthetic Sample Window batch (the `eq-synth-02` asset) for another equipment. `shift` moves the range by that many whole days (so
 * another range, another content); `generation` is the Data Generation (a reprocessed generation of the same range has another hash).
 */
export function sampleBatch(equipmentId: string, opts: { generation?: string; shiftDays?: number } = {}): Record<string, unknown> {
  const file = readdirSync(BATCH_DIR)[0];
  if (!file) throw new Error('no synthetic batch asset');
  let text = JSON.stringify(JSON.parse(readFileSync(`${BATCH_DIR}${file}`, 'utf8'))).replaceAll('"eq-synth-02"', JSON.stringify(equipmentId));
  if (opts.generation) text = text.replaceAll('"dataGeneration":"g1"', `"dataGeneration":${JSON.stringify(opts.generation)}`);
  const days = opts.shiftDays ?? 0;
  if (days !== 0) text = text.replace(/"(\d{4})-(\d{2})-(\d{2})T/g, (_m, y: string, mo: string, d: string) => `"${y}-${mo}-${String(Number(d) + days).padStart(2, '0')}T`);
  return JSON.parse(text) as Record<string, unknown>;
}
