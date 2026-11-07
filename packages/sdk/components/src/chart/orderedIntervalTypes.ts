import type { ReactNode } from 'react';
import type { ThemeColorToken } from '@ap/ui/theme';

/** Performance boundary per initial input / range response, not a lane or domain limit. */
export const ORDERED_TRACK_RESPONSE_LIMIT = 10_000;
export type OrderedTrackLane = { laneKey: string; label: string };
export type OrderedTrackState = { label: string; colorToken: ThemeColorToken };
export type OrderedTrackItem = {
  id: string;
  laneKey: string;
  orderStart: number;
  state: string;
  label: string;
} & (
  | { kind?: 'interval'; orderEnd?: number; carryover?: boolean }
  | { kind: 'point'; orderEnd?: never; carryover?: never }
);
export type OrderedTrackMarker = {
  order: number;
  label: string;
  kind: 'boundary' | 'inversion' | 'partial';
};
export type OrderedTrackStatus =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'partial'
  | 'forbidden'
  | 'unsupported';
export type OrderedTrackLoadState = 'loading' | 'ready' | 'error';
export type OrderedIntervalTrackProps = {
  ariaLabel: string;
  description?: ReactNode;
  lanes: readonly OrderedTrackLane[];
  items: readonly OrderedTrackItem[];
  states: Readonly<Record<string, OrderedTrackState>>;
  /** Finite increasing order bounds, independent of the currently loaded items. */
  domain: [number, number];
  initialView?: [number, number];
  height?: number;
  axis?: 'order' | 'time';
  formatTick?: (order: number) => string;
  /** Optional display only: never used for sorting or placement. */
  formatTime?: (order: number) => string;
  markers?: readonly OrderedTrackMarker[];
  state?: {
    kind: OrderedTrackStatus;
    title: string;
    body?: ReactNode;
    retryLabel?: string;
    onRetry?: () => void;
  };
  trust?: { source: string; updated: string; coverage: string };
  selectedId?: string | null;
  onSelect?: (item: OrderedTrackItem | null) => void;
  onRangeRequest?: (
    orderFrom: number,
    orderTo: number,
    signal: AbortSignal,
  ) => Promise<readonly OrderedTrackItem[]>;
  /** Consumers can reflect asynchronous failures in their page-head trust indicator. */
  onLoadStateChange?: (state: OrderedTrackLoadState) => void;
};
