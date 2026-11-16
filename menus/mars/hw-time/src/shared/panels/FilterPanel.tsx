import { LegendTree } from '@ap/components';
import { useMessages } from '@ap/kernel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';
import { HW_TIME_MODULE_TYPES, type HwTimeMotionColors } from '../../endpoints';
import { HW_TIME_MESSAGES, HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import type { HwTimeFilter } from '../useHwTimeFilter';

/**
 * Display-only filters in the linked workspace filter panel. Equipment remains in the platform Context
 * Condition → candidates → Selection controls. State and URL keys live in `useHwTimeFilter`, so S5 (#2341) moves this UI to the page
 * condition layer without changing them. Each action is one `setChecked` write, so a group check of LegendTree stays one history entry.
 */
export function FilterPanel({ filter, motionColors }: { filter: HwTimeFilter; motionColors: HwTimeMotionColors }) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const shared = useMessages(HW_TIME_MESSAGES);
  return <aside aria-label={m('filters')} className="flex flex-col gap-4 rounded-md border border-border-subtle bg-surface-card p-3" data-testid="hw-time-filter-panel">
    <div className="flex flex-col gap-1">
      <span id="hw-filter-recipe-label" className="t-card-title">{m('recipe')}</span>
      <Select disabled value="none"><SelectTrigger aria-labelledby="hw-filter-recipe-label" aria-describedby="hw-filter-recipe-reason"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="none">{m('unsplit')}</SelectItem></SelectContent>
      </Select>
      <p id="hw-filter-recipe-reason" className="t-caption text-text-secondary"><strong>{m('unavailable')}</strong><br />{m('recipeReason')}</p>
    </div>
    <div className="flex flex-col gap-2">
      <span id="hw-filter-type-label" className="t-card-title">{m('moduleType')}</span>
      <Select value={filter.moduleType.id} onValueChange={filter.setModuleType}>
        <SelectTrigger aria-labelledby="hw-filter-type-label"><SelectValue /></SelectTrigger>
        <SelectContent>{HW_TIME_MODULE_TYPES.map(type => <SelectItem key={type.id} value={type.id}>{type.id}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="min-w-0"><h3 className="t-card-title mb-2">{m('modules')}</h3>
        <LegendTree label={m('modules')} nodes={filter.moduleType.modules.map(id => ({ id, label: id }))}
          visible={new Set(filter.modules)} onVisibleChange={next => filter.setChecked('module', [...next])} />
      </div>
      <div className="min-w-0"><h3 className="t-card-title mb-2">{m('motions')}</h3>
        <LegendTree label={m('motions')} nodes={filter.moduleType.motions.map(id => ({ id, label: id, color: motionColors[id] }))}
          visible={new Set(filter.motions)} onVisibleChange={next => filter.setChecked('motion', [...next])} />
      </div>
    </div>
    {filter.unusable.length > 0 && <p className="t-caption text-text-secondary" data-testid="hw-time-filter-unusable">{shared('filterUnusable')}: {filter.unusable.join(', ')}</p>}
  </aside>;
}
