// Synthetic Layout fixture of the eqv tests: the cluster-single fixture of `packages/eqv/fixtures` with its id replaced.
import { readFileSync } from 'node:fs';
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
