/** #1288 THROWAWAY PROTOTYPE ② — 직속 VOC 상세 (fixture). A·C: 본문 + 오른쪽 정보 열. B: 진행 단계 줄 + 한 열. */
import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { cn } from '@ap/ui';
import { VOCS } from './fixtures';
import { DetailBody } from './VocListProto';
import { PROTO_1287 } from './variant';

const STEPS = ['접수됨', '검토 중', '처리 중', '해결됨'] as const;

export default function VocDetailProto() {
  const { route } = usePlatform();
  const id = (route as { params?: Record<string, string> } | null)?.params?.vocId ?? 'v1';
  const voc = VOCS.find(v => v.id === id) ?? VOCS[0]!;
  if (PROTO_1287 === 'B') {
    const at = STEPS.indexOf(voc.status);
    return <PlatformPage layout="flow">
      <div className="mx-auto max-w-3xl">
        <ol className="mb-5 flex items-center gap-2">{STEPS.map((s, i) => <li key={s} className="flex flex-1 items-center gap-2">
          <span className={cn('grid size-6 place-items-center rounded-pill text-xs', i <= at ? 'bg-accent-primary text-white' : 'bg-accent-neutral-soft text-text-muted')}>{i + 1}</span>
          <span className={cn('text-xs', i <= at ? 'font-medium text-text-primary' : 'text-text-muted')}>{s}</span>
          {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < at ? 'bg-accent-primary' : 'bg-border-subtle')} />}</li>)}</ol>
        <DetailBody voc={voc} compact />
      </div>
    </PlatformPage>;
  }
  return <PlatformPage layout="flow"><DetailBody voc={voc} /></PlatformPage>;
}
