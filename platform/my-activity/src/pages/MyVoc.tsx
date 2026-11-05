import { useCallback, useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { PlatformPage, StateMessage } from '@ap/components';
import { Button } from '@ap/ui';
import { PublicVocListScreen, VocReadingPane, type PublicVocInitialFocus, type PublicVocQuery } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '@ap/feature-bridge';
import { pagePatch, parseVocPage } from '../feature/voc-query';

const CLEARED_FOCUS: Record<string, PublicVocInitialFocus> = { q: 'q', status: 'list', sort: 'list', mine: 'mine', system: 'system', focus: 'list' };

/**
 * 소통 › VOC (ADR-0110, prototype ② B): every VOC in the actor's reach as a list, and the selected one (`focus`) in a reading pane beside it.
 * The server decides what is in reach; the pane asks it who owns the selected VOC before it mounts the reporter detail (`VocReadingPane`).
 * The URL owns the query; a page key outside its domain is rejected and preserved, and nothing is requested for it.
 */
export default function MyVoc() {
  const { lang } = useI18n();
  const { pageParam, setPage, linkTo, canOpen } = usePlatform();
  const ko = lang === 'ko';
  const parsed = parseVocPage(pageParam);
  const onQueryChange = useCallback((patch: Partial<PublicVocQuery>) => setPage(pagePatch(patch)), [setPage]);
  // Where focus goes once a rejected value is cleared and the list takes the warning's place (never `<body>`).
  const [clearedFocus, setClearedFocus] = useState<PublicVocInitialFocus | undefined>(undefined);
  const listPaneRef = useRef<HTMLDivElement>(null);
  const detailPaneRef = useRef<HTMLElement>(null);
  const listFocusRequested = useRef(false);
  // Set when a row is chosen: the list may be about to disappear under the user's focus.
  const detailFocusRequested = useRef(false);
  const onSelect = useCallback((id: string) => { detailFocusRequested.current = true; setPage({ focus: id }); }, [setPage]);
  // The list claims its cleared-value focus once on mount. In a narrow container a retained selection has hidden the list by then,
  // and focus on a `display: none` control falls to <body>: hand it to the pane instead.
  const onInitialFocusClaimed = useCallback(() => {
    setClearedFocus(undefined);
    const list = listPaneRef.current;
    if (list && getComputedStyle(list).display === 'none') detailPaneRef.current?.focus();
  }, []);
  const selection = parsed.ok ? parsed.focus : undefined;
  const listShown = parsed.ok;
  useEffect(() => {
    if (!detailFocusRequested.current || !listShown || selection === null || selection === undefined) return;
    detailFocusRequested.current = false;
    // Narrow container: the list is `display: none` once a VOC is selected, so its focus would fall to <body>. Hand it to the pane.
    const list = listPaneRef.current;
    if (list && getComputedStyle(list).display === 'none') detailPaneRef.current?.focus();
  }, [selection, listShown]);
  useEffect(() => {
    if (selection === null && listFocusRequested.current) {
      listFocusRequested.current = false;
      listPaneRef.current?.focus();
    }
  }, [selection]);

  if (!parsed.ok) {
    return <PlatformPage>
      <StateMessage tone="warning" icon={<TriangleAlert className="size-4" aria-hidden />}
        title={parsed.unsupported
          ? (ko ? `VOC 목록은 주소의 ${parsed.key} 조건을 지원하지 않습니다` : `The VOC list does not support the ${parsed.key} condition in the address`)
          : (ko ? `주소의 ${parsed.key} 값이 올바르지 않습니다` : `The ${parsed.key} value in the address is not valid`)}
        body={parsed.unsupported
          ? (ko ? '조건을 적용하지 않고 그대로 두었습니다. 값을 지우면 목록을 볼 수 있습니다.' : 'The condition was neither applied nor changed. Clear the value to see the list.')
          : (ko ? '다른 값으로 바꾸지 않았습니다.' : 'Nothing was substituted.')}
        action={<Button size="sm" variant="secondary" onClick={() => { setClearedFocus(CLEARED_FOCUS[parsed.key]); setPage({ [parsed.key]: null }); }}>{ko ? '값 지우기' : 'Clear value'}</Button>} />
    </PlatformPage>;
  }
  const { query, focus } = parsed;
  return <PlatformPage layout="fill" bodyInset="none">
    <FeatureBridge>
      {/* The absolute layer keeps the list's height out of the fill box's intrinsic size, so the list scrolls inside it
          and a `focus` push (which resets #platform-main) never moves the selected row. */}
      <div className="@container/voc relative h-full">
        {/* At 48rem the list's 320px minimum still leaves a usable reading pane. Below it, the URL selection chooses the pane. */}
        <div className="absolute inset-0 grid grid-cols-1 @3xl/voc:grid-cols-[minmax(320px,2fr)_3fr]">
          <div ref={listPaneRef} tabIndex={-1} data-voc-list className={`min-h-0 min-w-0 border-r border-border-subtle @3xl/voc:block ${focus === null ? '' : 'hidden'}`}>
            <PublicVocListScreen query={query} initialFocus={clearedFocus} onInitialFocusClaimed={onInitialFocusClaimed} onQueryChange={onQueryChange} selectedId={focus} onSelect={onSelect} />
          </div>
          <section ref={detailPaneRef} tabIndex={-1} aria-label={ko ? 'VOC 상세' : 'VOC details'} className={`min-h-0 min-w-0 overflow-y-auto @3xl/voc:block ${focus === null ? 'hidden' : ''}`}>
            {focus === null
              ? <p className="p-6 text-sm text-text-muted">{ko ? '목록에서 VOC를 고르면 여기에 보입니다.' : 'Pick a VOC in the list to read it here.'}</p>
              : <>
                <div className="flex flex-wrap justify-end gap-2 px-4 pt-3">
                  <Button size="sm" variant="secondary" className="@3xl/voc:hidden" onClick={() => { listFocusRequested.current = true; setPage({ focus: null }); }}>{ko ? '목록 보기' : 'Show list'}</Button>
                  {canOpen('inbox') && <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('inbox', { page: { focus }, returnTo: true })}>{ko ? '업무 흐름에서 처리' : 'Handle in workflow'}</PlatformLink></Button>}
                  <Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('voc-detail', { params: { vocId: focus }, returnTo: true })}>{ko ? '전체 화면' : 'Full page'}</PlatformLink></Button>
                </div>
                <VocReadingPane key={focus} vocId={focus} variant="embedded" />
              </>}
          </section>
        </div>
      </div>
    </FeatureBridge>
  </PlatformPage>;
}
