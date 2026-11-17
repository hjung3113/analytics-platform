import { useSavedViewTableState } from '@ap/kernel/host';
import { useMemo } from 'react';
import type { StoredColumnGroups, TableViewState } from '@ap/contracts';
import { columnGroupBasis, type ColumnGroups } from './columnGroups';
import { materializeColumnGroups } from './columnGroupEdits';

/** Mounted only for editable tables. The snapshot written to preferences contains only effective, known membership. */
export function SavedTableState({ preferenceKey, columns, declared, groups, apply, ready }: {
  preferenceKey: string; columns: { id: string; columnGroup?: readonly string[] }[]; declared: ColumnGroups | undefined;
  groups: StoredColumnGroups | undefined; apply: (groups: StoredColumnGroups | undefined) => void; ready: boolean;
}) {
  const basis = useMemo(() => columnGroupBasis(columns, declared), [columns, declared]);
  const current = useMemo(() => groups?.basis === basis ? materializeColumnGroups(columns, declared, groups) : undefined, [columns, declared, groups, basis]);
  const value = useMemo(() => current === undefined ? {} : { groups: current }, [current]);
  const project = (entry: TableViewState): TableViewState => entry.groups === undefined ? {} : { groups: materializeColumnGroups(columns, declared, entry.groups) };
  useSavedViewTableState(preferenceKey, {
    value, basis, ready, project,
    apply(entry) {
      if (entry.groups && entry.groups.basis !== basis) return;
      const next = project(entry).groups;
      if (JSON.stringify(current) !== JSON.stringify(next)) apply(next);
    },
  });
  return null;
}
