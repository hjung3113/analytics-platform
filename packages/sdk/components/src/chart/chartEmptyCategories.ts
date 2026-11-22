import type { CustomSeriesOption } from 'echarts/charts';
import type { ChartOptionInput } from './buildChartOption';

type EmptyCategoryInput = Pick<ChartOptionInput, 'horizontal' | 'xType' | 'categories' | 'displayed' | 'emptyCategoryLabel'>;
const LABEL_GAP = 4;
const LABEL_SIZE = 11;

/** No visible series is the Frame's all-series-off state. Zero is a displayed value. */
export function emptyCategoryLabels({ horizontal, xType, categories, displayed, emptyCategoryLabel }: EmptyCategoryInput) {
  if (!horizontal || xType !== 'category' || emptyCategoryLabel === undefined || !displayed.length) return;
  const withValues = new Set<string>();
  for (const series of displayed) {
    for (const [category, value] of series.points) {
      if (value != null) withValues.add(category);
    }
  }
  const labels = new Map<string, string>();
  for (const category of categories) {
    if (!withValues.has(category)) labels.set(category, emptyCategoryLabel);
  }
  return labels;
}

export function emptyCategorySeries(categories: readonly string[], labels: ReadonlyMap<string, string>, color: string): CustomSeriesOption {
  return {
    id: '__emptyCategoryLabel', type: 'custom', silent: true, animation: false, clip: true,
    tooltip: { show: false },
    // Encode only the category, so the text follows zoom without supplying a numeric axis value.
    encode: { x: -1, y: 0 },
    data: categories.flatMap((category, index) => labels.has(category) ? [[index]] : []),
    renderItem: (params, api) => {
      const grid = params.coordSys as { type: string; x: number; width: number };
      const index = Number(api.value(0));
      return { type: 'text', style: {
        x: grid.x + LABEL_GAP, y: api.coord([0, index])[1], text: labels.get(categories[index]),
        fill: color, fontSize: LABEL_SIZE, verticalAlign: 'middle',
        width: Math.max(0, grid.width - LABEL_GAP), overflow: 'truncate',
      } };
    },
  };
}
