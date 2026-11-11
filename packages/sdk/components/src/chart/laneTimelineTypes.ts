import type { ThemeColorToken } from '@ap/ui/theme';

/**
 * Declarative marks a menu draws on a LaneTimeline's overlay layer, above the segments and below the selection outline.
 * The SDK gives them no meaning: a menu maps its own events, actions or states onto time instants, time ranges and segment sets.
 * `laneId` limits an instant or range to one lane row; without it the mark crosses every lane. `dash` is `true` (default dash), or a canvas dash pattern.
 * Only `instant` and `range` take a `label`; labelled ones are listed in the chart's screen-reader summary.
 */
export type TimelineOverlay =
  | { kind: 'instant'; id: string; time: number; laneId?: string; colorToken?: ThemeColorToken; dash?: boolean | number[]; label?: string }
  | { kind: 'range'; id: string; start: number; end: number; laneId?: string; colorToken?: ThemeColorToken; label?: string }
  | { kind: 'segments'; id: string; segmentIds: string[]; colorToken?: ThemeColorToken; style: 'outline' | 'fill' };
