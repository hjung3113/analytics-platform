import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface FieldListProps {
  children: React.ReactNode;
  className?: string;
}

export const FieldListContext = React.createContext(false);

/** `dl` that makes the `FieldRow`s inside it render `dt`/`dd`, so screen readers get the label–value pairs. */
export function FieldList({ children, className }: FieldListProps) {
  return (
    <FieldListContext.Provider value>
      <dl className={cn(className)}>{children}</dl>
    </FieldListContext.Provider>
  );
}
