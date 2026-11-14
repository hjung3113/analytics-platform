import type { TextParams } from '@ap/kernel';
import { useMessages, formatText } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../messages';
import { formatWallClock } from '@ap/contracts';
import { AlertTriangle, Ban } from 'lucide-react';
import { formatNumber, parseDateTime } from '@ap/contracts';
import { type PageProps, PlatformLink, useI18n, usePlatform, useMenuQuery } from '@ap/kernel';
import { DataTrustIndicator, Panel, PlatformPage, QueryView, ReturnLink, StateMessage } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
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
  const startedAt = found && found.access === 'ok' ? found.execution.startedAt : null;

  const back = <ReturnLink />;
  const voc = <Button asChild size="sm"><PlatformLink href={linkTo('voc')}>{m('executionDetailCreateVocPlanned')}</PlatformLink></Button>;

  return <PlatformPage
    title={<span className="inline-flex items-baseline gap-2">{m('executionDetailExecution')} <span className="t-mono">{equipmentId}</span></span>}
    description={m('executionDetailAnOccurrenceIsIdentifiedOnlyByEquipmentid')}
    primaryAction={voc}
    secondaryActions={<span className="flex flex-wrap gap-2">{back}</span>}
    dataTrustSummary={query.response?.trust ? <DataTrustIndicator trust={query.response.trust} assessments={query.response.assessments} /> : undefined}
  >
    <div className="space-y-3">
      <p className="rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-secondary">
        {m('executionDetailTimeRoomConditionSelectionLotPpidRecipe')}
        {restored ? '' : (m('executionDetailReturntoIsAbsentSoBackOpensCycle'))}
      </p>

      <Panel title={m('executionDetailOccurrenceIdentity')} subtitle={m('executionDetailIdentityKeySeparateFromTheAnalysisContext')}>
        <div className="grid gap-3 sm:grid-cols-4" data-testid="occurrence-key">
          <Identity label="EquipmentID" value={equipmentId} />
          <Identity label="entityType" value={entityType ?? '—'} />
          <Identity label="anchor" value={anchor ?? '—'} />
          <Identity label={m('executionDetailStartTime')} value={startedAt ? formatWallClock(startedAt) : '—'} />
        </div>
      </Panel>

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
  const spanEnd = segments.reduce((max, segment) => segment.end > max ? segment.end : max, execution.startedAt);
  const axisEnd = spanEnd;
  const totalSec = Math.max(1, secondsBetween(execution.startedAt, axisEnd));
  return <div className={PANEL_GAP}>
    <Panel title={m('executionDetailDisplayAttributes')} subtitle={m('executionDetailDisplayAttributes2')}>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Identity label={m('executionDetailProcess')} value={execution.room} />
        <Identity label="Recipe" value={execution.recipe} />
        <Identity label="Lot" value={execution.lotId} />
        <Identity label="PPID" value={execution.ppid} />
        <Identity label={m('executionDetailCycleTime')} value={`${formatNumber(execution.cycleMin, lang, { decimals: 1 })} ${m('executionDetailMin')}`} />
      </div>
    </Panel>

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
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-text-muted">
              {['', 'Module', 'Slot', m('executionDetailStart'), m('executionDetailEnd'), m('executionDetailDurationMin')].map(label => <th key={label || 'kind'} title={label || (m('executionDetailSegment'))} className={`t-table-header truncate whitespace-nowrap px-4 py-1.5 ${label.startsWith('길이') || label.startsWith('Duration') ? 'text-right' : ''}`}>{label || (m('executionDetailSegment2'))}</th>)}
            </tr>
          </thead>
          <tbody>
            {segments.map(segment => <tr key={`${segment.kind}-${segment.start}`} className="border-b border-border-subtle">
              <td className="px-4 py-1"><span className="t-mono">{segment.kind}</span></td>
              <td className="t-mono px-4 py-1">{segment.module}</td>
              <td className="t-mono px-4 py-1">{segment.slot}</td>
              <td className="t-mono px-4 py-1 tabular">{formatWallClock(segment.start)}</td>
              <td className="t-mono px-4 py-1 tabular">{formatWallClock(segment.end)}</td>
              <td className="px-4 py-1 text-right tabular">{formatNumber(segment.durationMin, lang, { decimals: 1 })}</td>
            </tr>)}
          </tbody>
        </table>
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

function Identity({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-sm bg-surface-sunken px-3 py-2">
    <div className="text-xs text-text-muted">{label}</div>
    <div className="t-mono break-all text-sm">{value}</div>
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
