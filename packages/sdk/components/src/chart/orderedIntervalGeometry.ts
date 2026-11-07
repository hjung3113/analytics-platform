import type { OrderedTrackItem } from './orderedIntervalTypes';
export const ORDER_GUTTER = 112;
export const ORDER_ROW_HEIGHT = 24;
export function orderX(order: number, view: [number, number], plotWidth: number) {
  return ORDER_GUTTER + ((order - view[0]) / (view[1] - view[0])) * plotWidth;
}
export function orderTicks(view: [number, number], width: number) {
  const desired = (view[1] - view[0]) / Math.max(1, Math.floor(width / 100));
  const power = 10 ** Math.floor(Math.log10(desired));
  const step = Math.max(1, ([1, 2, 5, 10].find((n) => n * power >= desired) ?? 10) * power);
  const ticks: number[] = [];
  for (let n = Math.ceil(view[0] / step) * step; n <= view[1] && ticks.length < 100; n += step)
    ticks.push(n);
  return ticks;
}
export function visibleOrderedItems(
  items: readonly OrderedTrackItem[],
  view: [number, number],
  laneKeys: readonly string[],
) {
  const keys = new Set(laneKeys);
  return items.filter(
    (item) =>
      keys.has(item.laneKey) &&
      item.orderStart <= view[1] &&
      (item.kind === 'point' ? item.orderStart : (item.orderEnd ?? view[1])) >= view[0],
  );
}
export function intervalShape(item: OrderedTrackItem, view: [number, number], width: number) {
  const x = Math.max(ORDER_GUTTER, orderX(item.orderStart, view, width));
  const end = Math.min(ORDER_GUTTER + width, orderX(item.orderEnd ?? view[1], view, width));
  const barWidth = Math.max(1.5, end - x);
  return {
    x,
    width: barWidth,
    open: item.kind !== 'point' && item.orderEnd === undefined,
    outline: end - x >= 4,
  };
}
export function validOrderDomain(domain: [number, number]) {
  return (
    domain.every(Number.isFinite) && domain[0] < domain[1] && Number.isFinite(domain[1] - domain[0])
  );
}
export function clampOrderView(
  range: [number, number],
  domain: [number, number],
): [number, number] {
  if (!validOrderDomain(range)) return domain;
  const span = Math.max(
    Math.min(1, domain[1] - domain[0]),
    Math.min(domain[1] - domain[0], range[1] - range[0]),
  );
  const from = Math.max(domain[0], Math.min(domain[1] - span, range[0]));
  return [from, from + span];
}
export function validOrderedItems(items: readonly OrderedTrackItem[]) {
  const ids = new Set<string>();
  return items.filter((item) => {
    if (
      ids.has(item.id) ||
      !Number.isFinite(item.orderStart) ||
      (item.orderEnd !== undefined &&
        (!Number.isFinite(item.orderEnd) || item.orderEnd < item.orderStart))
    )
      return false;
    ids.add(item.id);
    return true;
  });
}

/** Tooltip coordinates are viewport-relative; callers render outside paint containment. */
export function orderedTooltipPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const left = x + 12 + width > viewportWidth - 8 ? x - width - 12 : x + 12;
  return {
    left: Math.max(8, Math.min(viewportWidth - width - 8, left)),
    top: Math.max(8, Math.min(viewportHeight - height - 8, y + 12)),
  };
}
export function visiblePartialGaps(
  gaps: readonly { orderStart: number; orderEnd: number }[] | undefined,
  view: [number, number],
) {
  return (gaps ?? [])
    .filter(
      (gap) =>
        validOrderDomain([gap.orderStart, gap.orderEnd]) &&
        gap.orderStart < view[1] &&
        gap.orderEnd > view[0],
    )
    .map((gap) => ({
      orderStart: Math.max(view[0], gap.orderStart),
      orderEnd: Math.min(view[1], gap.orderEnd),
    }));
}
