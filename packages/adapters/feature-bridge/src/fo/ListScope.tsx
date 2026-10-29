import { lazy, Suspense } from 'react';

// The picker and its reads load with the page that draws it, so none of it is in the main chunk.
const Picker = lazy(() => import('../pages/ListScope'));

/**
 * The page-owned `목록 범위` for a page inside `FeatureBridge`: the existing Managed System picker over the same `managedSystem` page key the sidebar picker uses (`useListScope`),
 * with the effective value and `전체` to clear it. It owns no state, session or query client of its own.
 */
export function ListScope() {
  return <Suspense fallback={null}><Picker /></Suspense>;
}
