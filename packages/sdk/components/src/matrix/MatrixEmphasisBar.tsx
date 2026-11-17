import type { MatrixEmphasisRule } from '@ap/contracts';
import { useMessages } from '@ap/kernel';
import { Button } from '@ap/ui';
import { X } from 'lucide-react';
import { MATRIX_MESSAGES } from './messages';

export type MatrixEmphasisBarProps = {
  emphasis: readonly MatrixEmphasisRule[];
  onEmphasisChange: (rules: MatrixEmphasisRule[]) => void;
  onlyMatchingColumns: boolean;
  onOnlyMatchingColumnsChange: (only: boolean) => void;
  rowLabel: (row: string) => string;
  label?: (count: number) => string;
  onlyMatchingLabel?: string;
};

/** A transient chip line. No URL, preference or saved-view state is owned here. */
export function MatrixEmphasisBar({ emphasis, onEmphasisChange, onlyMatchingColumns, onOnlyMatchingColumnsChange, rowLabel, label, onlyMatchingLabel }: MatrixEmphasisBarProps) {
  const m = useMessages(MATRIX_MESSAGES);
  if (emphasis.length === 0) return null;
  return <div role="group" aria-label={m('emphasis')} className="flex flex-wrap items-center gap-2 text-xs break-keep">
    <span>{label?.(emphasis.length) ?? m('emphasisCount', { count: emphasis.length })}</span>
    {emphasis.map((rule, index) => <span key={`${rule.row}-${index}`} className="inline-flex h-6 items-center rounded-md border border-border-subtle pl-2">
      <span>{rowLabel(rule.row)}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={m('remove', { name: rowLabel(rule.row) })} onClick={() => onEmphasisChange(emphasis.filter((_, at) => at !== index))}><X className="size-3" aria-hidden /></Button>
    </span>)}
    <Button type="button" variant="ghost" size="toolbar" onClick={() => onEmphasisChange([])}>{m('clearAll')}</Button>
    <Button type="button" variant="secondary" size="toolbar" aria-pressed={onlyMatchingColumns} onClick={() => onOnlyMatchingColumnsChange(!onlyMatchingColumns)}>{onlyMatchingLabel ?? m('onlyMatching')}</Button>
  </div>;
}
