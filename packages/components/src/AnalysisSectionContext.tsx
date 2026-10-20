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

export type ChartSize = 'regular' | 'compact' | 'hero';

/** Keep each frame’s established regular default while sharing compact/hero heights. */
export function analysisChartHeight(size: ChartSize, regularHeight: number) {
  return size === 'hero' ? 360 : size === 'compact' ? 200 : regularHeight;
}
