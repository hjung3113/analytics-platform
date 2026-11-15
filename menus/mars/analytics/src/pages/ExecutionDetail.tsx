import type { TextParams } from '@ap/kernel';
import { useMessages, formatText } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../messages';
import { formatWallClock } from '@ap/contracts';
import { AlertTriangle, Ban } from 'lucide-react';
import { formatNumber, parseDateTime } from '@ap/contracts';
import { type PageProps, PlatformLink, useI18n, usePlatform, useMenuQuery } from '@ap/kernel';
import { DataTrustIndicator, Panel, PlatformPage, QueryView, ReturnLink, StateMessage } from '@ap/components';
import { Button, FieldList, FieldRow, InfoTip, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ap/ui';
import { isAnchor, OCCURRENCE_ENTITY_TYPES, occurrenceEndpoint, resolveMetric, type Segment, type SegmentKind } from '../endpoints';

const SEGMENT_CLASS: Record<SegmentKind, string> = {
  XFR: 'bg-chart-blue',
  FNC: 'bg-chart-teal',
  PRC: 'bg-chart-purple',
};

export default function ExecutionDetail({ params }: PageProps) {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { lang } = useI18n();
  const { global, pageParam, linkTo, returnOrigin } = usePlatform();
  const equipmentId = params.equipmentId;
  const entityType = pageParam('entityType');
  const anchor = pageParam('anchor');
  const errors = identityErrors(entityType, anchor, (lang === 'ko'));
  const valid = errors.length === 0;
  const metric = resolveMetric(global);
  const metricVersion = metric.kind === 'unconfirmed' ? null : metric.metricVersion;
  const restored = returnOrigin().accepted;

  const query = useMenuQuery(
    occurrenceEndpoint,
    { equipmentId, entityType: entityType!, anchor: anchor!, metricVersion: metricVersion! },
    valid && metricVersion !== null,
  );

  const found = query.response?.data;
  const execution = valid && query.status !== 'idle' && query.response?.outcome === 'ok' && found?.access === 'ok' ? found.execution : null;
  const startedAt = execution?.startedAt;

  const back = <ReturnLink />;
  const voc = <Button asChild size="sm"><PlatformLink href={linkTo('voc')}>{m('executionDetailCreateVocPlanned')}</PlatformLink></Button>;

  return <PlatformPage
    title={<span className="inline-flex items-baseline gap-2">{m('executionDetailExecution')} <span className="t-mono">{equipmentId}</span></span>}
    description={m('executionDetailAnOccurrenceIsIdentifiedOnlyByEquipmentid')}
    primaryAction={voc}
    secondaryActions={<span className="flex flex-wrap items-center gap-2">
      {back}
      {!restored && <span className="text-xs text-text-secondary">{m('executionDetailReturntoIsAbsentSoBackOpensCycle')}</span>}
    </span>}
    dataTrustSummary={query.response?.trust ? <DataTrustIndicator trust={query.response.trust} assessments={query.response.assessments} /> : undefined}
  >
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border-subtle pb-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1" data-testid="occurrence-key">
          <div className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
            {m('executionDetailIdentityBand')}
            <InfoTip label={m('guidanceLabel')}>
              {m('executionDetailTimeRoomConditionSelectionLotPpidRecipe')}
              {' '}{m('executionDetailIdentityKeySeparateFromTheAnalysisContext')}
            </InfoTip>
          </div>
          <FieldList layout="inline">
            <FieldRow label="EquipmentID" mono>{equipmentId}</FieldRow>
            <FieldRow label="entityType" mono>{entityType ?? '—'}</FieldRow>
            <FieldRow label="anchor" mono>{anchor ?? '—'}</FieldRow>
            <FieldRow label={m('executionDetailStartTime')} mono>{startedAt ? formatWallClock(startedAt) : '—'}</FieldRow>
          </FieldList>
        </div>
        {execution && <>
          <span aria-hidden className="h-4 border-l border-border-subtle" />
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-xs font-medium text-text-secondary">{m('executionDetailDisplayBand')}</span>
            <FieldList layout="inline">
              <FieldRow label={m('executionDetailProcess')} mono>{execution.room}</FieldRow>
              <FieldRow label="Recipe" mono>{execution.recipe}</FieldRow>
              <FieldRow label="Lot" mono>{execution.lotId}</FieldRow>
              <FieldRow label="PPID" mono>{execution.ppid}</FieldRow>
              <FieldRow label={m('executionDetailCycleTime')}>{formatNumber(execution.cycleMin, lang, { decimals: 1 })} {m('executionDetailMin')}</FieldRow>
            </FieldList>
          </div>
        </>}
      </div>

      {!valid ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={m('executionDetailLookupRequiresAValidIdentityKey')}
        body={<ul className="list-disc pl-4">{errors.map(error => <li key={error}>{error}</li>)}</ul>} />
        : <div className="relative">
          <QueryView widgetName={m('executionDetailExecutionDetails')} query={query} skeletonHeight={240}>
            {data => data.access === 'forbidden'
              ? <StateMessage tone="warning" icon={<Ban className="size-4" aria-hidden />} title={m('executionDetailThisEquipmentIsOutsideTheCurrentScope')}
                body={m('executionDetailYouCannotViewThisEquipmentInThe')}
                correlationId={query.response?.correlationId} />
              : data.access === 'ok' ? <OccurrenceBody execution={data.execution} segments={data.segments} ko={(lang === 'ko')} lang={lang} /> : null}
          </QueryView>
        </div>}
    </div>
  </PlatformPage>;
}

const PANEL_GAP = 'space-y-3';

function OccurrenceBody({ execution, segments, lang }: { execution: { room: string; recipe: string; lotId: string; ppid: string; anchor: string; startedAt: string; cycleMin: number; quality: 'unknown' | 'review' }; segments: Segment[]; ko: boolean; lang: 'ko' | 'en' }) {
  const m = (key: keyof typeof ANALYTICS_MESSAGES, params?: TextParams) => formatText(ANALYTICS_MESSAGES[key], lang, params);
  const segmentColumns = [
    { key: 'kind', label: m('executionDetailSegment2'), align: 'start' }, { key: 'module', label: 'Module', align: 'start' }, { key: 'slot', label: 'Slot', align: 'start' },
    { key: 'start', label: m('executionDetailStart'), align: 'start' }, { key: 'end', label: m('executionDetailEnd'), align: 'start' }, { key: 'duration', label: m('executionDetailDurationMin'), align: 'end' },
  ] as const;
  const spanEnd = segments.reduce((max, segment) => segment.end > max ? segment.end : max, execution.startedAt);
  const axisEnd = spanEnd;
  const totalSec = Math.max(1, secondsBetween(execution.startedAt, axisEnd));
  return <div className={PANEL_GAP}>
    <Panel title={m('executionDetailProcessTimeline')} subtitle={m('executionDetailXfrFncPrcBarsGapsUnclassifiedNo')}>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-text-secondary">
        {(['XFR', 'FNC', 'PRC'] as const).map(kind => <span key={kind} className="inline-flex items-center gap-1.5"><span aria-hidden className={`inline-block h-2 w-4 ${SEGMENT_CLASS[kind]}`} />{kind}</span>)}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-4 bg-surface-sunken" />{m('executionDetailUnclassified')}</span>
      </div>
      <div className="relative h-10 rounded-sm bg-surface-sunken" role="img" aria-label={m('executionDetailProcessSegmentBars')}>
        {segments.map(segment => {
          const left = (secondsBetween(execution.startedAt, segment.start) / totalSec) * 100;
          const width = Math.max(0.8, (secondsBetween(segment.start, segment.end) / totalSec) * 100);
          // eslint-disable-next-line shadcn/no-inline-styles -- segment left/width are per-segment percentages computed at runtime
          return <div key={`${segment.kind}-${segment.start}`} title={`${segment.kind} ${segment.module}/${segment.slot} ${segment.durationMin}`} className={`absolute top-1 bottom-1 ${SEGMENT_CLASS[segment.kind]}`} style={{ left: `${left}%`, width: `${width}%` }} />;
        })}
      </div>
      <div className="mt-1 flex justify-between text-tiny text-text-muted tabular">
        <span>{formatWallClock(execution.startedAt)}</span>
        <span>{formatWallClock(axisEnd)}</span>
      </div>
      <p className="mt-2 text-xs text-text-muted">{m('executionDetailBarPositionsUseSecondLengthsTheStart')}</p>
    </Panel>

    <Panel title={m('executionDetailSegmentTable')} subtitle={m('executionDetailTheParentOccurrenceIsTheIdentityAbove')}>
      <div className="overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              {segmentColumns.map(column => <TableHead key={column.key} scope="col" align={column.align}>{column.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {segments.map(segment => <TableRow key={`${segment.kind}-${segment.start}`}>
              <TableCell><span className="t-mono">{segment.kind}</span></TableCell>
              <TableCell><span className="t-mono">{segment.module}</span></TableCell>
              <TableCell><span className="t-mono">{segment.slot}</span></TableCell>
              <TableCell><span className="t-mono tabular">{formatWallClock(segment.start)}</span></TableCell>
              <TableCell><span className="t-mono tabular">{formatWallClock(segment.end)}</span></TableCell>
              <TableCell align="end">{formatNumber(segment.durationMin, lang, { decimals: 1 })}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
    </Panel>

    <Panel title={m('executionDetailQuality')} subtitle={m('executionDetailDistinctFromDataTrustDoNotRead')}>
      {execution.quality === 'review'
        ? <StatusBadge tone="warning">{m('executionDetailReviewFlag')}</StatusBadge>
        : <StatusBadge tone="neutral">{m('executionDetailUnconfirmed')}</StatusBadge>}
      <p className="mt-2 text-xs text-text-muted">{m('executionDetailUnconfirmedExecutionsWithoutVerdictEvidenceReviewFlags')}</p>
    </Panel>

    <Panel title={m('executionDetailLineage')} subtitle={m('executionDetailAnExampleLogicalPathTheSourcePath')}>
      <p className="t-mono text-xs text-text-secondary">occurrence_directory → mart.productivity_hourly → execution-detail</p>
      <p className="mt-2 text-xs text-text-muted">{m('executionDetailTheKeyAnchorIsOpaqueAndIs', { anchor: String(execution.anchor) })}</p>
    </Panel>
  </div>;
}

function identityErrors(entityType: string | null, anchor: string | null, ko: boolean): string[] {
  const errors: string[] = [];
  if (!entityType) errors.push(formatText(ANALYTICS_MESSAGES.executionDetailTheExecutionKindIsMissingFromThe, (ko ? 'ko' : 'en')));
  else if (!OCCURRENCE_ENTITY_TYPES.includes(entityType)) errors.push(formatText(ANALYTICS_MESSAGES.executionDetailThisKindOfDetailCannotBeOpened, (ko ? 'ko' : 'en')));
  if (!anchor) errors.push(formatText(ANALYTICS_MESSAGES.executionDetailTheExecutionKeyAnchorIsMissingOpen, (ko ? 'ko' : 'en')));
  else if (!isAnchor(anchor)) errors.push(formatText(ANALYTICS_MESSAGES.executionDetailTheExecutionKeyAnchorIsNotIn, (ko ? 'ko' : 'en')));
  return errors;
}

function secondsBetween(from: string, to: string): number {
  return (parseDateTime(to, 'to').getTime() - parseDateTime(from, 'from').getTime()) / 1000;
}
