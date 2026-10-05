import { createContext, useContext } from 'react';
import { ChevronUp } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { Button, cn } from '@ap/ui';

export const AnalysisSectionContext = createContext<{ title: string; kind: 'kpi' | 'chart' | 'breakdown'; collapse: () => void } | null>(null);

/** Only AnalysisLayout consumers receive a collapse action. */
export function AnalysisCollapseButton({ className }: { className?: string }) {
  const section = useContext(AnalysisSectionContext);
  const { t } = useI18n();
  if (!section) return null;
  const label = t('collapseSection', { title: section.title });
  return <Button type="button" variant="ghost" size="sm" className={cn('size-7 shrink-0 p-0', className)}
    data-analysis-collapse aria-expanded="true" aria-label={label} title={label} onClick={section.collapse}>
    <ChevronUp className="size-3.5" aria-hidden />
  </Button>;
}
