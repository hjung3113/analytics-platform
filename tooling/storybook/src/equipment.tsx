import type { ApiResponse, AuditEvent, Trust } from '@ap/contracts';
import type { ChartSeries, DonutSlice, HeatmapCell, LegendTreeNode, OrderedTrackItem, OrderedTrackLane, PlatformColumn, ScatterPoint, TimelineLane } from '@ap/components';
import type { TipTapDoc } from '@ap/ui';

// Synthetic equipment data shared by the stories (no real data).
export type Eq = { id: string; process: string; util: number; cycle: number; alarms: number };
export const EQUIPMENT: Eq[] = [
  ['EQ-0142', '식각', 91.2, 138, 2], ['EQ-0207', '증착', 72.5, 176, 9], ['EQ-0315', '세정', 94.8, 96, 0], ['EQ-0408', '식각', 88.7, 141, 3],
  ['EQ-0412', '증착', 84.0, 158, 4], ['EQ-0519', '세정', 79.6, 104, 6], ['EQ-0604', '식각', 92.3, 135, 1], ['EQ-0617', '증착', 86.4, 162, 2],
].map(([id, process, util, cycle, alarms]) => ({ id, process, util, cycle, alarms }) as Eq);
export const PROCESSES = ['식각', '증착', '세정'];
export const COLUMNS: PlatformColumn<Eq>[] = [
  { id: 'id', header: '설비', size: 140, value: e => e.id, cell: e => <span className="t-mono">{e.id}</span> },
  { id: 'process', header: '공정', size: 100, value: e => e.process, cell: e => e.process },
  { id: 'util', header: '가동률(%)', size: 120, align: 'right', value: e => e.util, cell: e => e.util.toFixed(1) },
  { id: 'cycle', header: '사이클타임(초)', size: 140, align: 'right', value: e => e.cycle, cell: e => e.cycle },
  { id: 'alarms', header: '알람(건)', size: 110, align: 'right', value: e => e.alarms, cell: e => e.alarms },
];

// Chart data (synthetic): 14 days of utilization per process, with 증착 unmeasured on 11-06 and 11-07 (a gap, never 0).
export const DAYS = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00`);
const wave = (base: number, seed: number) => DAYS.map((d, i) => [d, Math.round((base + 4 * Math.sin((i + seed) / 2.1)) * 10) / 10] as [string, number | null]);
const SERIES = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'] as const;
export const UTIL_SERIES: ChartSeries[] = PROCESSES.map((name, i) => ({ id: name, name, color: SERIES[i]!, unit: '%',
  points: wave([88, 81, 90][i]!, i * 2).map(([d, v], day) => [d, name === '증착' && (day === 5 || day === 6) ? null : v]) }));
export const UTIL_PREVIOUS: ChartSeries[] = UTIL_SERIES.map(s => ({ ...s, id: `${s.id}-prev`, name: `${s.name} (전 기간)`, dashed: true, points: s.points.map(([d, v]) => [d, v === null ? null : v - 3]) }));
// Alarms per equipment by kind; EQ-0315 has no 이송 record (a missing value).
export const ALARM_SERIES: ChartSeries[] = ['진공', '온도', '이송'].map((name, k) => ({ id: name, name, color: SERIES[k]!, unit: '건', kind: 'bar',
  points: EQUIPMENT.map(e => [e.id, e.id === 'EQ-0315' && k === 2 ? null : Math.round(e.alarms * [0.5, 0.3, 0.2][k]! + k)]) }));
export const HEAT_CELLS: HeatmapCell[] = EQUIPMENT.flatMap((e, r) => DAYS.slice(0, 7).map((d, c) => ({ x: d.slice(5, 10), y: e.id, value: r === 1 && c === 3 ? null : Math.min(100, Math.round(e.util + 6 * Math.sin(r + c))) })));
export const DOWNTIME: DonutSlice[] = ([['pm', '정기 보전', 38], ['wait', '자재 대기', 24], ['alarm', '알람 정지', 19], ['setup', '셋업', 11]] as const).map(([id, label, value]) => ({ id, label, value }));
export const SCATTER: ScatterPoint[] = [...EQUIPMENT.map(e => ({ id: e.id, label: e.id, x: e.cycle, y: e.util, group: e.process })), { id: 'EQ-0711', label: 'EQ-0711', x: null, y: 83.1, group: '세정' }];
export const CYCLE_STATS = PROCESSES.map((p, i) => ({ id: p, label: p, stats: i === 2 ? null : { min: [118, 140][i]!, q1: [131, 152][i]!, median: [138, 160][i]!, q3: [143, 170][i]!, max: [152, 181][i]!, outliers: [[166], [196]][i]!, n: [42, 38][i]! } }));
export const ALARM_CODES = ([['A-102', '진공 누설', 41], ['T-221', '챔버 과열', 27], ['M-310', '로봇 위치 오차', 18], ['A-118', '배기 압력', 9], ['T-205', '히터 단선', 6], ['M-302', '도어 인터록', 4]] as const)
  .map(([id, label, value]) => ({ id, label: `${id} ${label}`, value }));
export const CYCLE_VALUES = EQUIPMENT.flatMap(e => [-9, -4, 0, 3, 7, 12].map(d => e.cycle + d));
// One day of equipment states as wall-clock epoch ms (ADR-0064); EQ-0207 has no record 13:00–15:00.
const at = (h: number) => Date.UTC(2026, 10, 14, Math.floor(h), Math.round((h % 1) * 60));
const STATE_COLOR = { 가동: 'chart-series-1', 대기: 'chart-series-2', 정지: 'chart-series-3' } as const;
const STATES = [[6, 9.5, '가동'], [9.5, 10, '대기'], [10, 13, '가동'], [13, 15, '정지'], [15, 18, '가동']] as const;
export const LANES: TimelineLane[] = EQUIPMENT.slice(0, 5).map((e, r) => ({ id: e.id, label: e.id, segments: STATES.filter(([s]) => !(r === 1 && s === 13))
  .map(([s, end, state], i) => ({ id: `${e.id}-${i}`, start: at(s + r * 0.25), end: at(end + r * 0.25), rank: state, colorToken: STATE_COLOR[state] })) }));
// Log-order track (ADR-0121): the position is the log line number, never re-sorted by time. EQ-0142 starts with a run carried over from
// the previous file, EQ-0207's last run has no end yet (open), and lines 150–165 were not received.
export const TRACK_LANES: OrderedTrackLane[] = EQUIPMENT.slice(0, 3).map(e => ({ laneKey: e.id, label: e.id }));
export const TRACK_STATES = { run: { label: '가동', colorToken: 'chart-series-1' }, idle: { label: '대기', colorToken: 'chart-series-2' }, stop: { label: '정지', colorToken: 'chart-series-3' } } as const;
const RUNS = [[0, 40, 'run'], [40, 52, 'idle'], [52, 110, 'run'], [110, 128, 'stop'], [128, 190, 'run']] as const;
export const TRACK_ITEMS: OrderedTrackItem[] = [...TRACK_LANES.flatMap(({ laneKey }, r) => RUNS.map(([s, end, state], i): OrderedTrackItem => ({
  id: `${laneKey}-${i}`, laneKey, orderStart: s + r * 6, state, label: `${TRACK_STATES[state].label} #${i + 1}`, carryover: r === 0 && i === 0, ...(r === 1 && i === 4 ? {} : { orderEnd: end + r * 6 }),
}))), { id: 'EQ-0207-alarm', laneKey: 'EQ-0207', kind: 'point', orderStart: 121, state: 'stop', label: '진공 알람 A-102' }];
// Process → equipment legend of the LegendTree page.
export const LEGEND: LegendTreeNode[] = PROCESSES.map((p, i) => ({ id: p, label: p, color: SERIES[i]!, children: EQUIPMENT.filter(e => e.process === p).map(e => ({ id: e.id, label: e.id })) }));

// Page data of the 템플릿: a response Trust and the change history of EQ-0207.
export const TRUST: Trust = { updatedAt: '2026-11-14T06:10:00+09:00', dataThrough: '2026-11-14T06:00:00', coverage: 0.97, provisional: false, source: '설비 로그(합성)' };
const eq0207 = { type: 'equipment', id: 'EQ-0207', label: 'EQ-0207', scopeId: 'fab1' };
export const AUDIT: AuditEvent[] = [
  { id: 'a3', at: '2026-11-13T15:20:00+09:00', actor: 'u2', actorLabel: '김민수', action: 'update', source: 'user', target: eq0207, changes: { 상태: ['가동', '점검 필요'] }, reason: '진공 알람 반복' },
  { id: 'a2', at: '2026-11-08T09:05:00+09:00', actor: 'u1', actorLabel: '홍길동', action: 'update', source: 'user', target: eq0207, changes: { '기준 사이클타임(초)': ['165', '160'] } },
  { id: 'a1', at: '2026-10-02T10:00:00+09:00', actor: 'sync', action: 'sync', source: 'system', target: eq0207 },
];

// A synthetic internal comment (Tiptap JSON): bold, a list and a mention that stores only `actor_id` (a UUID, or the allowlist drops it).
const HONG = '00000000-0000-4000-8000-000000000001';
const text = (t: string, bold = false) => ({ type: 'text', text: t, ...(bold ? { marks: [{ type: 'bold' }] } : {}) });
export const RICH_DOC: TipTapDoc = { type: 'doc', content: [
  { type: 'paragraph', content: [text('EQ-0207 '), text('진공 알람 반복', true), text(' — 확인한 내용:')] },
  { type: 'bulletList', content: ['11-12 02:10 챔버 B 압력 상승', '펌프 교체 뒤에도 재발'].map(t => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(t)] }] })) },
  { type: 'paragraph', content: [{ type: 'mention', attrs: { actor_id: HONG } }, text(' 밸브 점검 부탁드립니다.')] },
] };
export const PEOPLE: Record<string, string> = { [HONG]: '홍길동' };
// A response envelope of the 상태 pages (synthetic): only `ok` carries data.
export const answer = <T,>(outcome: ApiResponse<T>['outcome'], data: T | null = null): ApiResponse<T> =>
  ({ outcome, data, assessments: [], trust: outcome === 'ok' ? TRUST : null, correlationId: 'sb-7f3a2c' });
