import { useCallback } from 'react';
import type { GlobalContext, Pair } from '@ap/contracts';
import type { PageProps } from '@ap/kernel';
import { useI18n } from '@ap/kernel';
import { PlatformPage } from '@ap/components';
import { useHwTimeFilter } from './shared/useHwTimeFilter';
import { HwTimeFilterContext } from './shared/HwTimeFilterContext';
import { hwTimeHistorySummary } from './shared/historySummary';
import { AnalysisWorkspace } from './pages/analysis/AnalysisWorkspace';

export default function HwTimePage(_props: PageProps) {
  const filter = useHwTimeFilter();
  const { lang } = useI18n();
  // Only query-history rows describe page values (#2691); the current summaries stay as they are.
  const historyPageSummary = useCallback((_global: GlobalContext, page: readonly Pair[]) => hwTimeHistorySummary(page, lang), [lang]);
  return <PlatformPage layout="fill" queryBarExtension={{ pageSummary: [], issues: [], historyPageSummary }}><HwTimeFilterContext value={filter}>
    <AnalysisWorkspace filter={filter} />
  </HwTimeFilterContext></PlatformPage>;
}
