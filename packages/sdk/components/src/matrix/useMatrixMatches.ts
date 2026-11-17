import { useMemo, useState } from 'react';
import type { MatrixColumn, MatrixEmphasisRule, MatrixNode } from '@ap/contracts';
import { matchesEmphasis, type MatrixValueOf } from './emphasis';

type Entry = { rules: Map<string, Set<string>>; columns: Set<string> };
type Snapshot<N extends MatrixNode> = {
  nodes: readonly N[];
  columns: readonly MatrixColumn[];
  rules: readonly MatrixEmphasisRule[];
  valueOf: MatrixValueOf<N> | undefined;
  generation: string | number;
  entries: Map<string, Entry>;
};

/** Retain only matching column ids for emphasized rows, never previous pages of data. Clear on consumer query generation change. */
export function useMatrixMatches<N extends MatrixNode>(nodes: readonly N[], columns: readonly MatrixColumn[], rules: readonly MatrixEmphasisRule[], valueOf: MatrixValueOf<N> | undefined, generation: string | number) {
  const [snapshot, setSnapshot] = useState<Snapshot<N>>({ nodes: [], columns: [], rules: [], valueOf: undefined, generation, entries: new Map() });
  let current = snapshot;
  if (snapshot.nodes !== nodes || snapshot.columns !== columns || snapshot.rules !== rules || snapshot.valueOf !== valueOf || snapshot.generation !== generation) {
    const loaded = new Map(nodes.map(node => [node.id, node]));
    const entries = new Map<string, Entry>();
    const validColumns = new Set(columns.map(column => column.id));
    const byRow = new Map<string, MatrixEmphasisRule['match'][]>();
    for (const rule of rules) byRow.set(rule.row, [...(byRow.get(rule.row) ?? []), rule.match]);
    for (const [row, matches] of byRow) {
      const node = loaded.get(row);
      const previous = snapshot.generation === generation ? snapshot.entries.get(row) : undefined;
      const matchedRules = new Map<string, Set<string>>();
      for (const match of matches) {
        const ruleKey = JSON.stringify(match);
        if (node && valueOf) matchedRules.set(ruleKey, new Set(columns.filter(column => matchesEmphasis(valueOf(node, column), match)).map(column => column.id)));
        else if (valueOf && previous?.rules.has(ruleKey)) matchedRules.set(ruleKey, new Set([...previous.rules.get(ruleKey)!].filter(id => validColumns.has(id))));
      }
      if (matchedRules.size > 0) entries.set(row, { rules: matchedRules, columns: new Set([...matchedRules.values()].flatMap(ids => [...ids])) });
    }
    current = { nodes, columns, rules, valueOf, generation, entries };
    // Pure render-phase state adjustment; no refs or DOM are touched during render.
    setSnapshot(current);
  }
  const union = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of current.entries.values()) for (const id of entry.columns) ids.add(id);
    return ids;
  }, [current.entries]);
  return { entries: current.entries, union };
}
