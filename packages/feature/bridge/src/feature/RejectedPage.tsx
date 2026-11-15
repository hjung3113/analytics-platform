import { TriangleAlert } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { PlatformPage, StateMessage } from '@ap/components';
import { Button } from '@ap/ui';

/** The shared look of a rejected address value (same copy as 내 VOC): the address is kept, and clearing drops only that key (ADR-0071 decision 9, 06 §6.4). */
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
