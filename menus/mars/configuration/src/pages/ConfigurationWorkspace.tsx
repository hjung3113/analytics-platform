import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { LentPanel, PlatformLink, useI18n, useLentPanel, useMessages, usePlatform, useQueryContext, type LinkResolution } from '@ap/kernel';
import { PANEL_RECIPE_ITEM, PanelRecipeBack, PanelRecipeFrame, PanelWorkspace, focusPageFallback, panelRecipe, type PanelWorkspacePanel, type PanelWorkspacePreset } from '@ap/components';
import { manifests } from '../index';
import { HW_TREND_CLOSED, HW_TREND_ITEM_KEY, TREND_ITEM_KEY, type CompareParams } from '../endpoints';
import { X } from 'lucide-react';
import { Button } from '@ap/ui';
import { HW_TIME_TREND, hasLinkedMotion, hwTimeTrendValues } from '../lentTrendMapping';
import { MESSAGES } from '../messages';
import { configurationPanels } from '../panels';
import { TrendPanel } from './TrendPanel';

const { matrix, trend } = configurationPanels;
const PRESETS: PanelWorkspacePreset[] = [{ id: 'comparison', label: MESSAGES.title, layout: { type: 'group', panels: [matrix.id], active: matrix.id } }];
const TREND_HEIGHT = 420;
const TREND_ROW = { row: 'trends' };
const HW_TIME_PANEL_ID = 'hw-time-trend';

export function OpenHwTimeLink({ link }: { link: LinkResolution }) {
  const m = useMessages(MESSAGES);
  if (link.kind === 'none') return null;
  if (!link.allowed) return <Button size="sm" variant="secondary" disabled title={m('hwTimeLinkDenied')} aria-description={m('hwTimeLinkDenied')}>{m('openHwTime')}</Button>;
  return <Button size="sm" variant="secondary" asChild><PlatformLink href={link.href}>{m('openHwTime')}</PlatformLink></Button>;
}

export type TrendActions = {
  openTrend: (id: string) => void;
  followSelection: (id: string) => void;
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
  const { pageParam, resolveLink, setPage } = usePlatform();
  const context = useQueryContext();
  const { tx } = useI18n();
  const m = useMessages(MESSAGES);
  const matrixRoot = useRef<HTMLDivElement>(null);
  const returnHwTrendFocus = useRef(false);
  const hwKey = pageParam(HW_TREND_ITEM_KEY);
  const hwItem = hwKey === HW_TREND_CLOSED ? null : hwKey ?? itemId;
  const values = hwTimeTrendValues(hwItem, params.eq, context);
  const verdict = useLentPanel(HW_TIME_TREND, values);
  const reason = values && !verdict.allowed && verdict.reason.kind !== 'not-registered' ? tx(verdict.reason.text) : null;
  const showHwTime = verdict.allowed && Boolean(values?.equipmentIds?.length);
  const [explained, setExplained] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ panelId: string; seq: number; itemId: string; restoreHidden?: boolean; restoreLinked?: boolean } | null>(null);

  useEffect(() => {
    if (itemId) setReveal(current => current?.itemId === itemId ? current : { panelId: trend.id, itemId, seq: (current?.seq ?? 0) + 1 });
  }, [itemId]);
  useEffect(() => {
    // Explicitly reopening a trend can restore either panel after the user hid it in its workspace menu.
    if (!reveal?.restoreLinked || itemId !== reveal.itemId || !showHwTime) return;
    setReveal(current => current === reveal ? { panelId: HW_TIME_PANEL_ID, seq: reveal.seq + 1, itemId, restoreHidden: true } : current);
  }, [itemId, reveal, showHwTime]);
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

  function openTrend(id: string) {
    setPage({ [TREND_ITEM_KEY]: id, [HW_TREND_ITEM_KEY]: null });
    setReveal(current => ({ panelId: trend.id, itemId: id, seq: (current?.seq ?? 0) + 1, restoreHidden: true, restoreLinked: hasLinkedMotion(id) }));
  }
  function closeTrend() {
    setExplained(null);
    setPage({ [TREND_ITEM_KEY]: null, [HW_TREND_ITEM_KEY]: values && verdict.allowed ? hwItem : null });
  }
  function followSelection(id: string) {
    if (!values || hwItem === id || verdict.reason?.kind === 'not-registered') return;
    setPage({ [HW_TREND_ITEM_KEY]: hasLinkedMotion(id) ? id : itemId && HW_TREND_CLOSED }, { replace: true });
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
  });

  return <PanelWorkspace panels={panels} presets={PRESETS} initialPreset="comparison" initialMode="stack" compactBelow={0}
    persistKey="configuration-analysis" label={MESSAGES.conditions} revealRequest={reveal}
    panelMenuItems={id => id === HW_TIME_PANEL_ID ? [] : [{ id: 'recipe', label: PANEL_RECIPE_ITEM, onSelect: () => setExplained(id) }]} />;
}
