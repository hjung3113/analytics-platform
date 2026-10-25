import { TriangleAlert } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { PlatformPage, StateMessage } from '@ap/components';
import { Button } from '@ap/ui';
import type { OperatorRoute } from '@ap/fo-bridge';
import { isVocSearchValueValid } from '@fops/frontend/operator-screens/voc-search';

/**
 * The first address value of `route` that FeedbackOps' own VOC search schema refuses (the single source for what a value may be; `focus` is its
 * `selected`, a UUID). The page renders `RejectedPage` for it before mounting any FeedbackOps screen, so nothing is requested for it (06 §6.4).
 */
export function useRejectedValue(route: OperatorRoute) {
  const { pageParam } = usePlatform();
  return route.rejectedKey(pageParam, isVocSearchValueValid);
}

/** The shared look of a rejected address value (same copy as 내 VOC): the address is kept, and clearing drops only that key. */
export function RejectedPage({ rejected }: { rejected: { key: string } }) {
  const { lang } = useI18n();
  const { setPage } = usePlatform();
  const ko = lang === 'ko';
  return <PlatformPage>
    <StateMessage tone="warning" icon={<TriangleAlert className="size-4" aria-hidden />}
      title={ko ? `주소의 ${rejected.key} 값이 올바르지 않습니다` : `The ${rejected.key} value in the address is not valid`}
      body={ko ? '다른 값으로 바꾸지 않았습니다.' : 'Nothing was substituted.'}
      action={<Button size="sm" variant="secondary" onClick={() => setPage({ [rejected.key]: null })}>{ko ? '값 지우기' : 'Clear value'}</Button>} />
  </PlatformPage>;
}
