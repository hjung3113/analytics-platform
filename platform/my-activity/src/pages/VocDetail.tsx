import { useMessages, usePlatform, type PageProps } from '@ap/kernel';
import { MY_ACTIVITY_MESSAGES } from '../messages';
import { SearchX } from 'lucide-react';
import { PlatformPage, ReturnLink, StateMessage } from '@ap/components';
import { VocReadingPane } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '@ap/feature-bridge';
import { VOC_ID } from '../feature/voc-query';

/**
 * VOC 상세 (ADR-0070, ADR-0071, ADR-0110): one VOC, full page — the reporter detail for the actor's own VOC, the public projection for any other (`VocReadingPane`). The VOC ID is a path segment, so a malformed one is
 * not-found here and never becomes a feature request path. The way back is only ever the Kernel's `returnOrigin()` (`ReturnLink`).
 */
export default function VocDetail({ params }: PageProps) {
  const m = useMessages(MY_ACTIVITY_MESSAGES);
  const { pageParam } = usePlatform();
  const vocId = params.vocId ?? '';
  if (!VOC_ID.test(vocId)) {
    return <PlatformPage>
      <StateMessage icon={<SearchX className="size-4" aria-hidden />}
        title={m('vocDetailVOCNotFound')}
        body={m('vocDetailTheVOCIDInTheAddressIs')} />
    </PlatformPage>;
  }
  return <PlatformPage secondaryActions={pageParam('returnTo') !== null ? <ReturnLink /> : undefined}>
    <FeatureBridge><VocReadingPane vocId={vocId} /></FeatureBridge>
  </PlatformPage>;
}
