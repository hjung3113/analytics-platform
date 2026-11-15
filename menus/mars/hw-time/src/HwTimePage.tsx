import { lazy, Suspense, useState } from 'react';
import { usePlatform, type PageProps } from '@ap/kernel';
import { PageKeyWarning, PlatformPage, usePageKeyRules } from '@ap/components';
import { HW_TIME_MESSAGES } from './messages';
import { isHwTimeView, viewSwitchPage, type HwTimeView } from './views';
import { useHwTimeFilter } from './shared/useHwTimeFilter';
import { HwTimeFilterContext } from './shared/HwTimeFilterContext';
import { defaultPanelOpen, HwTimeViewContext } from './shared/HwTimeViewFrame';
const PAGES = {
  overview: lazy(() => import('./pages/overview/OverviewPage')),
  steps: lazy(() => import('./pages/steps/StepsPage')),
  compare: lazy(() => import('./pages/compare/ComparePage')),
  table: lazy(() => import('./pages/table/TablePage')),
};
/** Also used by saved legacy panes, whose original page-key contract has no new filter keys: no shell context, so no tabs or panel. */
export function HwTimeViewContent({ view, ...props }: PageProps & { view: HwTimeView }) {
  const Page = PAGES[view];
  return <Suspense><Page {...props} /></Suspense>;
}
/** One View with the shared filter and View switch; each View page draws them inside its own `PlatformPage` (`HwTimeViewFrame`). */
export function HwTimeViewBody({ view, ...props }: PageProps & { view: HwTimeView }) {
  const { pageParam, setPage } = usePlatform();
  const filter = useHwTimeFilter();
  // Per View within the visit; a View the user never folded or opened uses its default.
  const [panel, setPanel] = useState<Partial<Record<HwTimeView, boolean>>>({});
  const panelOpen = panel[view] ?? defaultPanelOpen(view);
  return <HwTimeFilterContext value={filter}>
    <HwTimeViewContext value={{ view, onView: next => setPage(viewSwitchPage(next, pageParam)), panelOpen, setPanelOpen: open => setPanel(current => ({ ...current, [view]: open })) }}>
      <HwTimeViewContent key={filter.moduleType.id} {...props} view={view} />
    </HwTimeViewContext>
  </HwTimeFilterContext>;
}
export default function HwTimePage(props: PageProps) {
  const { pageParam } = usePlatform();
  const keys = usePageKeyRules([{ key: 'view', label: HW_TIME_MESSAGES.viewLabel, valid: isHwTimeView }]);
  const raw = pageParam('view');
  if (keys.invalid) return <PlatformPage><PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} /></PlatformPage>;
  return <HwTimeViewBody {...props} view={raw !== null && isHwTimeView(raw) ? raw : 'overview'} />;
}
