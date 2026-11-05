import { lazy, Suspense } from 'react';
import { useI18n, type VocComposeProps, type VocComposeSlot } from '@ap/kernel';
import { Skeleton } from '@ap/ui';
import { VOC_CREATE_TARGETS_QUERY_KEY } from '@ap/feature-screens/global-screens/core';
import { featureQueryClient } from './feature/session';
import type { DefaultStatus } from './default-status';
import { featureApi } from './feature-api';

/** How long a cached create-targets answer counts as current; equals the compose screen's `staleTime` for the same query. */
const TARGETS_FRESH_MS = 15 * 1000;

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
 * `availability` (the error view's 「이 오류 신고」 gate, #606): `off` without a feature API (mock preview: the form would show `실서버 필요`), otherwise `available`. The client cannot know
 * before submit whether the actor may create a VOC (the server answers per Managed System) or whether the screen's Managed System takes one, so `denied` is returned only when the drawer already cached `GET /vocs/create-targets` and it closes the screen's system (#1358); before that it is `available` and the drawer shows the reason.
 * Only `apps/platform-web/src/main.tsx` imports this.
 */
export function vocComposeSlot(managedSystemFor: (spaceId: string | null) => string | null, useDefaultStatus: () => DefaultStatus = useAlwaysReady): VocComposeSlot {
  function Compose(props: VocComposeProps) {
    const defaultStatus = useDefaultStatus();
    return <Suspense fallback={<Loading />}><VocCompose {...props} managedSystemFor={managedSystemFor} defaultStatus={defaultStatus} /></Suspense>;
  }
  return { Compose, availability: target => {
    if (featureApi() === null) return 'off';
    const systemId = managedSystemFor(target.spaceId);
    if (systemId === null) return 'available';
    // The create-targets the drawer loaded (#1358); not cached yet = unknown = available, and the drawer then shows the reason.
    // A denied answer that was invalidated or has aged past the drawer's own freshness window is not trusted: it must not keep the report button shut.
    const state = featureQueryClient.getQueryState<readonly { managed_system_id: string; allowed: boolean }[]>(VOC_CREATE_TARGETS_QUERY_KEY);
    if (state === undefined || state.isInvalidated || Date.now() - state.dataUpdatedAt > TARGETS_FRESH_MS) return 'available';
    return state.data?.some(entry => entry.managed_system_id === systemId && !entry.allowed) ? 'denied' : 'available';
  } };
}
