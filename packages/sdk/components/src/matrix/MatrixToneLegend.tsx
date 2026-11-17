import { cn } from '@ap/ui';
import { MATRIX_TONE_CLASS, type MatrixCellTone } from './tones';

export type MatrixToneLegendProps = { labels: Partial<Record<MatrixCellTone, string>>; 'aria-label'?: string };

/** Meaning belongs to the consumer; samples use exactly the cell tones. */
export function MatrixToneLegend({ labels, 'aria-label': label }: MatrixToneLegendProps) {
  return <ul aria-label={label} className="flex flex-wrap items-center gap-3 text-xs break-keep">
    {(Object.entries(labels) as [MatrixCellTone, string][]).map(([tone, text]) => <li key={tone} className="inline-flex items-center gap-1">
      <span aria-hidden className={cn('size-3 border border-border-subtle', MATRIX_TONE_CLASS[tone])} /><span>{text}</span>
    </li>)}
  </ul>;
}
