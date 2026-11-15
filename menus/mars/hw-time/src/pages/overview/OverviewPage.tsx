import { PlatformPage } from '@ap/components';
import type { PageProps } from '@ap/kernel';
import { useHwTimeFilterContext } from '../../shared/HwTimeFilterContext';
import { useHwTimeFilter } from '../../shared/useHwTimeFilter';
import { OverviewView } from './OverviewView';

/**
 * The 개요 View (#2329). In the HW Time shell it reads the shared filter the frame's panel edits. A saved legacy board pane mounts the
 * View without the shell, so it reads the same keys itself (absent keys = every Module and Motion) and shows no panel.
 */
export default function OverviewPage(_props: PageProps) {
  const shared = useHwTimeFilterContext();
  return <PlatformPage>
    {shared ? <OverviewView filter={shared} /> : <PaneOverview />}
  </PlatformPage>;
}
function PaneOverview() {
  return <OverviewView filter={useHwTimeFilter()} />;
}
