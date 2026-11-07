import { PlatformDataTable, type PlatformDataTableProps } from '@ap/components';

/** #1473 adoption seam: add the opt-in `fill` prop HERE once its SDK release is available. No height overrides. */
export function SnapshotTable<T>(props: PlatformDataTableProps<T>) { return <PlatformDataTable<T> {...props} />; }
