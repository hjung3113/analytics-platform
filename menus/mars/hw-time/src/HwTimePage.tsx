import type { PageProps } from '@ap/kernel';
import { PlatformPage } from '@ap/components';
import { useHwTimeFilter } from './shared/useHwTimeFilter';
import { HwTimeFilterContext } from './shared/HwTimeFilterContext';
import { AnalysisWorkspace } from './pages/analysis/AnalysisWorkspace';

export default function HwTimePage(_props: PageProps) {
  const filter = useHwTimeFilter();
  return <PlatformPage layout="fill"><HwTimeFilterContext value={filter}>
    <AnalysisWorkspace filter={filter} />
  </HwTimeFilterContext></PlatformPage>;
}
