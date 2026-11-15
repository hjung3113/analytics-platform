import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface FieldListProps {
  children: React.ReactNode;
  className?: string;
  /** `inline`: one wrapping line of label–value pairs (object meta under a title); the rows inside take the inline layout. Default: the rows' own layout. */
  layout?: 'inline';
}

export const FieldListContext = React.createContext<{ inList: boolean; layout?: 'inline' | undefined }>({ inList: false });

/** `dl` that makes the `FieldRow`s inside it render `dt`/`dd`, so screen readers get the label–value pairs. */
export function FieldList({ children, className, layout }: FieldListProps) {
  const value = React.useMemo(() => ({ inList: true, layout }), [layout]);
  return (
    <FieldListContext.Provider value={value}>
      <dl className={layout === 'inline' ? cn('m-0 flex flex-wrap items-baseline gap-x-4 gap-y-1', className) : className}>{children}</dl>
    </FieldListContext.Provider>
  );
}
