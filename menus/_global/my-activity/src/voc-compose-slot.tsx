import { lazy, Suspense } from 'react';
import { useI18n, type VocComposeProps, type VocComposeSlot } from '@ap/kernel';
import { LoadingBlock } from '@ap/components';

// The page (and with it the FeedbackOps compose screen) loads on the first open, so none of it is in the main chunk.
const VocCompose = lazy(() => import('./pages/VocCompose'));

function Loading() {
  const { lang } = useI18n();
  return <div role="status" aria-label={lang === 'ko' ? 'VOC 등록 불러오는 중' : 'Loading VOC form'} className="p-4"><LoadingBlock rows={5} height={240} /></div>;
}

/**
 * The rail `VOC 등록` drawer body (ADR-0070 decisions 4–5, #656). `managedSystemFor` maps the frozen screen's space to its Managed System id
 * (the app's table); the form uses it only when the FeedbackOps list holds it. The shell renders `Compose` outside the main column's
 * Suspense boundary, so it owns its fallback: a bare lazy component would suspend the whole shell on the first open.
 * Only `apps/platform-web/src/main.tsx` imports this.
 */
export function vocComposeSlot(managedSystemFor: (spaceId: string | null) => string | null): VocComposeSlot {
  function Compose(props: VocComposeProps) {
    return <Suspense fallback={<Loading />}><VocCompose {...props} managedSystemFor={managedSystemFor} /></Suspense>;
  }
  return { Compose };
}
