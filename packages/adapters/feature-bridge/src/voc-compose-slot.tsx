import { lazy, Suspense } from 'react';
import { useI18n, type VocComposeProps, type VocComposeSlot } from '@ap/kernel';
import { Skeleton } from '@ap/ui';
import type { DefaultStatus } from './default-status';

const useAlwaysReady = (): DefaultStatus => 'ready';

// The page (and with it the feature compose screen) loads on the first open, so none of it is in the main chunk.
const VocCompose = lazy(() => import('./pages/VocCompose'));

function Loading() {
  const { lang } = useI18n();
  // One live region: `LoadingBlock` has its own `role="status"`, so the fallback draws the skeleton rows itself.
  return <div role="status" aria-busy aria-label={lang === 'ko' ? 'VOC 등록 불러오는 중' : 'Loading VOC form'} className="min-h-60 space-y-2 p-4">
    <Skeleton className="h-5 w-11/12" />
    <Skeleton className="h-5 w-5/6" />
    <Skeleton className="h-5 w-3/4" />
    <Skeleton className="h-5 w-2/3" />
    <Skeleton className="h-5 w-7/12" />
  </div>;
}

/**
 * The rail `VOC 등록` drawer body (ADR-0070 decisions 4–5, #656). `managedSystemFor` maps the frozen screen's space to its Managed System id
 * (the app's table); the form uses it only when the feature list holds it. The shell renders `Compose` outside the main column's
 * Suspense boundary, so it owns its fallback: a bare lazy component would suspend the whole shell on the first open.
 * `useDefaultStatus` (optional, a module-level hook so the slot keeps one stable `Compose`) reports whether the app's lookup behind `managedSystemFor` is
 * `ready`, still `pending` or `failed`; the form blocks its submit until `ready` so a VOC is never filed against a silently missing default (#1289 node j). Absent = always ready.
 * Only `apps/platform-web/src/main.tsx` imports this.
 */
export function vocComposeSlot(managedSystemFor: (spaceId: string | null) => string | null, useDefaultStatus: () => DefaultStatus = useAlwaysReady): VocComposeSlot {
  function Compose(props: VocComposeProps) {
    const defaultStatus = useDefaultStatus();
    return <Suspense fallback={<Loading />}><VocCompose {...props} managedSystemFor={managedSystemFor} defaultStatus={defaultStatus} /></Suspense>;
  }
  return { Compose };
}
