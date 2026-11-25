import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { formatWallClock, isAnswered, type Text } from '@ap/contracts';
import { formatText, HeldAnalysisSelections, LentPanel, PlatformLink, useI18n, useLentPanel, useMenuQuery, useMessages, usePlatform, useQueryContext, type HeldAnalysisSelection, type LinkResolution } from '@ap/kernel';
import { LoadingBlock, PANEL_RECIPE_ITEM, PanelRecipeBack, PanelRecipeFrame, PanelWorkspace, StateMessage, focusPageFallback, panelRecipe, type AnalysisPanelDraft, type PanelWorkspacePanel, type PanelWorkspacePreset } from '@ap/components';
import { manifests } from '../index';
import { configurationLendingEndpoint, historyPeriod, HW_TREND_CLOSED, HW_TREND_ITEM_KEY, TREND_ITEM_KEY, type CompareParams, type LinkedMotion } from '../endpoints';
import { TriangleAlert, X } from 'lucide-react';
import { Button, StatusBadge } from '@ap/ui';
import { HW_TIME_TREND, hwTimeTrendBinding } from '../lentTrendMapping';
import { MESSAGES } from '../messages';
import { configurationPanels } from '../panels';
import { HOLD_TIME, HW_TIME_COMPARISON_ID, HW_TIME_PANEL_ID, useHwTimeComparison } from './heldTrend';
import { TrendPanel } from './TrendPanel';

const { matrix, trend } = configurationPanels;
const PRESETS: PanelWorkspacePreset[] = [{ id: 'comparison', label: MESSAGES.title, layout: { type: 'group', panels: [matrix.id], active: matrix.id } }];
const TREND_HEIGHT = 420;
const TREND_ROW = { row: 'trends' };
const COMPARISON_ROW = { row: 'hw-time-comparison' };

function HwTimeComparison({ values, time, badge, waiting, reason, follow, close }: {
  values: ReturnType<typeof hwTimeTrendBinding>['values'];
  time?: HeldAnalysisSelection;
  badge?: Text;
  waiting: boolean;
  reason: string | null;
  follow?: () => void;
  close: () => void;
}) {
  const { tx } = useI18n();
  const m = useMessages(MESSAGES);
  return <div className="flex h-full min-h-0 min-w-0 flex-col break-keep">
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-border-subtle px-4 py-2">
      {badge && <StatusBadge tone="neutral" className="mr-auto min-w-0 whitespace-normal break-keep">{tx(badge)}</StatusBadge>}
      {follow && <Button variant="secondary" size="sm" onClick={follow}>{m('hwTimeFollowAgain')}</Button>}
      <Button variant="ghost" size="icon-sm" aria-label={m('closeHwTimeComparison')} onClick={close}><X className="size-4" aria-hidden /></Button>
    </div>
    <div className="min-h-0 flex-1">
      {waiting && <LoadingBlock />}
      {!waiting && reason && <StateMessage compact tone="warning" icon={<TriangleAlert aria-hidden />} title={reason} />}
      {!waiting && !reason && <HeldAnalysisSelections held={time ? { [HOLD_TIME.holdTime.key]: time } : {}}>
        <ComparisonLentPanel values={values} />
      </HeldAnalysisSelections>}
    </div>
  </div>;
}

function ComparisonLentPanel({ values }: { values: ReturnType<typeof hwTimeTrendBinding>['values'] }) {
  const { tx } = useI18n();
  const verdict = useLentPanel(HW_TIME_TREND, values, HOLD_TIME);
  if (!verdict.allowed) return <StateMessage compact tone="warning" icon={<TriangleAlert aria-hidden />} title={tx(verdict.reason.text)} />;
  return <LentPanel source={HW_TIME_TREND} values={values} {...HOLD_TIME} />;
}

export function OpenHwTimeLink({ link }: { link: LinkResolution }) {
  const m = useMessages(MESSAGES);
  if (link.kind === 'none') return null;
  if (!link.allowed) return <Button size="sm" variant="secondary" disabled title={m('hwTimeLinkDenied')} aria-description={m('hwTimeLinkDenied')}>{m('openHwTime')}</Button>;
  return <Button size="sm" variant="secondary" asChild><PlatformLink href={link.href}>{m('openHwTime')}</PlatformLink></Button>;
}

export type TrendActions = {
  openTrend: (id: string, linkedMotion?: LinkedMotion | null) => void;
  followSelection: (id: string, linkedMotion?: LinkedMotion | null) => void;
  reason: string | null;
  matrixRoot: RefObject<HTMLDivElement | null>;
};

function RecipeBack({ id, close, fallback }: { id: string; close: () => void; fallback: ReactNode }) {
  const { registry, page } = usePlatform();
  const menu = manifests[0];
  const context = useQueryContext();
  const panel = registry.panels(menu.id).find(panel => panel.id === id);
  if (!panel) return fallback;
  const isTrend = id === trend.id;
  const recipe = panelRecipe({ panel, menu, context: { ...context, ...Object.fromEntries(page), time: context.from && context.to },
    host: { add: false, pin: false, hide: isTrend, layout: true, maximize: true, range: isTrend },
    labels: {
      keys: { ...MESSAGES, [TREND_ITEM_KEY]: MESSAGES.trendItem, mode: MESSAGES.compareMode, ref: MESSAGES.referenceEquipment, core: MESSAGES.coreOnly, q: MESSAGES.search, levels: MESSAGES.levelOrder, hideSameCols: MESSAGES.hideSame },
      grains: { configItemEquipment: MESSAGES.configGrain, configItemEquipmentChange: MESSAGES.historyGrain },
      actions: { drill: MESSAGES.openTrend },
    },
  });
  return <PanelRecipeBack recipe={recipe} onClose={close} />;
}

export function ConfigurationWorkspace({ itemId, params, children }: {
  itemId: string | null; params: CompareParams; children: (actions: TrendActions) => ReactNode;
}) {
  const { registry, pageParam, resolveLink, setPage, session, revision, global } = usePlatform();
  const context = useQueryContext();
  const { tx } = useI18n();
  const m = useMessages(MESSAGES);
  const matrixRoot = useRef<HTMLDivElement>(null);
  const returnHwTrendFocus = useRef(false);
  const savedComparison = useHwTimeComparison(JSON.stringify([session.user.id, revision, global.scopeId]));
  const { comparison } = savedComparison;
  const hwKey = pageParam(HW_TREND_ITEM_KEY);
  // The URL owns the follow target, including while its mapping request is pending.
  const hwItem = hwKey === HW_TREND_CLOSED ? null : hwKey ?? itemId;
  const mappingItem = hwItem ?? (comparison ? itemId : null);
  const canMap = mappingItem !== null && registry.has('hw-time');
  const lending = useMenuQuery(configurationLendingEndpoint, { itemId: mappingItem ?? '', equipment: params.eq }, {
    enabled: canMap, keepPrevious: true,
  });
  const mapping = lending.showingPrevious ? null : lending.response;
  const { values, unmappedLabels, incomplete } = hwTimeTrendBinding(mapping?.outcome === 'ok' ? mapping.data : null, params.eq, context.selection);
  const verdict = useLentPanel(HW_TIME_TREND, values);
  const mappingFailed = mapping !== null && !isAnswered(mapping.outcome);
  let mappingReason: string | null = null;
  if (mappingFailed) mappingReason = mapping.outcome === 'forbidden' ? m('hwTimeMappingDenied') : m('hwTimeMappingFailed');
  else if (incomplete && verdict.reason?.kind !== 'not-registered') {
    mappingReason = unmappedLabels.length ? m('hwTimeUnmappedColumns', { columns: unmappedLabels.join(', ') }) : m('hwTimeUnmapped');
  }
  let reason = mappingReason;
  if ((values || mappingFailed) && verdict.reason?.kind === 'permission') {
    reason = tx(verdict.reason.text);
  } else if (!mappingReason && values && verdict.reason && verdict.reason.kind !== 'not-registered') {
    reason = tx(verdict.reason.text);
  }
  const showHwTime = hwItem !== null && verdict.allowed && Boolean(values?.equipmentIds?.length);
  const [explained, setExplained] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ panelId: string; seq: number; itemId: string; restoreHidden?: boolean; restoreLinked?: boolean } | null>(null);

  useEffect(() => {
    if (itemId) setReveal(current => current?.itemId === itemId ? current : { panelId: trend.id, itemId, seq: (current?.seq ?? 0) + 1 });
  }, [itemId]);
  // Explicitly reopening a trend can restore either panel after the user hid it in its workspace menu. The linked request goes out
  // in the render that first shows the panel, so a panel added when its mapping arrives counts as added with the reveal.
  const linkedReveal = reveal?.restoreLinked && itemId === reveal.itemId && showHwTime
    ? { panelId: HW_TIME_PANEL_ID, seq: reveal.seq + 1, itemId, restoreHidden: true } : null;
  useEffect(() => {
    if (linkedReveal) setReveal(current => current === reveal ? linkedReveal : current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `linkedReveal` is rebuilt each render; its seq and `reveal` identify it.
  }, [linkedReveal?.seq, reveal]);
  useEffect(() => {
    if (hwItem !== null || !returnHwTrendFocus.current) return;
    returnHwTrendFocus.current = false;
    const root = matrixRoot.current;
    const selected = root?.querySelector<HTMLElement>('[role="gridcell"][aria-selected="true"]');
    if (selected && !selected.closest('[hidden], [inert], [aria-hidden="true"]')
      && (typeof selected.checkVisibility !== 'function' || selected.checkVisibility({ visibilityProperty: true }))) {
      selected.focus();
    } else {
      focusPageFallback(root);
    }
  }, [hwItem]);

  function openTrend(id: string, linkedMotion?: LinkedMotion | null) {
    setPage({ [TREND_ITEM_KEY]: id, [HW_TREND_ITEM_KEY]: null });
    setReveal(current => ({ panelId: trend.id, itemId: id, seq: (current?.seq ?? 0) + 1, restoreHidden: true, restoreLinked: Boolean(linkedMotion) }));
  }
  function closeTrend() {
    setExplained(null);
    setPage({ [TREND_ITEM_KEY]: null, [HW_TREND_ITEM_KEY]: values && verdict.allowed ? hwItem : null });
  }
  function followSelection(id: string, linkedMotion?: LinkedMotion | null) {
    if (hwItem === null || hwItem === id || verdict.reason?.kind === 'not-registered') return;
    setPage({ [HW_TREND_ITEM_KEY]: linkedMotion ? id : itemId && HW_TREND_CLOSED }, { replace: true });
  }
  function closeHwTrend() {
    returnHwTrendFocus.current = true;
    setPage({ [HW_TREND_ITEM_KEY]: itemId && HW_TREND_CLOSED });
  }
  function lentPanel() {
    if (!verdict.allowed || !values?.equipmentIds?.length) return null;
    const link = resolveLink('hw-time', {
      global: { from: context.from, to: context.to, selection: values.equipmentIds },
      page: { moduleType: values.moduleType, drillModule: values.module, drillMotion: values.motion },
    });
    return <div data-configuration-lent-hwtime className="h-full min-h-0 min-w-0 break-keep">
      <LentPanel source={HW_TIME_TREND} values={values} actions={<>
        <OpenHwTimeLink link={link} />
        <Button size="icon-sm" variant="ghost" aria-label={m('closeHwTime')} onClick={closeHwTrend}><X className="size-4" /></Button>
      </>} />
    </div>;
  }
  function recipeFace(id: string, front: ReactNode) {
    return <PanelRecipeFrame open={explained === id} onClose={() => setExplained(null)}
      back={close => <RecipeBack id={id} close={close} fallback={front} />}>{front}</PanelRecipeFrame>;
  }

  const panels: PanelWorkspacePanel[] = [
    { id: matrix.id, title: matrix.title, primary: true, render: () => recipeFace(matrix.id, children({ openTrend, followSelection, reason, matrixRoot })) },
  ];
  if (itemId) panels.push({
    id: trend.id, title: trend.title, placement: TREND_ROW, preferredHeight: TREND_HEIGHT,
    render: () => recipeFace(trend.id, <TrendPanel key={itemId} itemId={itemId} params={params} close={closeTrend} />),
  });

  if (showHwTime) panels.push({
    id: HW_TIME_PANEL_ID, title: MESSAGES.hwTimeTrend, placement: TREND_ROW, preferredHeight: TREND_HEIGHT, render: lentPanel,
    // The lent trend writes `hwDays` as `hw-time/trend`, so a chip hover or focus outlines this panel and its tab (#2763 R C7).
    analysisSelectionSourceId: HW_TIME_TREND,
  });

  if (comparison) {
    const time = comparison.mode === 'hold' ? comparison.time : undefined;
    const range = time?.selection;
    let badge: Text | undefined;
    if (range?.shape === 'range' && historyPeriod(range)) {
      const period = { from: formatWallClock(range.from), to: formatWallClock(range.to) };
      badge = { ko: formatText(MESSAGES.hwTimeHeldPeriod, 'ko', period), en: formatText(MESSAGES.hwTimeHeldPeriod, 'en', period) };
    }
    const waiting = comparison.mode !== 'unreadable' && canMap && (lending.status === 'loading' || lending.showingPrevious === true);
    let comparisonReason = mappingReason;
    if (comparison.mode === 'unreadable') comparisonReason = m('hwTimeHeldUnreadable');
    else if (mappingItem === null || (mapping && !values)) comparisonReason ??= m('hwTimeComparisonNeedsMotion');
    panels.push({
      id: HW_TIME_COMPARISON_ID, title: MESSAGES.hwTimeComparison, placement: COMPARISON_ROW, preferredHeight: TREND_HEIGHT,
      badge: badge && { description: badge },
      analysisSelectionSourceId: HW_TIME_TREND,
      onRemove: savedComparison.close,
      render: () => <HwTimeComparison values={values} time={time} badge={badge} waiting={waiting} reason={comparisonReason}
        follow={comparison.mode === 'follow' ? undefined : savedComparison.follow} close={savedComparison.close} />,
    });
  }

  const period = historyPeriod(context);
  const addPeriod = showHwTime && period && (comparison === null || comparison.mode === 'follow') ? period : null;
  function addHwTime(draft: AnalysisPanelDraft) {
    if (draft.source !== HW_TIME_TREND || !hwItem) return;
    let panelId = HW_TIME_PANEL_ID;
    if (draft.mode === 'hold') {
      const range = draft.inputs[HOLD_TIME.holdTime.key];
      if (range?.shape !== 'range') return;
      savedComparison.hold(range);
      panelId = HW_TIME_COMPARISON_ID;
    }
    setReveal(current => ({ panelId, itemId: hwItem, seq: (current?.seq ?? 0) + 1, restoreHidden: true }));
    return panelId;
  }
  return <PanelWorkspace panels={panels} presets={PRESETS} initialPreset="comparison" initialMode="stack" compactBelow={0}
    persistKey="configuration-analysis" label={MESSAGES.conditions} revealRequest={linkedReveal ?? reveal}
    analysisPanelAddition={addPeriod ? {
      items: [{ id: HW_TIME_PANEL_ID, title: MESSAGES.hwTimeTrend, again: 'hold', slots: [HW_TIME_PANEL_ID, HW_TIME_COMPARISON_ID] }],
      hold: true,
      returnsOpened: true,
      toolbarDraft: () => ({ source: HW_TIME_TREND, inputs: { [HOLD_TIME.holdTime.key]: { shape: 'range', from: addPeriod.from, to: addPeriod.to } } }),
      onAdd: addHwTime,
    } : undefined}
    panelMenuItems={id => id === HW_TIME_PANEL_ID || id === HW_TIME_COMPARISON_ID ? [] : [{ id: 'recipe', label: PANEL_RECIPE_ITEM, onSelect: () => setExplained(id) }]} />;
}
