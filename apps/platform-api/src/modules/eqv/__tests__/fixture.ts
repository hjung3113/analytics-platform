// Synthetic Layout fixture of the eqv tests: the cluster-single fixture of `packages/eqv/fixtures` with its id replaced.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
