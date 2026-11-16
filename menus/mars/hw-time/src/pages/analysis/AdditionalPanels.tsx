import { useEffect, useMemo, useRef } from 'react';
import { useI18n, useMenuQuery, useMessages, usePlatform } from '@ap/kernel';
import { PlatformDataTable, QueryView, RowAction, type PlatformColumn } from '@ap/components';
import { StatusBadge } from '@ap/ui';
import { ChartScatter } from 'lucide-react';
import { HW_TIME_MODULE_TYPES, HW_TIME_UNIT, hwTimeOverview, type HtmStatus, type HwTimeMotionStats } from '../../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { formatSeconds, missingText } from '../../shared/format';
import { htmStatusText, htmStatusView } from '../../shared/htm';
import type { HwTimeFilter } from '../../shared/useHwTimeFilter';
import { RunPanel } from './RunPanel';

type MotionRow = HwTimeMotionStats['rows'][number];
function MotionTable({ data, filter, moduleId, motionId, onMotion }: { data: HwTimeMotionStats; filter: HwTimeFilter; moduleId: string; motionId: string | null; onMotion: (motionId: string) => void }) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { lang } = useI18n();
  const rows = useMemo(() => data.rows.filter(row => filter.motions.includes(row.motion)), [data.rows, filter.motions]);
  // Stable columns keep the focused Motion link mounted across the drill write (a new cell function remounts it).
  const drill = useRef(onMotion);
  useEffect(() => { drill.current = onMotion; }, [onMotion]);
  const columns = useMemo<PlatformColumn<MotionRow>[]>(() => {
    const valueText = (value: number | null) => value === null ? missingText(lang) : `${formatSeconds(value, lang)} ${HW_TIME_UNIT[lang]}`;
    return [
    // The Motion name is the drill link (no separate action column), so the four columns fit the half-width panel at 1280 wide.
    { id: 'motion', header: m('motions'), value: row => row.motion, hideable: false, size: 100,
      cell: row => <RowAction compact={false} textLink="primary" icon={ChartScatter} label={m('viewRuns', { motion: row.motion })} text={row.motion} onClick={() => drill.current(row.motion)} /> },
    { id: 'average', header: m('average'), value: row => row.judgement.value, cell: row => valueText(row.judgement.value), align: 'right', size: 72 },
    { id: 'bounds', header: m('bounds'), size: 124, cell: row => row.judgement.lower === null && row.judgement.upper === null ? missingText(lang)
      : `${row.judgement.lower === null ? '' : formatSeconds(row.judgement.lower, lang)} ~ ${row.judgement.upper === null ? '' : formatSeconds(row.judgement.upper, lang)} ${HW_TIME_UNIT[lang]}` },
    { id: 'status', header: m('status'), size: 116, cell: row => {
      const status = htmStatusView(row.judgement, lang);
      return <StatusBadge tone={status?.tone ?? 'success'}>{htmStatusText(row.judgement, lang)}</StatusBadge>;
    } },
  ]; }, [m, lang]);
  const title = m('table', { module: moduleId });
  return <PlatformDataTable title={title} ariaLabel={title} columns={columns} rows={rows} getRowId={row => row.motion}
      activeRowId={motionId} preferenceKey="hw-time-overview:motions:v1" pageSize={10} />;
}


export function MotionTablePanel({ moduleId, filter }: { moduleId: string; filter: HwTimeFilter }) {
  const { setPage } = usePlatform();
  const query = useMenuQuery(hwTimeOverview.motionStats, { moduleType: filter.moduleType.id, drillModule: moduleId });
  return <QueryView query={query}>{data => <MotionTable data={data} filter={filter} moduleId={moduleId} motionId={null}
    onMotion={motion => setPage({ drillMotion: motion, trend: null, focus: null })} />}</QueryView>;
}
export function RunQueryPanel({ kind, target, filter, verdict, date }: { kind: 'trend' | 'scatter'; target: string; filter: HwTimeFilter; verdict?: HtmStatus | null; date?: string | null }) {
  const [moduleId, motionId] = target.split('/');
  const type = HW_TIME_MODULE_TYPES.find(type => (type.modules as readonly string[]).includes(moduleId!))!;
  const query = useMenuQuery(hwTimeOverview.runs, { moduleType: type.id, drillModule: moduleId!, drillMotion: motionId!,
    ...(kind === 'scatter' && verdict ? { verdict } : {}), ...(kind === 'scatter' && date ? { date } : {}) });
  const checks = filter.selectionFor(type.id);
  const hidden = !checks.modules.includes(moduleId!) || !checks.motions.includes(motionId!);
  return <div hidden={hidden} className={hidden ? 'hidden' : 'flex h-full min-h-0 flex-col'}>
    <QueryView fill query={query}>{data => <RunPanel key={`${target}/${query.completedAt}`} kind={kind} data={data} moduleId={moduleId!} motionId={motionId!} motions={checks.motions} date={kind === 'trend' ? date : undefined} />}</QueryView>
  </div>;
}

