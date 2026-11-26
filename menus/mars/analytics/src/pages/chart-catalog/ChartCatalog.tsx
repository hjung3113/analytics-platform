import { useMessages } from '@ap/kernel';

import { ANALYTICS_MESSAGES } from '../../messages';
import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n, useMenuQuery, usePlatform, type QueryState } from '@ap/kernel';
import { DataTrustIndicator, PlatformPage, QueryView, type OrderedTrackLoadState } from '@ap/components';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button, cn, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { CHART_KINDS, chartCatalogEndpoint, isCatalogKind, type CatalogData } from '../../endpoints';
import { BreakdownNodeRejection, invalidBreakdownNode } from './BreakdownBars';
import { CatalogChart } from './CatalogChart';
import { kindLabels, statusLabels, supportCounts, supportFor } from './support';
import { SequenceSample } from './SequenceSample';
import { HistogramSample } from './HistogramSample';
import { useWorkspace } from './useWorkspace';

type Preference = { open: boolean; width: number };
const SUPPORT_MIN_WIDTH = 240;
const SUPPORT_MAX_WIDTH = 420;
const SUPPORT_DEFAULT_WIDTH = 300;
const SUPPORT_RESIZE_STEP = 16;
const CHART_MIN_WIDTH = 480;
const DOCK_GAPS_AND_SEPARATOR_WIDTH = 24;

// In-memory only: menu code cannot touch web storage (lint); persisting the rail waits for a
// component-owned panel preference (#575, backlog).
function readPreference(): Preference {
  return { open: false, width: SUPPORT_DEFAULT_WIDTH };
}

function focusIsUnassigned(doc: Document) {
  return doc.activeElement === doc.body || !doc.activeElement?.isConnected;
}

export default function ChartCatalog() {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { pageParam } = usePlatform();
  const [sequenceLoad, setSequenceLoad] = useState<OrderedTrackLoadState>('ready');
  const rawKind = pageParam('kind');
  const kind = isCatalogKind(rawKind) ? rawKind : 'line';
  // An invalid breakdown node is rejected before, and without, the catalogue query (06 §6.4).
  const rejectedNode = kind === 'breakdown' ? invalidBreakdownNode(pageParam('node')) : null;
  // keepPrevious OFF (#1365, ADR-0114): `kind` selects a different chart, so the previous result would be another subject under the new label.
  const query = useMenuQuery(chartCatalogEndpoint, { kind }, { enabled: rejectedNode === null && kind !== 'histogram' });
  return <PlatformPage dataTrustSummary={query.response ? <DataTrustIndicator trust={query.response.trust} assessments={kind === 'sequence' && sequenceLoad === 'error' ? [...query.response.assessments.filter(item => item.kind !== 'collection'), { kind: 'collection', state: 'confirmed', reason: 'check_failed', detail: m('chartCatalogSyntheticRangeRequestFailed') }] : query.response.assessments} /> : undefined}>
    <CatalogWorkspace query={query} updatedAt={query.response?.trust?.updatedAt ?? null} rejectedNode={rejectedNode} onSequenceLoad={setSequenceLoad} />
  </PlatformPage>;
}

function CatalogWorkspace({ query, updatedAt, rejectedNode, onSequenceLoad }: { query: QueryState<CatalogData>; updatedAt: string | null; rejectedNode: string | null; onSequenceLoad: (state: OrderedTrackLoadState) => void }) {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { tx } = useI18n();
  const { pageParam, setPage, route } = usePlatform();
  const rawKind = pageParam('kind');
  const kind = isCatalogKind(rawKind) ? rawKind : 'line';
  const [preference, setPreference] = useState(readPreference);
  const [focus, setFocus] = useState(false);
  const { root, chart, width, plotHeight, dockSupport } = useWorkspace();
  const focusToggle = useRef<HTMLButtonElement>(null);
  const supportToggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const recoverSeparatorFocus = useRef(false);
  const wasPreferenceOpen = useRef(false);
  const panelId = useId();
  const supportOpen = !focus && preference.open;
  const overlayOpen = supportOpen && !dockSupport;
  const maxWidth = dockSupport
    ? Math.max(SUPPORT_MIN_WIDTH, Math.min(SUPPORT_MAX_WIDTH, width - CHART_MIN_WIDTH - DOCK_GAPS_AND_SEPARATOR_WIDTH))
    : SUPPORT_MAX_WIDTH;
  const effectiveWidth = Math.min(preference.width, maxWidth);
  const support = supportFor(kind, route?.menu.features);
  const supportToggleLabel = m(supportOpen ? 'chartCatalogCollapseInteractionSupport' : 'chartCatalogOpenInteractionSupport');
  const SupportIcon = supportOpen ? PanelRightClose : PanelRightOpen;
  const captureSeparatorFocus = useCallback((separator: HTMLDivElement | null) => {
    if (!separator) return;
    return () => {
      // Capture focus while the separator is still attached, before the breakpoint removes it.
      const doc = separator.ownerDocument;
      recoverSeparatorFocus.current = doc.activeElement === separator || (drag.current !== null && focusIsUnassigned(doc));
    };
  }, []);
  useLayoutEffect(() => {
    panel.current?.style.setProperty('--catalog-support-width', `${effectiveWidth}px`);
    if (!supportOpen || !dockSupport) drag.current = null;
    const opening = preference.open && !wasPreferenceOpen.current;
    wasPreferenceOpen.current = preference.open;
    const aside = panel.current;
    const active = aside?.ownerDocument.activeElement;
    if (overlayOpen && !opening && active && chart.current?.contains(active)) {
      // Crossing into overlay mode would cover a chart control that already has focus: dismiss instead (focus stays).
      setPreference(old => ({ ...old, open: false }));
    } else if (overlayOpen && aside && (opening || (recoverSeparatorFocus.current && focusIsUnassigned(aside.ownerDocument)))) {
      aside.focus();
    }
    recoverSeparatorFocus.current = false;
  }, [chart, dockSupport, effectiveWidth, overlayOpen, preference.open, supportOpen]);
  const closeSupport = useCallback(({ returnFocus }: { returnFocus: boolean }) => {
    setPreference(old => ({ ...old, open: false }));
    if (returnFocus) supportToggle.current?.focus();
  }, []);
  useLayoutEffect(() => {
    const aside = panel.current;
    if (!overlayOpen || !aside) return;
    const doc = aside.ownerDocument;
    const dismissOnFocusOutside = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && !aside.contains(target) && !supportToggle.current?.contains(target) && !focusToggle.current?.contains(target)) {
        closeSupport({ returnFocus: false });
      }
    };
    doc.addEventListener('focusin', dismissOnFocusOutside, true);
    return () => doc.removeEventListener('focusin', dismissOnFocusOutside, true);
  }, [closeSupport, overlayOpen]);
  function resize(next: number) { setPreference(old => ({ ...old, width: Math.max(SUPPORT_MIN_WIDTH, Math.min(maxWidth, next)) })); }
  function separatorKey(event: KeyboardEvent) {
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = effectiveWidth + SUPPORT_RESIZE_STEP; break;
      case 'ArrowRight': next = effectiveWidth - SUPPORT_RESIZE_STEP; break;
      case 'Home': next = SUPPORT_MIN_WIDTH; break;
      case 'End': next = maxWidth; break;
      case 'Enter': next = SUPPORT_DEFAULT_WIDTH; break;
      default: return;
    }
    event.preventDefault(); resize(next);
  }
  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
    const insideSupport = supportOpen && event.target instanceof Node && panel.current?.contains(event.target);
    if (!focus && !overlayOpen && !insideSupport) return;
    // Radix portals and chart dialogs/menus consume Escape before the workspace does.
    if (document.querySelector('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]:not(:has([role="tooltip"]))')) return;
    event.preventDefault();
    if (supportOpen) {
      event.stopPropagation();
      closeSupport({ returnFocus: true });
      return;
    }
    setFocus(false);
    focusToggle.current?.focus();
  }
  let content;
  if (kind === 'histogram') content = <HistogramSample height={plotHeight} />;
  else if (rejectedNode !== null) content = <BreakdownNodeRejection node={rejectedNode} />;
  else content = <QueryView query={query} widgetName={m('chartCatalogChartData')}>
    {data => kind === 'sequence' ? <SequenceSample height={plotHeight} onLoadStateChange={onSequenceLoad} /> : <CatalogChart key={kind} kind={kind} data={data} height={plotHeight} updatedAt={updatedAt} />}
  </QueryView>;
  return <div ref={root} role="region" aria-label={m('chartCatalogChartCatalogWorkspace')} className="flex min-h-0 flex-col gap-2" onKeyDown={escape}>
      <Tabs value={kind} onValueChange={value => { if (isCatalogKind(value)) setPage({ kind: value }); }} className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div hidden={focus} className="min-w-0 flex-1">
            <TabsList overflow="menu" moreLabel={m('chartCatalogMore')} aria-label={m('chartCatalogChartKind')}>
              {CHART_KINDS.map(item => {
                const counts = supportCounts(supportFor(item, route?.menu.features));
                const mark = m('chartCatalogSupportedConditionalUnsupported', { supported: String(counts.supported), conditional: String(counts.conditional), unsupported: String(counts.unsupported) });
                return <TabsTrigger key={item} value={item} aria-label={`${tx(kindLabels[item])} ${mark}`}>{tx(kindLabels[item])}</TabsTrigger>;
              })}
            </TabsList>
          </div>
          <Button ref={focusToggle} type="button" size="toolbar" variant="ghost" aria-pressed={focus} onClick={() => setFocus(!focus)}>{m('chartCatalogFocus')}</Button>
          {!focus && <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button ref={supportToggle} type="button" size="icon-xs" variant="secondary" className="shrink-0"
              aria-label={supportToggleLabel} aria-expanded={supportOpen} aria-controls={panelId}
              onClick={() => {
                if (supportOpen) closeSupport({ returnFocus: true });
                else setPreference(old => ({ ...old, open: true }));
              }}>
              <SupportIcon className="size-3.5" aria-hidden />
            </Button>
          </TooltipTrigger><TooltipContent>{supportToggleLabel}</TooltipContent></Tooltip></TooltipProvider>}
        </div>
        {rawKind !== null && !isCatalogKind(rawKind) && <p role="status" aria-label={m('chartCatalogChartKindNotice')} className="t-caption text-text-muted">
          {m('chartCatalogShowingTheDefaultLineChartInsteadOf', { rawKind: String(rawKind) })}
        </p>}
        <div className="relative mt-2 flex min-h-0 flex-1 gap-2">
          <div ref={chart} role="region" aria-label={m('chartCatalogChartWorkspace')} tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-auto">
            {/* One stable panel/QueryView path: layout never changes chart identity. */}
            <TabsContent value={kind} className="m-0">{content}</TabsContent>
          </div>
          {supportOpen && dockSupport && <div ref={captureSeparatorFocus} role="separator" aria-label={m('chartCatalogInteractionSupportWidth')} aria-controls={panelId} aria-orientation="vertical" aria-valuemin={SUPPORT_MIN_WIDTH} aria-valuemax={maxWidth} aria-valuenow={effectiveWidth} tabIndex={0}
            className="w-2 shrink-0 cursor-col-resize touch-none rounded border border-border-subtle bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
            onKeyDown={separatorKey}
            onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); drag.current = { x: event.clientX, width: effectiveWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { if (drag.current) resize(drag.current.width + drag.current.x - event.clientX); }}
            onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => { drag.current = null; }} />}
          <aside ref={panel} id={panelId} hidden={!supportOpen} tabIndex={-1} aria-label={m('chartCatalogInteractionSupport')}
            className={cn('catalog-support-panel min-h-0 shrink-0 overflow-auto rounded border border-border-subtle',
              dockSupport ? 'bg-surface-card' : 'absolute inset-y-0 end-0 z-10 max-w-full bg-surface-popover shadow-md')}>
            {supportOpen && <div className="space-y-3 p-3 break-keep">
              <h2 className="t-card-title">{m('chartCatalogInteractionSupport2')}</h2>
              <p className="t-caption text-text-muted">{m('chartCatalogSupportedAvailableConditionalRequiresTheStatedConditions')}</p>
              <dl className="space-y-3">{support.map(cell => <div key={cell.id}>
                <dt className="t-caption font-medium">{tx(cell.label)} · {tx(statusLabels[cell.status])}</dt>
                <dd className="t-caption text-text-secondary">{tx(cell.reason)} <span className="text-text-muted">{cell.reference}</span></dd>
              </div>)}</dl>
              <Button type="button" size="toolbar" variant="secondary" onClick={() => resize(SUPPORT_DEFAULT_WIDTH)}>{m('chartCatalogResetWidth')}</Button>
            </div>}
          </aside>
        </div>
      </Tabs>
    </div>;
}
