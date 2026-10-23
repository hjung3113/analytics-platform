import { useCallback, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { DetailDrawer, PlatformPage, StateMessage } from '@ap/components';
import { Button } from '@ap/ui';
import { MyVocListScreen, ReporterVocDetail, type MyVocInitialFocus, type MyVocQuery } from '@fops/frontend/global-screens';
import { FoBridge } from '../fo/FoBridge';
import { pagePatch, parseMyVocPage } from '../fo/voc-query';

const CLEARED_FOCUS: Record<string, MyVocInitialFocus> = { q: 'q', status: 'status', sort: 'sort', focus: 'list' };

/**
 * 내 VOC (ADR-0070 decision 1, ADR-0071): the reporter's own list from FeedbackOps through the bridge, and the reporter detail in the shell
 * detail slot (`focus`). Both are reporter-perspective FeedbackOps parts, not the operator inbox panel. The URL owns the query; a page key
 * outside its domain is rejected and preserved, and nothing is requested for it.
 */
export default function MyVoc() {
  const { lang } = useI18n();
  const { pageParam, setPage, linkTo } = usePlatform();
  const ko = lang === 'ko';
  const parsed = parseMyVocPage(pageParam);
  const onQueryChange = useCallback((patch: Partial<MyVocQuery>) => setPage(pagePatch(patch)), [setPage]);
  // Where focus goes once a rejected value is cleared and the list takes the warning's place (never `<body>`).
  const [clearedFocus, setClearedFocus] = useState<MyVocInitialFocus | undefined>(undefined);
  const onSelect = useCallback((id: string) => setPage({ focus: id }), [setPage]);

  if (!parsed.ok) {
    return <PlatformPage>
      <StateMessage tone="warning" icon={<TriangleAlert className="size-4" aria-hidden />}
        title={ko ? `주소의 ${parsed.key} 값이 올바르지 않습니다` : `The ${parsed.key} value in the address is not valid`}
        body={ko ? '다른 값으로 바꾸지 않았습니다.' : 'Nothing was substituted.'}
        action={<Button size="sm" variant="secondary" onClick={() => { setClearedFocus(CLEARED_FOCUS[parsed.key]); setPage({ [parsed.key]: null }); }}>{ko ? '값 지우기' : 'Clear value'}</Button>} />
    </PlatformPage>;
  }
  const { query, focus } = parsed;
  return <PlatformPage layout="fill">
    <FoBridge>
      {/* The absolute layer keeps the list's height out of the fill box's intrinsic size, so the list scrolls inside it
          and a `focus` push (which resets #platform-main) never moves the selected row (UX-1). */}
      <div className="relative h-full">
        <div className="absolute inset-0">
          <MyVocListScreen query={query} initialFocus={clearedFocus} onInitialFocusClaimed={() => setClearedFocus(undefined)} onQueryChange={onQueryChange} selectedId={focus} onSelect={onSelect} />
        </div>
      </div>
      {focus !== null && <DetailDrawer key={focus} title={ko ? 'VOC 상세' : 'VOC details'} onClose={() => setPage({ focus: null })}
        headerActions={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('voc-detail', { params: { vocId: focus }, returnTo: true })}>{ko ? '전체 화면' : 'Full page'}</PlatformLink></Button>}
        tabs={[{ id: 'detail', label: ko ? '상세' : 'Details', content: <ReporterVocDetail vocId={focus} variant="embedded" /> }]} />}
    </FoBridge>
  </PlatformPage>;
}
