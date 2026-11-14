import { PlatformLink, usePlatform, usePlatformQuery } from '@ap/kernel';
import type { Origin } from '../endpoints';
import { useCopy } from '../copy';
import { originPeriod } from '../model';
import { originLinkOptions } from '../origin';

/** Read the existing catalog endpoint through the adapter; no cross-menu import or fixture name table. */
export function OriginSummary({ origin }: { origin: Origin }) {
  const c = useCopy(), { registry, adapter, resolveLink } = usePlatform();
  const metricId = typeof origin.context.metricId === 'string' ? origin.context.metricId : null;
  const version = typeof origin.context.metricVersion === 'string' ? origin.context.metricVersion : null;
  const query = usePlatformQuery<unknown>(signal => adapter.menuQuery({ endpoint: 'metrics.definition', context: {}, params: { metricId, version } }, signal), { metricId, version }, !!metricId && !origin.restricted, 'session');
  const data = query.status === 'done' && query.response?.outcome === 'ok' ? query.response.data : null;
  if (origin.restricted) return <p className="text-sm text-text-secondary">{c.restrictedDetail}</p>;
  let menuName = c.unknownMenu, source: string | null = null;
  try {
    menuName = registry.menuById(origin.menuId).label[c.lang];
    const result = resolveLink(origin.menuId, originLinkOptions(origin));
    if (result.allowed) source = result.href;
  } catch { /* Retired source menus keep a neutral label and the stored Context. */ }
  const metricName = metricId ? catalogName(data, c.lang) ?? c.unknownMetric : c.unset;
  const selection = Array.isArray(origin.context.selection) ? origin.context.selection.filter((id): id is string => typeof id === 'string') : [];
  const rooms = Array.isArray(origin.context.roomNames) ? origin.context.roomNames.filter((name): name is string => typeof name === 'string') : [];
  const entries = [
    [c.sourceMenu, menuName],
    [c.metric, version ? `${metricName} · v${version.replace(/^v/, '')}` : metricName],
    [c.period, originPeriod(origin.context, c.lang)],
    [c.selection, selection.length ? selection.join(' · ') : c.unset],
    ...(rooms.length ? [[c.process, rooms.join(' · ')]] : []),
  ];
  return <><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">{entries.map(([label, value]) => <div key={label} className="contents"><dt className="text-text-secondary">{label}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}</dl>
    {source ? <PlatformLink className="text-xs text-accent-primary hover:underline" href={source}>{c.openAnalysis}</PlatformLink> : <p className="text-sm text-text-secondary">{c.sourceUnavailable}</p>}
  </>;
}
function catalogName(data: unknown, lang: 'ko' | 'en'): string | null {
  if (!data || typeof data !== 'object' || !('metric' in data)) return null;
  const metric = data.metric;
  if (!metric || typeof metric !== 'object' || !('name' in metric)) return null;
  const name = metric.name;
  if (!name || typeof name !== 'object' || !(lang in name)) return null;
  const value = (name as Record<string, unknown>)[lang];
  return typeof value === 'string' && value.trim() ? value : null;
}
