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
  const { tx, lang } = useI18n();
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<OrderedTrackItem | null>(null);
  const states = useMemo<Record<string, OrderedTrackState>>(
    () => ({
      active: { label: tx({ ko: '동작', en: 'Active' }), colorToken: 'chart-series-1' },
      waiting: { label: tx({ ko: '대기', en: 'Waiting' }), colorToken: 'chart-series-2' },
      finished: { label: tx({ ko: '완료', en: 'Finished' }), colorToken: 'chart-series-3' },
    }),
    [tx],
  );
  const items = useMemo(
    () =>
      lang === 'ko'
        ? sequenceItems
        : sequenceItems.map((item) => ({
            ...item,
            label:
              item.id === 'carryover'
                ? 'Boundary carryover'
                : item.id === 'open'
                  ? 'End unknown interval'
                  : `${item.laneKey} ${item.kind === 'point' ? 'event' : 'interval'} ${item.orderStart}`,
          })),
    [lang],
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
        ariaLabel={tx({ ko: '순서 트랙', en: 'Order track' })}
        description={tx({
          ko: '파일 순서 → 줄 번호 · 합성 데이터',
          en: 'File order → line number · Synthetic data',
        })}
        onSelect={setDetail}
        selectedId={detail?.id ?? null}
        lanes={sequenceLanes}
        items={items}
        states={states}
        domain={sequenceDomain}
        axisLabel={tx({ ko: '순번', en: 'Order' })}
        height={Math.min(height, 288)}
        markers={
          lang === 'ko'
            ? sequenceMarkers
            : sequenceMarkers.map((marker) => ({
                ...marker,
                label:
                  marker.kind === 'inversion'
                    ? 'Time inversion'
                    : marker.order === 4001
                      ? 'File B starts'
                      : 'File C starts',
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
                title: tx({ ko: '구간 불러오기 실패', en: 'Range request failed' }),
                body: tx({
                  ko: '현재 범위를 다시 불러오세요. 이미 받은 결과는 유지합니다.',
                  en: 'Retry this range. Previously loaded results are retained.',
                }),
              }
            : undefined
        }
        trust={{
          source: tx({ ko: '합성 데이터 fixture-v1', en: 'Synthetic data fixture-v1' }),
          updated: '2026-11-08 09:00:00',
          coverage: tx({ ko: '순번 1–12000 · 견본 데이터', en: 'Order 1–12000 · Sample data' }),
        }}
      />
      {detail && (
        <DetailDrawer
          title={tx({ ko: '항목 상세', en: 'Item details' })}
          onClose={() => setDetail(null)}
          tabs={[
            {
              id: 'detail',
              label: tx({ ko: '상세', en: 'Details' }),
              content: (
                <div className="flex flex-col items-start gap-3 break-keep p-4 text-sm">
                  <StatusBadge tone="neutral">
                    {tx({ ko: '합성 데이터', en: 'Synthetic data' })}
                  </StatusBadge>
                  <h3 className="t-card-title">{detail.label}</h3>
                  <p>
                    {sequenceLanes.find((lane) => lane.laneKey === detail.laneKey)?.label} ·{' '}
                    {states[detail.state]?.label} · {detail.orderStart}–
                    {detail.kind === 'point'
                      ? detail.orderStart
                      : (detail.orderEnd ??
                        tx({ ko: '종료 미확인 · 불완전', en: 'End unknown · Incomplete' }))}
                  </p>
                  <p className="t-caption text-text-secondary">
                    {tx({ ko: '표시 시간', en: 'Display time' })}: {sequenceTime(detail.orderStart)}{' '}
                    · {tx({ ko: '순서 유지', en: 'Order preserved' })}
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
