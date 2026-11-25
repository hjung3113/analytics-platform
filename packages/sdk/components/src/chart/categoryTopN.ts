import { formatText, type Lang } from '@ap/kernel';
import { canClientSum, type Reaggregation } from '@ap/contracts';
import { COMPONENTS_MESSAGES } from '../messages';
import type { ChartSeries } from './AnalysisChartFrame';

/** Opt-in ranking for category charts. The remainder, when shown, is an extra row. */
export type CategoryTopN = {
  count: number;
  /** Defaults to top. */
  direction?: 'top' | 'bottom';
  /** Defaults to value. Original uses input order (reversed for bottom). */
  sortBy?: 'value' | 'original';
  /** Defaults to true. Grouping requires the chart's reaggregation to be 'sum'. */
  other?: boolean;
};

export const REMAINDER_COLOR = 'chart-remainder';
export const validCategoryTopN = ({ count }: CategoryTopN) => Number.isSafeInteger(count) && count > 0;
export const categoryOtherBlocked = (options: CategoryTopN | undefined, reaggregation: Reaggregation | undefined) =>
  !!options && validCategoryTopN(options) && options.other !== false
    && (reaggregation === undefined || !canClientSum({ reaggregation }));
export const categoryOtherWarning = 'categoryTopN Other requires reaggregation="sum"; showing the ranked categories without Other.';
export const otherLabel = (lang: Lang) => formatText(COMPONENTS_MESSAGES.chartOther, lang);
export const otherGroupLabel = (lang: Lang, count: number) =>
  formatText(COMPONENTS_MESSAGES.chartOtherGroup, lang, { label: otherLabel(lang), count });

export function splitCategories<T>(ordered: readonly T[], count: number, { other }: { other: boolean }) {
  return { kept: ordered.slice(0, count), remainder: other ? ordered.slice(count) : [] };
}

/** Null and non-finite measurements are missing. An entirely missing group stays missing. */
export function sumCategoryValues<T>(items: readonly T[], valueOf: (item: T) => number | null | undefined) {
  let sum: number | null = null;
  for (const item of items) {
    const value = valueOf(item);
    if (value != null && Number.isFinite(value)) sum = (sum ?? 0) + value;
  }
  return sum;
}

export function rankCategories<T>(items: readonly T[], options: CategoryTopN, valueOf: (item: T) => number | null) {
  const { count, direction = 'top', sortBy = 'value', other = true } = options;
  if (sortBy === 'original') return splitCategories(direction === 'bottom' ? [...items].reverse() : items, count, { other });
  const sign = direction === 'bottom' ? 1 : -1;
  const ranked = items.map(item => ({ item, value: valueOf(item) })).sort((a, b) => {
    if (a.value === null) return a.value === b.value ? 0 : 1;
    if (b.value === null) return -1;
    return sign * (a.value - b.value);
  });
  return splitCategories(ranked.map(({ item }) => item), count, { other });
}

export function projectCategoryBars(categories: string[], series: ChartSeries[], options: CategoryTopN | undefined, lang: Lang) {
  const columns = series.map(s => {
    const values = new Map<string, number | null>();
    for (const [x, value] of s.points) if (!values.has(x)) values.set(x, value);
    return { series: s, values };
  });
  const { kept, remainder } = options
    ? rankCategories(categories, options, x => sumCategoryValues(columns, ({ values }) => values.get(x)))
    : { kept: categories, remainder: [] };
  let other: { key: string; label: string; groupLabel: string } | undefined;
  if (remainder.length) {
    const taken = new Set(categories);
    let key = '__categoryOther';
    while (taken.has(key)) key += '~';
    other = { key, label: otherLabel(lang), groupLabel: otherGroupLabel(lang, remainder.length) };
  }
  const displayed = columns.map(({ series: s, values }) => {
    const points: ChartSeries['points'] = kept.map(x => [x, values.get(x) ?? null]);
    if (other) points.push([other.key, sumCategoryValues(remainder, x => values.get(x))]);
    return { ...s, points };
  });
  return { categories: other ? [...kept, other.key] : kept, displayed, other, realCategories: kept };
}
