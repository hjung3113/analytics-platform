import { TriangleAlert } from 'lucide-react';
import { CHART_PANEL_OUTPUT_KEY, chartFieldMeta, type ChartConfig, type PanelInstance, type ReadChartPanel } from '@ap/contracts';
import { formatText, useI18n, useMenuQuery, usePlatform, type MenuQueryState } from '@ap/kernel';
import { AnalysisChartFrame, QueryView, StateMessage, resolveChartConfig, type ChartConfigRow } from '@ap/components';
import { HW_TIME_UNIT, hwTimeOverview, type HwTimeEquipmentDays, type HwTimeMatrix, type HwTimeMatrixParams, type HwTimePanelParams } from '../../endpoints';
import { HW_TIME_CHART_FIELD as F, HW_TIME_CHART_FIELDS } from '../../chartFields';
import { HW_TIME_CHART_MESSAGES } from '../../messages';
import { equipmentDaysAvailable } from '../../shared/useHwTimeFilter';

type Drill = { moduleType: string | null; drillModule: string | null; drillMotion: string | null };

/** The drilled population a measure reads, or nothing before the Module step (a Motion measure also needs the Motion). */
function chartInput(measure: string, { moduleType, drillModule, drillMotion }: Drill): HwTimePanelParams | undefined {
  if (!moduleType || !drillModule) return undefined;
  if (measure !== F.motion) return { moduleType, drillModule };
  return drillMotion ? { moduleType, drillModule, drillMotion } : undefined;
}

/** One row per equipment of the drilled Module: the server's Module or Motion mean as given. */
function matrixRows(data: HwTimeMatrix, measure: string, input: HwTimePanelParams): ChartConfigRow[] {
  const motion = measure === F.motion ? input.drillMotion : undefined;
  return data.cells.filter(cell => cell.moduleId === input.drillModule).map(cell => ({
    [F.equipment]: cell.equipmentId,
    [measure]: motion ? cell.motions[motion]?.value ?? null : cell.module.value,
  }));
}
/** One row per equipment and day, at the wall-clock day start. */
function dayRows(data: HwTimeEquipmentDays, measure: string): ChartConfigRow[] {
  return data.rows.map(row => ({ [F.day]: `${row.date}T00:00:00`, [F.equipment]: row.equipmentId, [measure]: row.judgement.value }));
}

function Problem({ text }: { text: string }) {
  return <StateMessage compact tone="warning" icon={<TriangleAlert className="size-4" aria-hidden />} title={text} />;
}

/** Field meta with HW Time's unit in the reader's language: the declaration's `unit` is one string, so it holds the English symbol. */
function fieldMeta(lang: 'ko' | 'en') {
  const meta = chartFieldMeta(HW_TIME_CHART_FIELDS, lang);
  for (const { id } of HW_TIME_CHART_FIELDS.measures) meta[id] = { ...meta[id]!, unit: HW_TIME_UNIT[lang] };
  return meta;
}

/**
 * A chart panel made from settings (#2761), given the workspace's `readChartPanel` result. A saved chart the menu no longer makes shows the
 * reason and is kept as saved; a bar publishes its chosen equipment as `<instance id>.selection`, registered by the workspace's
 * `AnalysisSelectionInstances`.
 */
export function ChartPanel({ instance, config, read, matrix, drill }: {
  instance: PanelInstance; config: ChartConfig; read: ReadChartPanel; matrix: MenuQueryState<HwTimeMatrixParams, HwTimeMatrix> | undefined; drill: Drill;
}) {
  const { lang, tx } = useI18n();
  const { page } = usePlatform();
  const input = read.status === 'ok' ? chartInput(read.measure.id, drill) : undefined;
  // The same eligibility as the equipment × day heatmap: a Module roll-up never includes a Module or Motion the filter leaves out.
  const available = input !== undefined && equipmentDaysAvailable(input, page);
  const isLine = read.status === 'ok' && read.kind === 'line';
  const days = useMenuQuery(hwTimeOverview.equipmentDays, input ?? {}, { enabled: available && isLine });
  if (read.status === 'problem') return <Problem text={tx(read.problem.reason)} />;
  if (!input) return <Problem text={tx(HW_TIME_CHART_MESSAGES.needsModule)} />;
  if (!available) return <Problem text={tx(HW_TIME_CHART_MESSAGES.filtered)} />;
  const draw = (rows: readonly ChartConfigRow[]) => {
    const meta = fieldMeta(lang);
    const resolved = resolveChartConfig(config, rows, meta, lang);
    if (resolved.status === 'problem') {
      const { field } = resolved.problem;
      return <Problem text={formatText(HW_TIME_CHART_MESSAGES.cannotDraw, lang, { field: meta[field]?.label ?? field })} />;
    }
    return <AnalysisChartFrame chartId={`hw-${instance.id}`} title={tx(read.title)} summary="quiet" size="fill" {...resolved.frame}
      analysisSelectionOutput={isLine ? undefined : { panelId: instance.id, instanceId: instance.id, key: CHART_PANEL_OUTPUT_KEY }} />;
  };
  if (isLine) return <QueryView fill query={days}>{data => draw(dayRows(data, read.measure.id))}</QueryView>;
  return matrix ? <QueryView fill query={matrix}>{data => draw(matrixRows(data, read.measure.id, input))}</QueryView> : null;
}
