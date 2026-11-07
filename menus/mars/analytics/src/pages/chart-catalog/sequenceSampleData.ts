import type { OrderedTrackItem, OrderedTrackLane, OrderedTrackMarker } from '@ap/components';

export const sequenceDomain: [number, number] = [1, 12000];
export const sequenceLanes: OrderedTrackLane[] = Array.from({ length: 12 }, (_, i) => ({
  laneKey: `lane-${i}`,
  label: `${i % 4 === 0 ? 'Robot' : 'Module'} ${i + 1}`,
}));
const stateKeys = ['active', 'waiting', 'finished'];
export const sequenceMarkers: OrderedTrackMarker[] = [
  { order: 4001, label: '파일 B 시작', kind: 'boundary' },
  { order: 4320, label: '시간 역전', kind: 'inversion' },
  { order: 8001, label: '파일 C 시작', kind: 'boundary' },
];
export const sequenceItems: OrderedTrackItem[] = sequenceLanes.flatMap((lane, laneIndex) =>
  Array.from({ length: 220 }, (_, i): OrderedTrackItem[] => {
    const start = 1 + i * 54 + (laneIndex % 5);
    return [
      {
        id: `${lane.laneKey}-${i}`,
        laneKey: lane.laneKey,
        orderStart: start,
        orderEnd: i === 219 && laneIndex % 3 === 0 ? undefined : start + (i % 9 === 0 ? 29 : 53),
        state: stateKeys[(i + laneIndex) % 3],
        label: `${lane.label} 구간 ${i + 1}`,
      },
      ...(i % 4 === 0
        ? [
            {
              id: `${lane.laneKey}-point-${i}`,
              laneKey: lane.laneKey,
              kind: 'point' as const,
              orderStart: start + 12,
              state: 'finished',
              label: `${lane.label} 상태 기록`,
            },
          ]
        : []),
    ];
  }).flat(),
);
sequenceItems.push(
  {
    id: 'carryover',
    laneKey: 'lane-0',
    orderStart: 3970,
    orderEnd: 4125,
    state: 'active',
    label: '파일 경계 이월',
    carryover: true,
  },
  { id: 'open', laneKey: 'lane-1', orderStart: 4030, state: 'waiting', label: '종료 미확인 구간' },
);
// A clear inspection window for the owner-confirmed open/carryover example.
const inspectionItems = sequenceItems.filter(
  (item) =>
    ['carryover', 'open'].includes(item.id) ||
    !(
      ((item.laneKey === 'lane-0' && item.orderStart < 4450) || item.laneKey === 'lane-1') &&
      (item.orderEnd ?? sequenceDomain[1]) > 3900
    ),
);
export function sequenceTime(order: number) {
  const seconds = Math.floor(order / 10) - (order >= 4320 ? 180 : 0);
  return `09:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function loadSequenceRange(
  from: number,
  to: number,
  signal: AbortSignal,
): Promise<readonly OrderedTrackItem[]> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('취소됨', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve(
        inspectionItems.filter(
          (item) =>
            item.orderStart <= to &&
            (item.kind === 'point' ? item.orderStart : (item.orderEnd ?? sequenceDomain[1])) >=
              from,
        ),
      );
    }, 600);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
