import { formatNumber } from '@ap/contracts';
import { AnalysisChart, AnalysisChartFrame, PlatformDataTable, type ChartSeries, type PlatformColumn } from '@ap/components';
import { useI18n, useMessages } from '@ap/kernel';
import { Button } from '@ap/ui';
import { useMemo, useRef } from 'react';
import { RCC_MESSAGES as M } from '../messages';
import { evidenceFor, type Cohort, type EQUIPMENT, type Run, type Step, type Structure } from '../prototype/timeCompareFixture';

type Props = {
  cohort: Cohort;
  days: readonly string[];
  structure: Structure;
  step: Step;
  equipment: string | null;
  baseline: string | null;
  baselineLabel: string;
  baselineValue: number;
  targets: readonly typeof EQUIPMENT[number][];
  onClearFocus: () => void;
};

const EVIDENCE_PLOT_HEIGHT = 212;
const RUNS_PER_PAGE = 10;
// Fit a full page, including the header and larger row sizes, without the viewport-based height cap.
const RUN_TABLE_HEIGHT = 640;
const LOT_ID_WIDTH = 192;
const RUN_ID_WIDTH = 280;

// Every run cell stays on one line, so a narrowed column never grows a row past the table height.
function oneLine(text: string) {
  return <span title={text} className="truncate">{text}</span>;
}

export function StepEvidence({ cohort, days, structure, step, equipment, baseline, baselineLabel, baselineValue, targets, onClearFocus }: Props) {
  const m = useMessages(M);
  const { lang } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  const evidence = useMemo(
    () => evidenceFor(days, structure, step.id, equipment, baseline, cohort, targets),
    [days, structure, step.id, equipment, baseline, cohort, targets],
  );
  const numberText = (value: number) => formatNumber(value, lang, { maximumFractionDigits: 2 });
  const unit = m('seconds');
  const columns: PlatformColumn<Run>[] = [
    { id: 'equipment', header: m('equipment'), value: row => row.equipment, cell: row => oneLine(row.equipment) },
    { id: 'lot', header: m('lotId'), size: LOT_ID_WIDTH, value: row => row.lot, cell: row => oneLine(row.lot) },
    { id: 'wafer', header: m('waferId'), value: row => row.wafer, cell: row => oneLine(row.wafer) },
    { id: 'startedAt', header: m('startedAt'), value: row => row.startedAt, cell: row => oneLine(row.startedAt) },
    { id: 'seconds', header: `${m('duration')} (${unit})`, value: row => row.seconds, cell: row => oneLine(numberText(row.seconds)) },
    { id: 'id', header: m('runId'), size: RUN_ID_WIDTH, value: row => row.id, cell: row => oneLine(row.id) },
  ];
  const trend: ChartSeries[] = evidence.trends.map(({ id, values }, index) => ({
    id, name: id === 'median' ? m('median') : id, points: values, kind: 'line',
    color: index === 0 ? 'chart-series-4' : 'chart-blue', dashed: index === 0,
  }));
  const title = m('stepLabel', { no: step.no, seq: step.seq });
  return <section data-testid="rcc-step-evidence" aria-label={title} className="grid min-w-0 gap-2 break-keep">
    <div className="flex flex-wrap items-center gap-2">
      <h2 ref={heading} tabIndex={-1} className="t-section-title text-text-primary">{title}</h2>
      <span className="t-caption text-text-secondary">{m('runCount', { count: evidence.runs.length })}</span>
      {equipment && <span className="t-caption text-text-secondary">{m('focus', { equipment })}</span>}
      {equipment && <Button variant="ghost" size="toolbar" onClick={() => {
        heading.current?.focus({ preventScroll: true });
        onClearFocus();
      }}>{m('showAll')}</Button>}
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <AnalysisChart chartId="rcc-step-wafer" title={m('scatter')} unit={unit} height={EVIDENCE_PLOT_HEIGHT}
        spec={{ kind: 'scatter', density: 'quiet', xLabel: m('equipment'), xUnit: unit, yLabel: m('duration'),
          xCategories: { order: evidence.equipment },
          groups: equipment ? [
            { id: 'peers', label: m('otherEquipment'), color: 'chart-series-4' },
            { id: 'focus', label: equipment, color: 'chart-blue' },
          ] : undefined,
          points: evidence.scatterRuns.map(run => ({
            id: run.id, label: `${run.lot} · ${run.wafer}`, category: run.equipment, x: null, y: run.seconds,
            group: equipment ? (run.equipment === equipment ? 'focus' : 'peers') : undefined,
          })),
          referenceMarks: [{ type: 'line', axis: 'y', value: baselineValue, label: baselineLabel }],
        }} />
      <AnalysisChartFrame chartId="rcc-step-trend" title={m('trend')} description={m('dailyMetric')} series={trend}
        height={EVIDENCE_PLOT_HEIGHT} unit={unit} xType="category" canApplyRange={false} valueFormat={numberText} yFit />
    </div>
    <PlatformDataTable title={m('runs')} ariaLabel={m('runs')} rows={evidence.runs} columns={columns} getRowId={run => run.id}
      pageSize={RUNS_PER_PAGE} height={RUN_TABLE_HEIGHT} preferenceKey="rcc-prototype-runs"
      filterKey={JSON.stringify([cohort.id, structure, step.id, equipment, days])} />
  </section>;
}
