import type { ReactNode } from 'react';

export type ManagementLayoutProps = {
  /**
   * The page's quick search field (06 §12.3, node 1217c), e.g. `<Input inputSize="toolbar" …/>`. It is handed to `table` as its argument and goes
   * to `PlatformDataTable`'s `search` slot, i.e. into the table toolbar. Filters are the table's column filters (ADR-0105); there is no filter rail.
   */
  search?: ReactNode;
  /** The table consumes the quick search field in its `search` slot. */
  table: (search?: ReactNode) => ReactNode;
  /** Detail content continues to use the shell's detail slot (ADR-0013). */
  drawer?: ReactNode;
};

/** Management slots (06 §12.6): toolbar search, the table with its filter line, and a detail drawer. No filter rail (node 1217f, ADR-0105). */
export function ManagementLayout({ search, table, drawer }: ManagementLayoutProps) {
  return <div className="min-w-0">
    <div className="min-w-0">{search === undefined ? table() : table(search)}</div>
    {drawer}
  </div>;
}
