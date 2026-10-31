import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n, useMenuQuery, usePlatform, type QueryState } from '@ap/kernel';
import { DataTrustIndicator, PlatformPage, QueryView } from '@ap/components';
import { PanelRightOpen } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { CHART_KINDS, chartCatalogEndpoint, isCatalogKind, type CatalogData } from '../../endpoints';
import { BreakdownNodeRejection, invalidBreakdownNode } from './BreakdownBars';
import { CatalogChart } from './CatalogChart';
import { kindLabels, statusLabels, supportCounts, supportFor } from './support';
import { useWorkspace } from './useWorkspace';

type Preference = { open: boolean; width: number };
// In-memory only: menu code cannot touch web storage (lint); persisting the rail waits for a
// component-owned panel preference (#575, backlog).
function readPreference(): Preference {
  return { open: false, width: 300 };
}

export default function ChartCatalog() {
  const { pageParam } = usePlatform();
  const rawKind = pageParam('kind');
  const kind = isCatalogKind(rawKind) ? rawKind : 'line';
  // An invalid breakdown node is rejected before, and without, the catalogue query (06 §6.4).
  const rejectedNode = kind === 'breakdown' ? invalidBreakdownNode(pageParam('node')) : null;
  const query = useMenuQuery(chartCatalogEndpoint, { kind }, rejectedNode === null);
  return <PlatformPage density="compact" dataTrustSummary={query.response ? <DataTrustIndicator trust={query.response.trust} assessments={query.response.assessments} /> : undefined}>
    <CatalogWorkspace query={query} rejectedNode={rejectedNode} />
  </PlatformPage>;
}

function CatalogWorkspace({ query, rejectedNode }: { query: QueryState<CatalogData>; rejectedNode: string | null }) {
  const { tx } = useI18n();
  const { pageParam, setPage, route } = usePlatform();
  const rawKind = pageParam('kind');
  const kind = isCatalogKind(rawKind) ? rawKind : 'line';
  const [preference, setPreference] = useState(readPreference);
  const [focus, setFocus] = useState(false);
  const { root, chart, width, plotHeight } = useWorkspace();
  const focusToggle = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const pendingFocus = useRef<'open' | 'close' | null>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const panelId = useId();
  const narrow = width < 480 + 240 + 24;
  const maxWidth = narrow ? 420 : Math.max(240, Math.min(420, width - 480 - 24));
  const effectiveWidth = Math.min(preference.width, maxWidth);
  const support = supportFor(kind, route?.menu.features);
  useLayoutEffect(() => {
    panel.current?.style.setProperty('--catalog-support-width', `${effectiveWidth}px`);
  }, [effectiveWidth, preference.open, focus, narrow]);
  useLayoutEffect(() => {
    if (pendingFocus.current === 'close') closeButton.current?.focus();
    if (pendingFocus.current === 'open') openButton.current?.focus();
    pendingFocus.current = null;
  }, [preference.open]);
  function toggleRail(open: boolean) {
    const current = open ? openButton.current : closeButton.current;
    if (document.activeElement === current || document.activeElement === document.body) pendingFocus.current = open ? 'close' : 'open';
    setPreference(old => ({ ...old, open }));
  }
  function resize(next: number) { setPreference(old => ({ ...old, width: Math.max(240, Math.min(maxWidth, next)) })); }
  function separatorKey(event: KeyboardEvent) {
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = effectiveWidth + 16; break;
      case 'ArrowRight': next = effectiveWidth - 16; break;
      case 'Home': next = 240; break;
      case 'End': next = maxWidth; break;
      case 'Enter': next = 300; break;
      default: return;
    }
    event.preventDefault(); resize(next);
  }
  function escape(event: KeyboardEvent) {
    if (!focus || event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
    // Radix portals and chart dialogs/menus consume Escape before the workspace does.
    if (document.querySelector('[role="dialog"], [role="menu"], [role="tooltip"], [data-radix-popper-content-wrapper]')) return;
    event.preventDefault(); setFocus(false); focusToggle.current?.focus();
  }
  return <div ref={root} role="region" aria-label={tx({ ko: '차트 카탈로그 작업 영역', en: 'Chart catalog workspace' })} className="flex min-h-0 flex-col gap-2" onKeyDown={escape}>
      <Tabs value={kind} onValueChange={value => { if (isCatalogKind(value)) setPage({ kind: value }); }} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div hidden={focus} className="min-w-0 flex-1">
            <TabsList overflow="menu" moreLabel={tx({ ko: '더보기', en: 'More' })} aria-label={tx({ ko: '차트 종류', en: 'Chart kind' })}>
              {CHART_KINDS.map(item => {
                const counts = supportCounts(supportFor(item, route?.menu.features));
                const mark = tx({ ko: `지원 ${counts.supported} · 조건부 ${counts.conditional} · 미지원 ${counts.unsupported}`, en: `${counts.supported} supported · ${counts.conditional} conditional · ${counts.unsupported} unsupported` });
                return <TabsTrigger key={item} value={item} aria-label={`${tx(kindLabels[item])} ${mark}`}>{tx(kindLabels[item])}</TabsTrigger>;
              })}
            </TabsList>
          </div>
          <Button ref={focusToggle} type="button" size="toolbar" variant="ghost" aria-pressed={focus} onClick={() => setFocus(!focus)}>{tx({ ko: '집중', en: 'Focus' })}</Button>
        </div>
        {rawKind !== null && !isCatalogKind(rawKind) && <p role="status" aria-label={tx({ ko: '차트 종류 안내', en: 'Chart kind notice' })} className="t-caption text-text-muted">
          {tx({ ko: `“${rawKind}” 대신 기본 선 차트를 표시합니다.`, en: `Showing the default line chart instead of “${rawKind}”.` })}
        </p>}
        <div className={narrow ? 'mt-2 flex min-h-0 flex-1 flex-col gap-2' : 'mt-2 flex min-h-0 flex-1 gap-2'}>
          <div ref={chart} role="region" aria-label={tx({ ko: '차트 작업 영역', en: 'Chart workspace' })} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-auto">
            {/* One stable panel/QueryView path: layout never changes chart identity. */}
            <TabsContent value={kind} className="m-0">
              {rejectedNode !== null ? <BreakdownNodeRejection node={rejectedNode} /> : <QueryView query={query} widgetName={tx({ ko: '차트 데이터', en: 'Chart data' })}>
                {data => <CatalogChart key={kind} kind={kind} data={data} height={plotHeight} />}
              </QueryView>}
            </TabsContent>
          </div>
          {!focus && preference.open && !narrow && <div role="separator" aria-label={tx({ ko: '동작·지원 너비', en: 'Interaction support width' })} aria-controls={panelId} aria-orientation="vertical" aria-valuemin={240} aria-valuemax={maxWidth} aria-valuenow={effectiveWidth} tabIndex={0}
            className="w-2 shrink-0 cursor-col-resize touch-none rounded border border-border-subtle bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
            onKeyDown={separatorKey}
            onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); drag.current = { x: event.clientX, width: effectiveWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { if (drag.current) resize(drag.current.width + drag.current.x - event.clientX); }}
            onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => { drag.current = null; }} />}
          {!focus && <aside ref={panel} id={panelId} aria-label={tx({ ko: '동작·지원', en: 'Interaction support' })} className={!preference.open ? 'w-8 shrink-0' : narrow ? 'catalog-support-stacked min-h-0 shrink-0 overflow-auto rounded border border-border-subtle bg-surface-card' : 'catalog-support-panel min-h-0 shrink-0 overflow-auto rounded border border-border-subtle bg-surface-card'}>
            {preference.open ? <div className="space-y-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="t-card-title">{tx({ ko: '동작·지원', en: 'Interaction support' })}</h2>
                <Button ref={closeButton} type="button" size="toolbar" variant="ghost" aria-expanded aria-controls={panelId} onClick={() => toggleRail(false)}>{tx({ ko: '동작·지원 접기', en: 'Collapse interaction support' })}</Button>
              </div>
              <p className="t-caption text-text-muted">{tx({ ko: '지원: 바로 사용 · 조건부: 조건 충족 후 사용 · 미지원: 제공하지 않음', en: 'Supported: available · Conditional: requires the stated conditions · Unsupported: unavailable' })}</p>
              <dl className="space-y-3">{support.map(cell => <div key={cell.id}>
                <dt className="t-caption font-medium">{tx(cell.label)} · {tx(statusLabels[cell.status])}</dt>
                <dd className="t-caption text-text-secondary">{tx(cell.reason)} <span className="text-text-muted">{cell.reference}</span></dd>
              </div>)}</dl>
              <Button type="button" size="toolbar" variant="secondary" onClick={() => resize(300)}>{tx({ ko: '너비 초기화', en: 'Reset width' })}</Button>
            </div> : <Button ref={openButton} type="button" size="icon-sm" variant="secondary" aria-label={tx({ ko: '동작·지원 열기', en: 'Open interaction support' })} aria-expanded={false} aria-controls={panelId} onClick={() => toggleRail(true)}><PanelRightOpen className="size-3.5" aria-hidden /></Button>}
          </aside>}
        </div>
      </Tabs>
    </div>;
}
