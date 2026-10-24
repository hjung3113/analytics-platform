/**
 * HW Time 단계별 (ADR-0078, 06 §12.7): Module → Motion drill where the body is replaced per level, a pinned summary line,
 * an Inspector `stack` (target / legend / options) and a collapsible daily trend under the detail hero. No PanelWorkspace.
 * The page owns the single level query; Inspector sections only render what it passes in (ADR-0080).
 */
import { ChevronDown, Inbox, ListTree, SlidersHorizontal, Target } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useDrill, useI18n, usePlatform, type PageProps } from '@ap/kernel';
import { DrillLayout, Inspector, LegendTree, PlatformPage, QueryView, SegmentedRadio, StateMessage, type InspectorSection } from '@ap/components';
import { Button, cn } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_MAX_TREND_ROWS, HW_TIME_UNIT, isHwTimeRowId, type HwTimeBlock, type HwTimeDrill, type HwTimeLevelData } from '../../endpoints';
import { useHwTimeLevel, useHwTimeTrend } from '../../shared/data';
import { formatSeconds, missingText } from '../../shared/format';
import { StackPanel, type StackSort } from '../../shared/panels/StackPanel';
import { TrendPanel } from '../../shared/panels/TrendPanel';
import { formatTrendKey, parseTrendKey } from '../../shared/trendKey';

const SORTS: readonly StackSort[] = ['total-desc', 'total-asc'];

/** The block the body draws: the whole response at L1/L2, the selected Motion's detail at L3. */
function bodyBlock(data: HwTimeLevelData): HwTimeBlock {
  return data.level === 2 ? data.detail ?? { series: [], rows: [], totals: { values: {}, total: null } } : data;
}

export default function StepsPage(_props: PageProps) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage } = usePlatform();
  const drill = useDrill();
  const module = drill.levels[0]?.value ?? null;
  const motion = drill.levels[1]?.value ?? null;
  const params: HwTimeDrill = { ...(module ? { drillModule: module } : {}), ...(module && motion ? { drillMotion: motion } : {}) };
  const levelQ = useHwTimeLevel(params, drill.invalid === null);

  const trendRows = useMemo(() => parseTrendKey(pageParam('trend')), [pageParam]);
  const trendQ = useHwTimeTrend(trendRows, trendRows.length > 0);

  const rawSort = pageParam('sort');
  const sort: StackSort = SORTS.includes(rawSort as StackSort) ? rawSort as StackSort : null;

  const levelKey = `${module ?? ''}/${motion ?? ''}`;
  const [hiddenState, setHiddenState] = useState<{ key: string; ids: string[] }>({ key: levelKey, ids: [] });
  const hidden = hiddenState.key === levelKey ? hiddenState.ids : [];

  const [trendOpen, setTrendOpen] = useState(trendRows.length > 0);
  const [lastCount, setLastCount] = useState(trendRows.length);
  if (lastCount !== trendRows.length) {
    setLastCount(trendRows.length);
    if (trendRows.length > lastCount) setTrendOpen(true);
    if (trendRows.length === 0) setTrendOpen(false);
  }
  const [notice, setNotice] = useState<string | null>(null);
  const trendId = useId();

  const response = levelQ.response?.outcome === 'ok' ? levelQ.response.data : null;
  const block = response ? bodyBlock(response) : null;
  const dataRows = block?.rows.filter(row => !row.auxiliary) ?? [];
  const selected = new Set(dataRows.map(row => row.equipmentId)).size;
  const evaluated = new Set(dataRows.filter(row => Object.values(row.values).some(value => value !== null)).map(row => row.equipmentId)).size;

  const addTrend = (rowId: string) => {
    if (!isHwTimeRowId(rowId) || trendRows.includes(rowId)) return;
    if (trendRows.length >= HW_TIME_MAX_TREND_ROWS) {
      setNotice(ko ? `추세는 최대 ${HW_TIME_MAX_TREND_ROWS}행까지 볼 수 있습니다.` : `The trend shows at most ${HW_TIME_MAX_TREND_ROWS} rows.`);
      return;
    }
    setNotice(null);
    setPage({ trend: formatTrendKey([...trendRows, rowId]) });
  };
  const removeTrend = (rowId: string) => {
    if (!trendRows.includes(rowId)) return;
    setNotice(null);
    setPage({ trend: formatTrendKey(trendRows.filter(id => id !== rowId)) });
  };
  // Frame point actions are fixed per chart (SDK gap), so one toggle acts on the selected row's current state.
  const toggleTrend = (rowId: string) => (trendRows.includes(rowId) ? removeTrend(rowId) : addTrend(rowId));

  const legendTotal = block?.series.length ?? 0;
  const legendShown = block ? block.series.filter(item => !hidden.includes(item.id)).length : 0;
  const sortText = sort === 'total-desc' ? { ko: '정렬: 큰 순', en: 'Sort: high' } : sort === 'total-asc' ? { ko: '정렬: 작은 순', en: 'Sort: low' } : { ko: '정렬: 기본', en: 'Sort: default' };

  const sections: InspectorSection[] = [
    {
      id: 'target', title: { ko: '분석 대상', en: 'Target' }, icon: Target,
      summary: block ? { ko: `선택 ${selected} · 평가 ${evaluated}`, en: `Selected ${selected} · Evaluated ${evaluated}` } : undefined,
      render: () => block
        ? <p className="t-caption text-text-secondary">{ko ? `선택 ${selected} · 평가 ${evaluated}` : `Selected ${selected} · Evaluated ${evaluated}`}</p>
        : <p className="t-caption text-text-muted">{ko ? '불러오는 중입니다.' : 'Loading.'}</p>,
    },
    {
      id: 'legend', title: { ko: '계층 범례', en: 'Legend' }, icon: ListTree,
      summary: block ? { ko: `${legendTotal}개 중 ${legendShown}개 표시`, en: `${legendShown} of ${legendTotal} shown` } : undefined,
      render: () => {
        const series = block?.series ?? [];
        const visible = new Set(series.map(item => item.id).filter(id => !hidden.includes(id)));
        return <LegendTree label={ko ? '계층 범례' : 'Legend'}
          nodes={series.map(item => ({ id: item.id, label: item.name, color: item.color as ThemeColorToken }))}
          visible={visible}
          onVisibleChange={next => setHiddenState({ key: levelKey, ids: series.map(item => item.id).filter(id => !next.has(id)) })}
          emptyText={ko ? '표시할 범례가 없습니다.' : 'No legend to show.'} />;
      },
    },
    {
      id: 'options', title: { ko: '옵션', en: 'Options' }, icon: SlidersHorizontal, summary: sortText,
      render: () => <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <span id="hw-sort-label" className="font-medium text-text-secondary">{ko ? '정렬' : 'Sort'}</span>
          <SegmentedRadio labelledBy="hw-sort-label" label={ko ? '정렬' : 'Sort'} value={sort ?? 'none'}
            onChange={next => setPage({ sort: next === 'none' ? null : next })}
            options={[{ value: 'none', label: ko ? '기본' : 'Default' }, { value: 'total-desc', label: ko ? '큰 순' : 'High' }, { value: 'total-asc', label: ko ? '작은 순' : 'Low' }]} />
        </div>
      </div>,
    },
  ];

  const unit = HW_TIME_UNIT[lang];
  const totalText = (shown: HwTimeBlock) => {
    const values = shown.rows.filter(row => !row.auxiliary).flatMap(row => Object.values(row.values));
    if (shown.rows.length === 0) return ko ? '기록 없음' : 'No records';
    const measured = values.filter((value): value is number => value !== null);
    if (measured.length === 0) return missingText(lang);
    const sum = `${formatSeconds(measured.reduce((a, b) => a + b, 0))} ${unit}`;
    return measured.length < values.length ? `${sum} · ${ko ? '일부 미측정' : 'partly not measured'}` : sum;
  };
  const summary = !response || !module ? undefined
    : motion ? `Module ${module} · Motion ${motion} · ${totalText(bodyBlock(response))}`
      : `Module ${module} · ${totalText(response)}`;

  const renderBody = (data: HwTimeLevelData) => {
    const shown = bodyBlock(data);
    if (data.level === 2 && shown.rows.length === 0) return <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={ko ? `${module} Module에는 ${motion} 동작 기록이 없습니다` : `No ${motion} records for Module ${module}`}
      body={ko ? 'Module의 다른 Motion은 한 단계 위에서 볼 수 있습니다.' : 'Other Motions of this Module are one level up.'} />;
    const chartTitle = data.level === 0 ? (ko ? 'Module별 동작시간' : 'Operation time by Module')
      : data.level === 1 ? (ko ? `Motion별 동작시간 — Module ${module}` : `Operation time by Motion — Module ${module}`)
        : (ko ? `Motion ${motion} 상세 — Module ${module}` : `Motion ${motion} detail — Module ${module}`);
    return <StackPanel chartId={`hw-time-steps-L${data.level + 1}`} title={chartTitle} block={shown}
      visibleSeriesIds={shown.series.map(item => item.id).filter(id => !hidden.includes(id))}
      onVisibleSeriesChange={ids => setHiddenState({ key: levelKey, ids: shown.series.map(item => item.id).filter(id => !ids.includes(id)) })}
      sort={sort}
      onActivate={data.level === 0 ? ({ seriesId }) => drill.enter('drillModule', seriesId)
        : data.level === 1 ? ({ seriesId }) => drill.enter('drillMotion', seriesId) : undefined}
      rowActions={data.level === 0 ? undefined : [
        { id: 'trend-toggle', label: ko ? '추세에 추가·제거' : 'Add to / remove from trend', keepsFocus: true, onSelect: toggleTrend },
      ]} />;
  };

  return <PlatformPage layout="fill">
    <div className="flex h-full min-h-0 gap-3">
      <aside className="w-64 shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <Inspector form="stack" persistKey="hw-time-steps" label={{ ko: '분석 보조', en: 'Analysis aids' }} sections={sections} />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-h-0 flex-[3] flex-col">
          <DrillLayout fill summary={summary}>
            <QueryView fill query={levelQ} widgetName={ko ? 'HW Time 단계별' : 'HW Time by level'} hideWidgetName skeletonRows={6}>
              {data => renderBody(data)}
            </QueryView>
          </DrillLayout>
        </div>
        <section aria-label={ko ? '추세' : 'Trend'} className={cn('flex min-h-0 flex-col rounded-lg border border-border-subtle bg-surface-card', trendOpen ? 'flex-[2]' : 'shrink-0')}>
          <Button type="button" variant="ghost" size="sm" aria-expanded={trendOpen} aria-controls={trendId} className="justify-start"
            onClick={() => setTrendOpen(open => !open)}>
            <ChevronDown aria-hidden className={cn('size-4 transition-transform', !trendOpen && '-rotate-90')} />
            {ko ? `추세 (${trendRows.length}행)` : `Trend (${trendRows.length} rows)`}
          </Button>
          <div id={trendId} hidden={!trendOpen} className="flex min-h-0 flex-1 flex-col gap-1 px-2 pb-2">
            {notice && <p role="status" className="t-caption text-text-warning-label">{notice}</p>}
            <TrendPanel chartId="hw-time-steps-trend" title={ko ? '행별 일 추세' : 'Daily trend by row'} rowIds={trendRows} query={trendQ} level={drill.depth} />
          </div>
        </section>
      </div>
    </div>
  </PlatformPage>;
}
