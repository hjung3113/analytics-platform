import { SearchX } from 'lucide-react';
import { useI18n, usePlatform, type PageProps } from '@ap/kernel';
import { PlatformPage, ReturnLink, StateMessage } from '@ap/components';
import { ReporterVocDetail } from '@fops/frontend/global-screens';
import { FoBridge } from '@ap/fo-bridge';
import { VOC_ID } from '../fo/voc-query';

/**
 * 내 VOC 상세 (ADR-0070, ADR-0071): one VOC as its reporter sees it, full page. The VOC ID is a path segment, so a malformed one is
 * not-found here and never becomes a FeedbackOps request path. The way back is only ever the Kernel's `returnOrigin()` (`ReturnLink`).
 */
export default function VocDetail({ params }: PageProps) {
  const { lang } = useI18n();
  const { pageParam } = usePlatform();
  const ko = lang === 'ko';
  const vocId = params.vocId!;
  if (!VOC_ID.test(vocId)) {
    return <PlatformPage>
      <StateMessage icon={<SearchX className="size-4" aria-hidden />}
        title={ko ? 'VOC를 찾을 수 없습니다' : 'VOC not found'}
        body={ko ? '주소의 VOC ID가 올바르지 않습니다.' : 'The VOC ID in the address is not valid.'} />
    </PlatformPage>;
  }
  return <PlatformPage secondaryActions={pageParam('returnTo') !== null ? <ReturnLink /> : undefined}>
    <FoBridge><ReporterVocDetail vocId={vocId} /></FoBridge>
  </PlatformPage>;
}
