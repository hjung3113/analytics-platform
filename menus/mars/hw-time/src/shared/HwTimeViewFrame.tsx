import { createContext, useContext, useId, type ReactNode } from 'react';
import { useI18n, useMessages } from '@ap/kernel';
import { PageKeyWarning, StateMessage } from '@ap/components';
import { Button, Tabs, TabsList, TabsTrigger } from '@ap/ui';
import { ListFilter, ListX } from 'lucide-react';
import { HW_TIME_MOTION_COLOR_BY_ID, type HwTimeMotionColors } from '../endpoints';
import { HW_TIME_MESSAGES } from '../messages';
import { HW_TIME_VIEWS, isHwTimeView, type HwTimeView } from '../views';
import { useHwTimeFilterContext } from './HwTimeFilterContext';
import { FilterPanel } from './panels/FilterPanel';

/**
 * The HW Time shell's View switch and filter-panel fold; absent in a saved legacy board pane, which renders one View alone. The fold is
 * page-local (no URL key, no storage): open on 개요, whose first screen includes the panel, folded on 단계별·비교·표 so their layout samples
 * keep their width (the compare workspace stays in stack mode at 1440). Folded takes no width: the toggle sits at the end of the tabs row
 * with the unchecked count. S5 (#2341) replaces the column with the zero-width condition layer (advisor Q4).
 */
export const HwTimeViewContext = createContext<{ view: HwTimeView; onView: (view: HwTimeView) => void; panelOpen: boolean; setPanelOpen: (open: boolean) => void } | null>(null);
export const defaultPanelOpen = (view: HwTimeView) => view === 'overview';

/**
 * The shared HW Time frame inside each View's `PlatformPage`, so the page head and Context bar stay on top as on every menu: the View
 * tabs, then the shared filter panel beside the View body. A malformed filter key replaces the body with its warning (no query) and an
 * empty selection hides the mounted body behind `선택한 항목 없음` (#2336 §2.3). Without the shell (legacy pane) only the body renders.
 */
export function HwTimeViewFrame({ children, motionColors = HW_TIME_MOTION_COLOR_BY_ID }: { children: ReactNode; motionColors?: HwTimeMotionColors }) {
  const shell = useContext(HwTimeViewContext);
  const filter = useHwTimeFilterContext();
  const { lang } = useI18n();
  const m = useMessages(HW_TIME_MESSAGES);
  const panelId = useId();
  if (!shell || !filter) return children;
  const off = filter.moduleType.modules.length - filter.modules.length + filter.moduleType.motions.length - filter.motions.length;
  // Never leave `선택한 항목 없음` or a filter warning with the panel hidden.
  const open = shell.panelOpen || filter.empty || filter.invalid !== null;
  return <div className="flex h-full min-h-0 flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      {/* The toggle sits first, above the panel it folds: at the far right it read as "the panel cannot be folded" (owner review). */}
      <Button type="button" variant="ghost" size="sm" className={open ? 'w-64 shrink-0 justify-start' : undefined} aria-expanded={open} aria-controls={panelId} disabled={open && !shell.panelOpen}
        onClick={() => shell.setPanelOpen(!open)}>
        <ListFilter className="size-4" aria-hidden />{m(open ? 'filterPanelClose' : 'filterPanelOpen')}
        {!open && off > 0 && <span className="text-text-secondary">· {m('filterOffCount', { count: String(off) })}</span>}
      </Button>
      <Tabs value={shell.view} onValueChange={next => { if (isHwTimeView(next)) shell.onView(next); }}>
        <TabsList aria-label={HW_TIME_MESSAGES.viewLabel[lang]}>
          {HW_TIME_VIEWS.map(item => <TabsTrigger key={item.id} value={item.id}>{item.label[lang]}</TabsTrigger>)}
        </TabsList>
      </Tabs>
    </div>
    <div className="flex min-h-0 flex-1 gap-3">
      {open && <div id={panelId} className="w-64 shrink-0 overflow-auto"><FilterPanel filter={filter} motionColors={motionColors} /></div>}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {filter.invalid ? <PageKeyWarning sentences={filter.invalid} onRecover={filter.recover} />
          : <>
            {filter.empty && <StateMessage icon={<ListX className="size-4" aria-hidden />} title={HW_TIME_MESSAGES.filterNoneSelected[lang]} body={HW_TIME_MESSAGES.filterNoneSelectedBody[lang]} />}
            <div hidden={filter.empty} className={filter.empty ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>{children}</div>
          </>}
      </div>
    </div>
  </div>;
}
