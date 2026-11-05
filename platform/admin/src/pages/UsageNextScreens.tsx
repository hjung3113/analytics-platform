import { useId, useState } from 'react';
import { Inbox, Shield } from 'lucide-react';
import type { UsageNextScreens as NextScreens, UsageVia } from '@ap/contracts';
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { QueryView, StateMessage } from '@ap/components';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';

// Fixed bar/legend order. Direct entry is not a movement; all other ungrouped ways belong to Other.
const GROUPS = [
  { ko: '메뉴 탐색', en: 'Menu navigation', color: 'var(--color-chart-series-1)', swatch: 'bg-chart-series-1', vias: ['sidebar', 'switcher'] },
  { ko: '메뉴 검색', en: 'Menu search', color: 'var(--color-chart-series-2)', swatch: 'bg-chart-series-2', vias: ['palette'] },
  { ko: '화면 안 연결', en: 'In-screen links', color: 'var(--color-chart-series-3)', swatch: 'bg-chart-series-3', vias: ['crossLink', 'drill', 'link'] },
  { ko: '분석 보드', en: 'Analysis board', color: 'var(--color-cat-purple)', swatch: 'bg-cat-purple', vias: ['board'] },
  { ko: '기타', en: 'Other', color: 'var(--color-chart-series-4)', swatch: 'bg-chart-series-4', vias: [] },
] as const;
const VIA_LABELS: Record<UsageVia, { ko: string; en: string }> = {
  sidebar: { ko: '사이드바', en: 'Sidebar' }, switcher: { ko: '전환기', en: 'Switcher' },
  palette: { ko: '메뉴 검색', en: 'Menu search' }, board: { ko: '분석 보드', en: 'Analysis board' },
  crossLink: { ko: '메뉴 간 연결', en: 'Cross-menu link' }, drill: { ko: '드릴', en: 'Drill' },
  link: { ko: '링크', en: 'Link' }, history: { ko: '뒤로·앞으로', en: 'Back / forward' },
  return: { ko: '복귀', en: 'Return' }, direct: { ko: '직접 진입', en: 'Direct entry' },
  paneOpen: { ko: '패널 열기', en: 'Open pane' }, paneReplace: { ko: '패널 바꾸기', en: 'Replace pane' },
};
const groupFor = (via: string) => {
  const index = GROUPS.findIndex(group => (group.vias as readonly string[]).includes(via));
  return index < 0 ? 4 : index;
};
const percent = (value: number, total: number) => `${(total ? value / total * 100 : 0).toFixed(1)}%`;
function groupCounts(vias: Partial<Record<UsageVia, number>>): number[] {
  const values = GROUPS.map(() => 0);
  for (const [via, count] of Object.entries(vias)) {
    if (via === 'direct') continue;
    values[groupFor(via)] += count ?? 0;
  }
  return values;
}
/** Decorative widths only; the adjacent text carries every value. */
function StackedBar({ values, colors, scale = 100, destination = false }: { values: number[]; colors: readonly string[]; scale?: number; destination?: boolean }) {
  const total = values.reduce((sum, count) => sum + count, 0);
  return <svg aria-hidden="true" className="block h-2 w-full" viewBox="0 0 100 8" preserveAspectRatio="none">
    <rect width="100" height="8" fill="var(--color-surface-sunken)" />
    <svg width={`${scale}%`} height="8" data-destination-bar={destination ? '' : undefined}>
      {values.map((value, i) => <rect key={i} x={`${values.slice(0, i).reduce((sum, n) => sum + n, 0) / (total || 1) * 100}%`} width={`${value / (total || 1) * 100}%`} height="8" fill={colors[i]} />)}
    </svg>
  </svg>;
}

export default function UsageNextScreens({ menuId }: { menuId: string }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter } = usePlatform();
  const [includeBack, setIncludeBack] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const switchId = useId();
  const listId = useId();
  const query = usePlatformQuery<NextScreens>(signal => adapter.usageNextScreens({ menuId, includeBack }, signal), { menuId, includeBack }, true, 'session');
  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="t-card-title">{ko ? '다음으로 간 화면' : 'Next screens'}</h3>
      <label htmlFor={switchId} className="flex items-center gap-2 text-xs">
        <Button id={switchId} role="switch" aria-checked={includeBack} aria-label={ko ? '뒤로 가기·복귀 포함' : 'Include back and return'} variant="secondary" size="sm" onClick={() => { setIncludeBack(!includeBack); setExpanded(false); }}>{includeBack ? (ko ? '켜짐' : 'On') : (ko ? '꺼짐' : 'Off')}</Button>
        {ko ? '뒤로 가기·복귀 포함' : 'Include back and return'}
      </label>
    </div>
    <QueryView query={query} widgetName={ko ? '다음으로 간 화면' : 'Next screens'}>{data => <NextScreenResult data={data} expanded={expanded} onExpand={() => setExpanded(true)} listId={listId} />}</QueryView>
  </div>;
}

function NextScreenResult({ data, expanded, onExpand, listId }: { data: NextScreens; expanded: boolean; onExpand: () => void; listId: string }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { registry } = usePlatform();
  if (data.masked) return <StateMessage icon={<Shield aria-hidden />} title={ko ? '3명 미만이 쓴 메뉴라 이동 경로를 공개하지 않습니다' : 'Movement paths are withheld because fewer than 3 users used this menu'} />;
  if (data.entries === 0) return <StateMessage icon={<Inbox aria-hidden />} title={ko ? '기록된 진입이 없습니다' : 'No entries recorded'} />;
  const summary = [data.summary.moved, data.summary.sameMenu, data.summary.backOrReturn, data.summary.noMove];
  const summaryTotal = summary.reduce((sum, count) => sum + count, 0);
  const summaryLabels = ko ? ['다른 메뉴로 이동', '같은 메뉴 안', '뒤로·복귀', '이후 메뉴 이동 없음'] : ['Another menu', 'Same menu', 'Back / return', 'No subsequent menu move'];
  const summaryColors = [GROUPS[0].color, GROUPS[2].color, GROUPS[1].color, GROUPS[4].color];
  const returned = data.next.slice(0, 20);
  const visible = returned.slice(0, expanded ? 20 : 5);
  const max = Math.max(1, ...visible.map(row => row.count));
  const viaTotals = new Map<UsageVia, number>();
  returned.forEach(row => (Object.entries(row.vias) as [UsageVia, number][]).forEach(([via, count]) => { if (via !== 'direct' && count > 0) viaTotals.set(via, (viaTotals.get(via) ?? 0) + count); }));
  const totals = GROUPS.map(() => 0);
  returned.forEach(row => groupCounts(row.vias).forEach((count, i) => { totals[i] += count; }));
  return <div className="flex min-w-0 flex-col gap-4">
    <section aria-label={ko ? '진입 후 이동 요약' : 'Entry movement summary'} className="flex flex-col gap-2">
      <p className="text-xs text-text-secondary">{ko ? `본 화면 진입 ${data.entries.toLocaleString(lang)}건` : `${data.entries.toLocaleString(lang)} entries into this screen`}</p>
      <StackedBar values={summary} colors={summaryColors} />
      <ul className="grid grid-cols-2 gap-2 text-xs">
        {summary.map((count, i) => <li key={i} className="flex flex-col gap-1">
          <div className="flex items-start gap-1"><span aria-hidden className={`mt-0.5 size-2.5 shrink-0 ${GROUPS[[0, 2, 1, 4][i]].swatch}`} />{i === 3 ? <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="w-fit text-left underline decoration-dotted underline-offset-2">{summaryLabels[i]}</button></TooltipTrigger><TooltipContent portal size="sm">{ko ? '새로고침, 새 탭, 분석 보드 진입 때도 이동 기록이 끊깁니다. 3명 미만의 이동도 여기에 포함됩니다.' : 'Refresh, a new tab, or entering a board also breaks the movement record. Movements by fewer than 3 users are also included here.'}</TooltipContent></Tooltip></TooltipProvider> : <span>{summaryLabels[i]}</span>}</div>
          <span className="tabular text-text-secondary">{ko ? `${count}건` : `${count} moves`} · {percent(count, summaryTotal)}</span>
        </li>)}
      </ul>
    </section>
    {viaTotals.size > 0 && <ul aria-label={ko ? '이동 방식 범례' : 'Movement legend'} className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
      {GROUPS.map((group, i) => <li key={group.en} className="flex items-center gap-1"><span aria-hidden className={`size-2.5 shrink-0 ${group.swatch}`} />{group[lang]}<span className="tabular">{ko ? `${totals[i]}건` : `${totals[i]} moves`}</span></li>)}
    </ul>}
    {visible.length > 0 ? <ol id={listId} aria-label={ko ? '다음으로 간 화면 순위' : 'Next screen ranking'} className="flex flex-col">
      {visible.map((row, i) => {
        const label = registry.menus.find(menu => menu.id === row.menuId)?.label[lang] ?? row.menuId;
        const counts = groupCounts(row.vias);
        const hasBreakdown = Object.keys(row.vias).length > 0;
        return <li key={row.menuId} className="flex min-h-14 flex-col justify-center gap-1 border-b border-border-subtle py-2">
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs"><span className="min-w-0 truncate" title={label}><span className="mr-2 tabular text-text-muted">{i + 1}</span>{label}</span><span className="shrink-0 tabular">{ko ? `${row.count}건` : `${row.count} moves`}{hasBreakdown && ` · ${percent(row.count, data.entries)}`}</span></div>
          {hasBreakdown && <StackedBar values={counts} colors={GROUPS.map(group => group.color)} scale={row.count / max * 100} destination />}
          <p className="text-xs text-text-secondary">{ko ? `방문 사용자 ${row.distinctUsers}명` : `${row.distinctUsers} users`}{counts.map((count, j) => count > 0 ? ` · ${GROUPS[j][lang]} ${count}` : '').join('')}</p>
        </li>;
      })}
    </ol> : data.hiddenDestinations === 0 ? <StateMessage icon={<Inbox aria-hidden />} title={ko ? '다음 화면 이동이 없습니다' : 'No next-screen moves'} /> : null}
    {visible.some(row => Object.keys(row.vias).length === 0) && <p className="text-xs text-text-muted">{ko ? '방식별 분포는 3명 미만 구간이 있어 숨겼습니다' : 'Movement breakdowns are hidden because some groups have fewer than 3 users'}</p>}
    {data.hiddenDestinations > 0 && <p className="text-xs text-text-secondary">{ko ? `3명 미만 목적지 ${data.hiddenDestinations}개` : `${data.hiddenDestinations} destinations with fewer than 3 users`}</p>}
    {!expanded && returned.length > 5 && <Button variant="secondary" size="sm" aria-expanded={false} aria-controls={listId} onClick={onExpand}>{ko ? '더 보기' : 'Show more'}</Button>}
    {viaTotals.size > 0 && <section className="flex flex-col gap-2">
      <h3 className="t-card-title">{ko ? '전체 이동 방식' : 'All movement methods'}</h3>
      <ul aria-label={ko ? '전체 이동 방식' : 'All movement methods'} className="flex flex-col gap-1 text-xs">
        {[...viaTotals].sort((a, b) => b[1] - a[1]).map(([via, count]) => <li key={via} className="flex items-center justify-between gap-2 rounded-sm bg-surface-sunken px-2 py-1"><span className="flex items-center gap-2"><span aria-hidden className={`size-2.5 ${GROUPS[groupFor(via)].swatch}`} />{VIA_LABELS[via][lang]}</span><span className="tabular">{ko ? `${count}건` : `${count} moves`}</span></li>)}
      </ul>
    </section>}
  </div>;
}
