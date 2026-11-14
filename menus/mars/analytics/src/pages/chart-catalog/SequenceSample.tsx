import { useMessages } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../../messages';
import { useMemo, useState } from 'react';
import { StatusBadge } from '@ap/ui';
import { useI18n } from '@ap/kernel';
import {
  DetailDrawer,
  OrderedIntervalTrack,
  type OrderedTrackItem,
  type OrderedIntervalTrackProps,
  type OrderedTrackLoadState,
  type OrderedTrackState,
} from '@ap/components';
import {
  loadSequenceRange,
  sequenceDomain,
  sequenceItems,
  sequenceLanes,
  sequenceMarkers,
  sequenceTime,
} from './sequenceSampleData';

export function SequenceSample({
  height,
  onLoadStateChange,
  loader = loadSequenceRange,
}: {
  height: number;
  onLoadStateChange?: (state: OrderedTrackLoadState) => void;
  loader?: OrderedIntervalTrackProps['onRangeRequest'];
}) {
  const { lang } = useI18n();
  const m = useMessages(ANALYTICS_MESSAGES);
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<OrderedTrackItem | null>(null);
  const states = useMemo<Record<string, OrderedTrackState>>(
    () => ({
      active: { label: m('sequenceSampleActive'), colorToken: 'chart-series-1' },
      waiting: { label: m('sequenceSampleWaiting'), colorToken: 'chart-series-2' },
      finished: { label: m('sequenceSampleFinished'), colorToken: 'chart-series-3' },
    }),
    [m],
  );
  const items = useMemo(
    () =>
      sequenceItems.map((item) => ({
            ...item,
            label:
              item.id === 'carryover'
                ? m('sequenceItemCarryover', { label: String(item.label) })
                : item.id === 'open'
                  ? m('sequenceItemOpen', { label: String(item.label) })
                  : m(item.kind === 'point' ? 'sequenceItemPoint' : 'sequenceItemInterval', { label: String(item.label), laneKey: String(item.laneKey), orderStart: String(item.orderStart) }),
          })),
    [m],
  );
  const englishLoader = useMemo(
    () =>
      lang === 'ko' || !loader
        ? loader
        : async (from: number, to: number, signal: AbortSignal) => {
            const result = await loader(from, to, signal);
            const labels = new Map(items.map((item) => [item.id, item.label]));
            return result.map((item) => ({ ...item, label: labels.get(item.id) ?? item.label }));
          },
    [lang, loader, items],
  );
  return (
    <>
      <OrderedIntervalTrack
        ariaLabel={m('sequenceSampleOrderTrack')}
        description={m('sequenceSampleFileOrderLineNumberSyntheticData')}
        onSelect={setDetail}
        selectedId={detail?.id ?? null}
        lanes={sequenceLanes}
        items={items}
        states={states}
        domain={sequenceDomain}
        axisLabel={m('sequenceSampleOrder')}
        height={Math.min(height, 288)}
        markers={
          sequenceMarkers.map((marker) => ({
                ...marker,
                label:
                  marker.kind === 'inversion'
                    ? m('sequenceMarkerInversion', { label: String(marker.label) })
                    : marker.order === 4001
                      ? m('sequenceMarkerFileB', { label: String(marker.label) })
                      : m('sequenceMarkerFileC', { label: String(marker.label) }),
              }))
        }
        formatTime={sequenceTime}
        onRangeRequest={englishLoader}
        onLoadStateChange={(state) => {
          setFailed(state === 'error');
          onLoadStateChange?.(state);
        }}
        state={
          failed
            ? {
                kind: 'ready',
                title: m('sequenceSampleRangeRequestFailed'),
                body: m('sequenceSampleRetryThisRangePreviouslyLoadedResultsAre'),
              }
            : undefined
        }
        trust={{
          source: m('sequenceSampleSyntheticDataFixtureV1'),
          updated: '2026-11-08 09:00:00',
          coverage: m('sequenceSampleOrder112000SampleData'),
        }}
      />
      {detail && (
        <DetailDrawer
          title={m('sequenceSampleItemDetails')}
          onClose={() => setDetail(null)}
          tabs={[
            {
              id: 'detail',
              label: m('sequenceSampleDetails'),
              content: (
                <div className="flex flex-col items-start gap-3 break-keep p-4 text-sm">
                  <StatusBadge tone="neutral">
                    {m('sequenceSampleSyntheticData')}
                  </StatusBadge>
                  <h3 className="t-card-title">{detail.label}</h3>
                  <p>
                    {sequenceLanes.find((lane) => lane.laneKey === detail.laneKey)?.label} ·{' '}
                    {states[detail.state]?.label} · {detail.orderStart}–
                    {detail.kind === 'point'
                      ? detail.orderStart
                      : (detail.orderEnd ??
                        m('sequenceSampleEndUnknownIncomplete'))}
                  </p>
                  <p className="t-caption text-text-secondary">
                    {m('sequenceSampleDisplayTime')}: {sequenceTime(detail.orderStart)}{' '}
                    · {m('sequenceSampleOrderPreserved')}
                  </p>
                </div>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
