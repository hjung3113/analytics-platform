import { Suspense, lazy } from 'react';
import type { ModelTopViewProps } from './model-topview-body';

/**
 * The model profile's read-only Top View (#1656). The app wires this into menu-log-knowledge's slot (ADR-0128), the two never import each
 * other. Thin on purpose: `main.tsx` imports it at start-up, so the renderer is a lazy chunk that loads when the section shows a drawing.
 */
export type { ModelTopViewProps };

const Body = lazy(() => import('./model-topview-body'));

export function ModelTopView(props: ModelTopViewProps) {
  return <Suspense fallback={<p role="status" className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-4 text-sm text-text-secondary">불러오는 중</p>}><Body {...props} /></Suspense>;
}
