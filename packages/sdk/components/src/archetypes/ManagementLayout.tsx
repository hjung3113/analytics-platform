import type { ReactNode } from 'react';

export type ManagementLayoutProps = {
  /**
   * The table node, usually a `PlatformDataTable` (or the page's warning in its place). The quick search field goes on the table's own
   * `search` prop and filters are its column filters (ADR-0105); there is no filter rail.
   */
  table: ReactNode;
  /** Detail content continues to use the shell's detail slot (ADR-0013). */
  drawer?: ReactNode;
};

/** Management slots (06 §12.6): the table with its toolbar search and filter line, and a detail drawer. No filter rail (node 1217f, ADR-0105). */
export function ManagementLayout({ table, drawer }: ManagementLayoutProps) {
  return <div className="min-w-0">
    {table}
    {drawer}
  </div>;
}
