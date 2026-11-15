import { lazy, Suspense } from 'react';
import { useI18n, usePlatform, type PageProps } from '@ap/kernel';
import { PageKeyWarning, StateMessage, usePageKeyRules } from '@ap/components';
import { Tabs, TabsList, TabsTrigger } from '@ap/ui';
import { ListX } from 'lucide-react';
import { HW_TIME_MESSAGES } from './messages';
import { HW_TIME_VIEWS, isHwTimeView, viewSwitchPage, type HwTimeView } from './views';
import { useHwTimeFilter } from './shared/useHwTimeFilter';
import { HwTimeFilterContext } from './shared/HwTimeFilterContext';
import { FilterPanel } from './shared/panels/FilterPanel';
const PAGES = {
  overview: lazy(() => import('./pages/overview/OverviewPage')),
  steps: lazy(() => import('./pages/steps/StepsPage')),
  compare: lazy(() => import('./pages/compare/ComparePage')),
  table: lazy(() => import('./pages/table/TablePage')),
};
/** Also used by saved legacy panes, whose original page-key contract has no new filter keys. */
export function HwTimeViewContent({ view, ...props }: PageProps & { view: HwTimeView }) {
  const Page = PAGES[view];
  return <Suspense><Page {...props} /></Suspense>;
}
export function HwTimeViewBody({ view, ...props }: PageProps & { view: HwTimeView }) {
  const filter = useHwTimeFilter();
  const { lang } = useI18n();
  return <HwTimeFilterContext value={filter}>
    <div className="flex min-h-0 flex-1 gap-3">
      <aside className="w-64 shrink-0 overflow-auto"><FilterPanel filter={filter} /></aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {filter.invalid ? <PageKeyWarning sentences={filter.invalid} onRecover={filter.recover} />
          : filter.empty ? <StateMessage icon={<ListX className="size-4" aria-hidden />} title={HW_TIME_MESSAGES.filterNoneSelected[lang]} body={HW_TIME_MESSAGES.filterNoneSelectedBody[lang]} />
          : <HwTimeViewContent key={filter.moduleType.id} {...props} view={view} />}
      </div>
    </div>
  </HwTimeFilterContext>;
}
export default function HwTimePage(props: PageProps) {
  const { pageParam, setPage } = usePlatform();
  const { lang } = useI18n();
  const keys = usePageKeyRules([{ key: 'view', label: HW_TIME_MESSAGES.viewLabel, valid: isHwTimeView }]);
  const raw = pageParam('view');
  const view = raw !== null && isHwTimeView(raw) ? raw : 'overview';
  return <div className="flex h-full min-h-0 flex-col gap-3">
    <Tabs value={keys.invalid ? '' : view} onValueChange={next => { if (isHwTimeView(next)) setPage(viewSwitchPage(next, pageParam)); }}>
      <TabsList aria-label={HW_TIME_MESSAGES.viewLabel[lang]}>
        {HW_TIME_VIEWS.map(item => <TabsTrigger key={item.id} value={item.id}>{item.label[lang]}</TabsTrigger>)}
      </TabsList>
    </Tabs>
    {keys.invalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} /> : <HwTimeViewBody {...props} view={view} />}
  </div>;
}
