import { StatusBadge, type Tone } from '@ap/ui';
import type { ItemOwner } from '../../endpoints';
import { AXIS_LABEL, ownerKindText, ownerText, stateLabel, typeLabel, type Axis } from './itemModel';

const TONE: Record<Axis, Record<string, Tone>> = {
  verification: { not_checked: 'neutral', observed: 'info', verified: 'success', disputed: 'warning' },
  processing: { open: 'info', under_investigation: 'warning', resolved: 'success' },
  publication: { published: 'info', archived: 'neutral' },
};

/** One state axis as a badge that names the axis in text, so the meaning never rests on colour alone (design §7.2: 발행 ≠ 검증). */
export function StateBadge({ axis, value }: { axis: Axis; value: string }) {
  return <StatusBadge tone={TONE[axis][value] ?? 'neutral'}><span className="font-normal opacity-80">{AXIS_LABEL[axis]}</span>&nbsp;{stateLabel(axis, value)}</StatusBadge>;
}

/** The three axes side by side, each its own badge (never one merged status). */
export function StateBadges({ item, axes = ['publication', 'verification', 'processing'] }: {
  item: { publicationState: string; verificationState: string; processingState: string }; axes?: readonly Axis[];
}) {
  const value = { publication: item.publicationState, verification: item.verificationState, processing: item.processingState };
  return <span className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">{axes.map(axis => <StateBadge key={axis} axis={axis} value={value[axis]} />)}</span>;
}

export function TypeBadge({ code }: { code: string }) {
  return <span className="inline-flex h-5 items-center whitespace-nowrap rounded-sm border border-border-default px-1.5 text-xs text-text-secondary">{typeLabel(code)}</span>;
}

/** Owner of an item: a kind chip (모델 / SW) and the model name, or model name / SW version. */
export function OwnerChip({ owner }: { owner: ItemOwner }) {
  return <span className="inline-flex h-5 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-sm bg-surface-sunken px-1.5 text-xs text-text-secondary">
    <span className="shrink-0 text-text-muted">{ownerKindText(owner)}</span>
    <span className="t-mono truncate text-text-primary" title={ownerText(owner)}>{ownerText(owner)}</span>
  </span>;
}
