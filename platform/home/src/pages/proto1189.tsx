import { BarChart3, Gauge, LineChart, ListTodo, Map, ScrollText, Wrench, type LucideIcon } from 'lucide-react';

/**
 * #1189 THROWAWAY PROTOTYPE — home variants behind `?variant=A|B|C` (the shell reads the same param for the switcher).
 * Read when this lazy module loads; without the param the home renders exactly as today. Delete after the owner picks.
 */
export type Proto1189 = 'A' | 'B' | 'C' | null;
function readVariant(): Proto1189 {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('variant');
  return value === 'A' || value === 'B' || value === 'C' ? value : null;
}
export const PROTO_1189: Proto1189 = readVariant();

/** Prototype-only short phrases (the real copy is app-owned `SpaceDef.subtitle` in apps/platform-web/src/menus.ts). */
export const PROTO_SHORT: Readonly<Record<string, { ko: string; en: string }>> = {
  mars: { ko: '생산성·사이클타임', en: 'Productivity, cycle time' },
  bravo: { ko: '지표 관리', en: 'Metrics' },
  clas: { ko: '동작시간 분석', en: 'Operation time' },
  tools: { ko: '설비 Top View', en: 'Equipment Top View' },
  'log-dev': { ko: '모델별 로그 검증', en: 'Log validation' },
  improvement: { ko: '개선 과제 적용', en: 'Improvement tasks' },
  operations: { ko: 'VOC·Task·플랫폼 관리', en: 'VOC, Task, platform' },
};

/**
 * Per-system outline icon (same table as the shell switcher): the group icon of the system's home menu, except
 * 표준 로그 개발 and 개선 실행, which both land on the shared `내 작업` Inbox icon. A real build needs `SpaceDef.icon`.
 */
export const PROTO_ICON: Readonly<Record<string, LucideIcon>> = {
  mars: BarChart3, bravo: Gauge, clas: LineChart, tools: Map, 'log-dev': ScrollText, improvement: Wrench, operations: ListTodo,
};

/** Quiet section label shared by every home list (DESIGN "section label": caption, semibold, muted). */
export const PROTO_LABEL = 'flex h-6 items-center text-xs font-semibold text-text-muted';
