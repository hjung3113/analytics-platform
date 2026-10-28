import { emptyGlobal, formatDateTime, formatMetricVersion, parseDateTime, withoutReturnTo, type ContextKey, type EquipmentAxisDescriptor, type GlobalContext, type Pair } from '@ap/contracts';
import { CONTEXT_LABELS, labelledCondition, RETURN_CONTEXT_LABELS, type Lang, type VocComposeContext, type VocComposeContextItem } from '@ap/kernel';
import type { HostPlatform } from '@ap/kernel/host';
import { buildShareLink } from '../context/shareLink';

/** What the freeze reads from the host: the main screen's route, Context and page pairs at the moment the drawer opens; `axes` and `asOf` (the localized membership-as-of text) read the Condition like the board header. */
export type VocFreezeInput = Pick<HostPlatform, 'route' | 'platformScreen' | 'global' | 'page' | 'absoluteUrl' | 'registry'> & { lang: Lang; axes: readonly EquipmentAxisDescriptor[]; asOf: string };

const TEXT = {
  ko: { screen: '화면', board: '분석 보드', granularity: '집계 단위', focus: '상세', none: '없음', more: (n: number) => `외 ${n}개` },
  en: { screen: 'Screen', board: 'Analysis board', granularity: 'Granularity', focus: 'Detail', none: 'None', more: (n: number) => `+${n} more` },
} as const;
const MAX_VALUES = 5;

function values(ids: readonly string[], text: (typeof TEXT)[Lang]): string {
  if (ids.length === 0) return text.none;
  const shown = ids.slice(0, MAX_VALUES).join(', ');
  return ids.length > MAX_VALUES ? `${shown} ${text.more(ids.length - MAX_VALUES)}` : shown;
}
/** Naive wall-clock text with minutes, from the stored `YYYY-MM-DDTHH:mm:ss`. */
const clock = (value: string) => formatDateTime(parseDateTime(value, 'time')).replace('T', ' ').slice(0, 16);

type SetField = 'roomNames' | 'lineNames' | 'prcGroups' | 'selection' | 'lotIds' | 'recipeIds';

/**
 * Freezes the Context the VOC drawer attaches (ADR-0070 decision 5, 06 §8) as removable chips, minus the `removed` chip ids.
 * `href` is rebuilt from the raw frozen Context and page pairs of the kept chips only, never from display values or the live URL;
 * `extras` are not attached. Removing the `menu` chip drops `href`; `spaceId`/`menuId` always describe the frozen screen (defaults only, never attached).
 */
export function freezeVocContext(input: VocFreezeInput, removed: ReadonlySet<string> = new Set()): VocComposeContext {
  const text = TEXT[input.lang];
  const { route, global, registry } = input;
  // `returnTo` is navigation state (the way back), not screen Context: it is neither a chip nor part of the attached address (#760).
  const page = withoutReturnTo(input.page);
  const basis = global.membershipBasis === 'asOf' ? ` · ${input.asOf}` : '';
  if (input.platformScreen === 'board' || route === null) {
    return { items: removed.has('menu') ? [] : [{ id: 'menu', label: text.screen, value: text.board }], href: null, spaceId: null, menuId: null, carried: {} };
  }
  const space = registry.spaceOf(route.menu);
  const menuLabel = route.menu.label[input.lang];
  const items: VocComposeContextItem[] = removed.has('menu') ? [] : [{ id: 'menu', label: text.screen, value: space === null ? menuLabel : `${space.label[input.lang]} · ${menuLabel}` }];

  const keptPage: Pair[] = [];
  const pageKeys = [...new Set(page.map(([key]) => key))];
  for (const key of pageKeys) {
    const id = `page:${key}`;
    if (removed.has(id)) continue;
    const pairs = page.filter(([pairKey]) => pairKey === key);
    keptPage.push(...pairs);
    items.push({ id, label: key === 'granularity' ? text.granularity : key === 'focus' ? text.focus : key, value: pairs.map(([, value]) => value).join(', ') });
  }

  const kept: GlobalContext = { ...emptyGlobal };
  const keep = <K extends keyof GlobalContext>(id: string, fields: readonly K[], item: () => VocComposeContextItem | null) => {
    if (removed.has(id)) return;
    const chip = item();
    if (chip === null) return;
    items.push(chip);
    for (const field of fields) kept[field] = global[field];
  };
  const idSet = (field: SetField, label: ContextKey, extra: readonly 'membershipBasis'[] = []) => keep(`global:${field}`, [field, ...extra], () => {
    const ids = global[field];
    return ids === null ? null : { id: `global:${field}`, label: CONTEXT_LABELS[label][input.lang], value: values(ids, text) + (field === 'prcGroups' ? basis : '') };
  });

  keep('period', ['from', 'to'], () => global.from === null || global.to === null ? null : { id: 'period', label: CONTEXT_LABELS.time[input.lang], value: `${clock(global.from)} – ${clock(global.to)}` });
  idSet('roomNames', 'roomNames');
  idSet('lineNames', 'line');
  // The membership basis belongs to the Condition, or to the PRC groups when there is no Condition.
  idSet('prcGroups', 'prcGroup', global.condition === null ? ['membershipBasis'] : []);
  keep('global:condition', ['condition', 'membershipBasis'], () => global.condition === null ? null : { id: 'global:condition', label: CONTEXT_LABELS.condition[input.lang], value: labelledCondition(global.condition, input.axes, input.lang) + basis });
  idSet('selection', 'selection');
  idSet('lotIds', 'lot');
  keep('global:ppid', ['ppid'], () => global.ppid === null ? null : { id: 'global:ppid', label: CONTEXT_LABELS.ppid[input.lang], value: global.ppid });
  idSet('recipeIds', 'recipe');
  keep('global:metricId', ['metricId', 'metricVersion'], () => global.metricId === null ? null : { id: 'global:metricId', label: CONTEXT_LABELS.metric[input.lang], value: global.metricVersion === null ? global.metricId : `${global.metricId} ${formatMetricVersion(global.metricVersion)}` });
  keep('global:scopeId', ['scopeId'], () => global.scopeId === null ? null : { id: 'global:scopeId', label: RETURN_CONTEXT_LABELS.scope[input.lang], value: global.scopeId });

  // The same serializer as the share control; a repro link has no length bound of its own.
  const shared = removed.has('menu') ? null : buildShareLink({ kind: 'conditions', route, global: kept, page: keptPage, absoluteUrl: input.absoluteUrl, maxLength: Number.POSITIVE_INFINITY });
  const href = shared?.ok ? shared.href : null;
  // The raw page pairs, not the kept list: a removed chip does not change which values the frozen screen carried.
  const carried: Record<string, string> = {};
  for (const key of input.registry.carrySetOf(route.menu)?.pageKeys ?? []) {
    const pair = page.find(([pairKey]) => pairKey === key);
    if (pair) carried[key] = pair[1];
  }
  return { items, href, spaceId: space?.id ?? null, menuId: route.menu.id, carried };
}
