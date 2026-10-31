import type { ReactNode } from 'react';

/** A detail screen split into the parts a host places in its own drawer or page chrome. */
export type DetailParts = {
  title: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  body: ReactNode;
};

/** Detail parts of a screen that asks before it closes (a dirty draft): `requestClose` is what a host's close control calls. */
export type ClosableDetailParts = DetailParts & { requestClose(): void };

/**
 * What the drawer path adds when it builds parts (#1168 C-1). `titleInHeader`: the host's frame
 * already shows `title` in its own header, so the body omits its visible title and keeps the
 * badges/meta rows around it. Full-page frames whose header does not show the title leave it unset.
 */
export type DetailPartsOptions = { titleInHeader?: boolean };
