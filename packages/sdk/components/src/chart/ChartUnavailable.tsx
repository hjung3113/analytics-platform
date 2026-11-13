import { ChartNoAxesColumn } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { cn } from '@ap/ui';
import { StateMessage } from '../StateView';

/**
 * The plot area of a chart whose engine cannot start (no canvas 2d context, no ResizeObserver, engine `init` throws): jsdom, a start
 * kit's render checks. The frame around it keeps rendering. Same box as the plot (height · width: 100%) so the layout does not shift.
 */
export function ChartUnavailable({ height, className }: { height?: number; className?: string }) {
  const { t } = useI18n();
  // eslint-disable-next-line shadcn/no-inline-styles -- chart height comes from the height prop at runtime
  return <div className={cn(className, 'w-full')} style={height === undefined ? undefined : { height }}>
    <StateMessage tone="neutral" icon={<ChartNoAxesColumn className="size-4" aria-hidden />} title={t('chartUnavailable')} />
  </div>;
}

let reported = false;
/** One `console.error` per page load in dev, so a real engine failure in a browser is not swallowed silently. */
export function reportChartUnavailable(cause: unknown): void {
  if (reported || process.env.NODE_ENV === 'production') return;
  reported = true;
  console.error('Chart engine unavailable; rendering the unavailable state.', cause);
}
