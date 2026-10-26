import { createContext, useContext, type ContextType } from 'react';
import { ChevronUp } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { Button, cn } from '@ap/ui';

export const AnalysisSectionContext = createContext<{ title: string; kind: 'kpi' | 'chart' | 'breakdown'; span?: 'full'; density?: 'regular' | 'compact'; collapse: () => void } | null>(null);

/** Only AnalysisLayout consumers receive a collapse action. */
export function AnalysisCollapseButton({ className }: { className?: string }) {
  const section = useContext(AnalysisSectionContext);
  const { t } = useI18n();
  if (!section) return null;
  const label = t('collapseSection', { title: section.title });
  return <Button type="button" variant="ghost" size="icon-xs" className={cn('shrink-0', className)}
    data-analysis-collapse aria-expanded="true" aria-label={label} title={label} onClick={section.collapse}>
    <ChevronUp className="size-3.5" aria-hidden />
  </Button>;
}


/** Explicit size wins; only chart sections contribute inherited size. */
export function resolveAnalysisChartSize(size: ChartSize | undefined, section: ContextType<typeof AnalysisSectionContext>) {
  return size ?? (section?.kind === 'chart' ? section.span === 'full' ? 'hero' : section.density === 'compact' ? 'compact' : 'regular' : 'regular');
}

/** `fill`: the plot takes the height its container leaves (`max(320, available)`; 320 until measured). */
export type ChartSize = 'regular' | 'compact' | 'hero' | 'fill';

/** The least plot height of the `fill` size, px. */
export const FILL_CHART_MIN_HEIGHT = 320;

/** `fill` plot height for a measured container height (null = not measured yet). */
export const fillChartHeight = (available: number | null) => Math.max(FILL_CHART_MIN_HEIGHT, available ?? 0);

/**
 * Layout of a `fill` card. The card is at least as tall as its container, and the plot box takes what the chrome leaves but never under
 * 320 px (`min-h-80`): below that the card grows and the container's own body scrolls, instead of a 320 px canvas scrolling inside a tiny window.
 * `basis-0` (a definite zero, not `flex-1`'s percentage) keeps the plot box from sizing the card, so a smaller container still shrinks it.
 */
export const FILL_CARD_CLASS = 'min-h-full';
/** FILL_PLOT_CLASS without its floor: the Frame sets `minHeight` itself when `fillMin` lowers it. */
export const FILL_PLOT_BASE_CLASS = 'grow basis-0 overflow-hidden';
export const FILL_PLOT_CLASS = `min-h-80 ${FILL_PLOT_BASE_CLASS}`; // min-h-80 = FILL_CHART_MIN_HEIGHT (320px)

/** Keep each frame’s established regular default while sharing compact/hero heights. */
export function analysisChartHeight(size: ChartSize, regularHeight: number) {
  return size === 'hero' ? 360 : size === 'compact' ? 200 : size === 'fill' ? FILL_CHART_MIN_HEIGHT : regularHeight;
}
