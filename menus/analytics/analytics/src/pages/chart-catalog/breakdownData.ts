import type { LegendTreeNode } from '@ap/components';
import type { ThemeColorToken } from '@ap/ui/theme';

type Label = { ko: string; en: string };
export type StateId = 'run' | 'idle' | 'stop';
export const STATES: readonly { id: StateId; label: Label; color: ThemeColorToken }[] = [
  { id: 'run', label: { ko: '가동', en: 'Running' }, color: 'chart-series-1' },
  { id: 'idle', label: { ko: '대기', en: 'Idle' }, color: 'chart-series-2' },
  { id: 'stop', label: { ko: '정지', en: 'Stopped' }, color: 'chart-series-3' },
];
type Minutes = Record<StateId, number>;
type Place = { id: string; label: Label; children?: Place[]; minutes?: Minutes };

export const ROOT_PLACE = 'loc';
/** Uneven depth on purpose: 전체 → 그룹 A → 라인 A1 → 공정 A1a/A1b, but 전체 → 그룹 B → 라인 B1 stops there. Synthetic ids. */
const PLACES: Place = { id: ROOT_PLACE, label: { ko: '전체', en: 'All' }, children: [
  { id: 'A', label: { ko: '그룹 A', en: 'Group A' }, children: [
    { id: 'A1', label: { ko: '라인 A1', en: 'Line A1' }, children: [
      { id: 'A1a', label: { ko: '공정 A1a', en: 'Process A1a' }, minutes: { run: 620, idle: 180, stop: 40 } },
      { id: 'A1b', label: { ko: '공정 A1b', en: 'Process A1b' }, minutes: { run: 540, idle: 240, stop: 90 } },
    ] },
  ] },
  { id: 'B', label: { ko: '그룹 B', en: 'Group B' }, children: [
    { id: 'B1', label: { ko: '라인 B1', en: 'Line B1' }, minutes: { run: 700, idle: 120, stop: 20 } },
  ] },
] };

function find(place: Place, id: string): Place | null {
  if (place.id === id) return place;
  for (const child of place.children ?? []) { const hit = find(child, id); if (hit) return hit; }
  return null;
}
export function isPlaceId(value: unknown): value is string {
  return typeof value === 'string' && find(PLACES, value) !== null;
}
function sum(place: Place): Minutes {
  if (place.minutes) return place.minutes;
  const total: Minutes = { run: 0, idle: 0, stop: 0 };
  for (const child of place.children ?? []) for (const { id } of STATES) total[id] += sum(child)[id];
  return total;
}

export type BreakdownRow = { id: string; label: string; minutes: Minutes; total: number; serverShareTotal: number | null };
/** The rows of a node: its children, or three units of a node without a deeper level. The first row has a server total, the others none. */
export function breakdownRows(nodeId: string, lang: 'ko' | 'en'): BreakdownRow[] {
  const place = find(PLACES, nodeId) ?? PLACES;
  const parts: { id: string; label: string; minutes: Minutes }[] = place.children
    ? place.children.map(child => ({ id: child.id, label: child.label[lang], minutes: sum(child) }))
    : [0.5, 0.3, 0.2].map((weight, index, weights) => {
      const base = sum(place);
      const given = weights.slice(0, index).reduce((all, w) => all + w, 0);
      const part = (id: StateId) => Math.round(base[id] * (index === weights.length - 1 ? 1 - given : weight));
      const minutes = { run: part('run'), idle: part('idle'), stop: part('stop') };
      return { id: `${place.id}-${index + 1}`, label: `${lang === 'ko' ? '설비' : 'Unit'} ${place.id}-${index + 1}`, minutes };
    });
  return parts.map((part, index) => ({ ...part, total: part.minutes.run + part.minutes.idle + part.minutes.stop, serverShareTotal: index === 0 ? 100 : null }));
}

export function breakdownTree(tx: (label: Label) => string): LegendTreeNode[] {
  const places = (place: Place): LegendTreeNode => ({ id: place.id, label: tx(place.label), drillOnly: true, ...(place.children ? { children: place.children.map(places) } : {}) });
  return [
    { id: 'states', label: tx({ ko: '상태', en: 'State' }), children: STATES.map(state => ({ id: state.id, label: tx(state.label), color: state.color })) },
    places(PLACES),
  ];
}
