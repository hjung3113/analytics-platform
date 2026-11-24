import type { PlatformColumn } from '@ap/components';

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
