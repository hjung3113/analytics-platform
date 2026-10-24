import type { ReactNode } from 'react';

/** A detail screen split into the parts a host places in its own drawer or page chrome. */
export type DetailParts = {
  title: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  body: ReactNode;
};
