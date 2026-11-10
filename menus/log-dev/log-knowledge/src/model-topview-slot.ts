import type { ReactNode } from 'react';

/**
 * The model profile's Top View drawing (#1656). The app injects it at startup (`apps/platform-web/src/main.tsx`), the same way it fills the
 * Round source tab (ADR-0128): this menu and the EV package never import each other. The props are structural, so the injected component
 * needs no type from this package. It draws the published Layout Revision read-only and checks the Revision hash itself. Unset (a host
 * without EV) → the section shows the pointer and says the drawing is unavailable here.
 */
export type ModelTopViewProps = { layoutId: string; revision: string; document: unknown };
export type ModelTopViewComponent = (props: ModelTopViewProps) => ReactNode;

let injected: ModelTopViewComponent | null = null;
export function setModelTopView(view: ModelTopViewComponent | null): void { injected = view; }
export function modelTopView(): ModelTopViewComponent | null { return injected; }
