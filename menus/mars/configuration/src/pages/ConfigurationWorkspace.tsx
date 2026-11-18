import { useEffect, useState, type ReactNode } from 'react';
import { usePlatform, useQueryContext } from '@ap/kernel';
import { PANEL_RECIPE_ITEM, PanelRecipeBack, PanelRecipeFrame, PanelWorkspace, panelRecipe, type PanelWorkspacePanel, type PanelWorkspacePreset } from '@ap/components';
import { manifests } from '../index';
import { TREND_ITEM_KEY, type CompareParams } from '../endpoints';
import { MESSAGES } from '../messages';
import { configurationPanels } from '../panels';
import { TrendPanel } from './TrendPanel';

const { matrix, trend } = configurationPanels;
const PRESETS: PanelWorkspacePreset[] = [{ id: 'comparison', label: MESSAGES.title, layout: { type: 'group', panels: [matrix.id], active: matrix.id } }];
const TREND_HEIGHT = 420;

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
  itemId: string | null; params: CompareParams; children: (openTrend: (id: string) => void) => ReactNode;
}) {
  const { setPage } = usePlatform();
  const [explained, setExplained] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ panelId: string; seq: number; itemId: string; restoreHidden?: boolean } | null>(null);

  useEffect(() => {
    if (itemId) setReveal(current => current?.itemId === itemId ? current : { panelId: trend.id, itemId, seq: (current?.seq ?? 0) + 1 });
  }, [itemId]);

  function openTrend(id: string) {
    setPage({ [TREND_ITEM_KEY]: id });
    setReveal(current => ({ panelId: trend.id, itemId: id, seq: (current?.seq ?? 0) + 1, restoreHidden: true }));
  }
  function closeTrend() {
    setExplained(null);
    setPage({ [TREND_ITEM_KEY]: null });
  }
  function recipeFace(id: string, front: ReactNode) {
    return <PanelRecipeFrame open={explained === id} onClose={() => setExplained(null)}
      back={close => <RecipeBack id={id} close={close} fallback={front} />}>{front}</PanelRecipeFrame>;
  }

  const panels: PanelWorkspacePanel[] = [
    { id: matrix.id, title: matrix.title, primary: true, render: () => recipeFace(matrix.id, children(openTrend)) },
  ];
  if (itemId) panels.push({
    id: trend.id, title: trend.title, placement: 'below', preferredHeight: TREND_HEIGHT,
    render: () => recipeFace(trend.id, <TrendPanel key={itemId} itemId={itemId} params={params} close={closeTrend} />),
  });

  return <PanelWorkspace panels={panels} presets={PRESETS} initialPreset="comparison" initialMode="stack" compactBelow={0}
    persistKey="configuration-analysis" label={MESSAGES.conditions} revealRequest={reveal}
    panelMenuItems={id => [{ id: 'recipe', label: PANEL_RECIPE_ITEM, onSelect: () => setExplained(id) }]} />;
}
