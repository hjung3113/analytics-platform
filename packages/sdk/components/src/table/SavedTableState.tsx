import { useSavedViewTableState } from '@ap/kernel/host';
import type { StoredColumnGroups } from '@ap/contracts';
import { columnGroupBasis, type ColumnGroups } from './columnGroups';
import { materializeColumnGroups } from './columnGroupEdits';

/** Mounted only for editable tables. The snapshot written to preferences contains only effective, known membership. */
export function SavedTableState({ preferenceKey, columns, declared, groups, apply }: {
  preferenceKey: string; columns: { id: string; columnGroup?: readonly string[] }[]; declared: ColumnGroups | undefined;
  groups: StoredColumnGroups | undefined; apply: (groups: StoredColumnGroups | undefined) => void;
}) {
  const basis = columnGroupBasis(columns, declared);
  const current = groups?.basis === basis ? materializeColumnGroups(columns, declared, groups) : undefined;
  useSavedViewTableState(preferenceKey, {
    value: current === undefined ? {} : { groups: current }, basis,
    apply(entry) {
      if (entry.groups && entry.groups.basis !== basis) return;
      const next = entry.groups === undefined ? undefined : materializeColumnGroups(columns, declared, entry.groups);
      if (JSON.stringify(current) !== JSON.stringify(next)) apply(next);
    },
  });
  return null;
}
