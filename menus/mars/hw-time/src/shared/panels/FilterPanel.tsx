import { Checkbox } from '@ap/ui';
import type { HwTimeFilter } from '../useHwTimeFilter';

/**
 * The HW Time filter panel shared by all four Views (#2328). Placeholder plain check lists: #2329 replaces this file with the designed panel
 * (Recipe/PPID row, Module type, Module and Motion lists side by side). Every View mounts it with the same `filter`.
 */
export function FilterPanel({ filter }: { filter: HwTimeFilter }) {
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="hw-time-filter-panel">
      <div className="flex flex-col gap-1">
        {filter.moduleType.modules.map(id => (
          <label key={id} className="flex items-center gap-2">
            <Checkbox checked={filter.modules.includes(id)} onCheckedChange={() => filter.toggleModule(id)} />
            {id}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {filter.moduleType.motions.map(motion => (
          <label key={motion} className="flex items-center gap-2">
            <Checkbox checked={filter.motions.includes(motion)} onCheckedChange={() => filter.toggleMotion(motion)} />
            {motion}
          </label>
        ))}
      </div>
    </div>
  );
}
