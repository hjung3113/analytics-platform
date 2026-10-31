import { createContext } from 'react';
import { BarChart3, Gauge, House, LineChart, ListTodo, Map, ScrollText, Wrench, type LucideIcon } from 'lucide-react';
import { PlatformLink, useI18n } from '@ap/kernel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ap/ui';
import { useHomeHref } from './HomeLink';

/**
 * #1189 THROWAWAY PROTOTYPE — home + system switcher variants behind `?variant=A|B|C`.
 * Read once at module load (the param is on the first URL; in-app links drop it). Without the param every
 * branch below is skipped and the shell renders exactly as today. Delete this file after the owner picks.
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
 * Per-system outline icon in every variant: the group icon of the system's home menu (MARS chart, BRAVO gauge,
 * CLAS line, 도구 map, 운영 콘솔 list). 표준 로그 개발 and 개선 실행 both land on the shared `내 작업` Inbox icon,
 * so those two get their own icon here; a real build needs a `SpaceDef.icon` contract field.
 */
export const PROTO_ICON: Readonly<Record<string, LucideIcon>> = {
  mars: BarChart3, bravo: Gauge, clas: LineChart, tools: Map, 'log-dev': ScrollText, improvement: Wrench, operations: ListTodo,
};

/** The closed trigger shows a letter only for a Latin-named system (MARS → M); Hangul names show the system icon. */
export const protoLatinInitial = (name: string): string | null => /^[A-Za-z]/.test(name) ? name[0]!.toUpperCase() : null;

/** Variant C: true while an expanded sidebar head carries the switcher, so the rail top shows the home mark instead. */
export const ProtoHeadSwitcherContext = createContext(false);

/** Variant C rail top while the sidebar head carries the switcher: a plain home mark, styled like the other rail buttons. */
export function ProtoRailHome() {
  const href = useHomeHref();
  const { t } = useI18n();
  return <div className="flex h-[50px] w-full shrink-0 items-center justify-center">
    <Tooltip><TooltipTrigger asChild>
      {href === null
        ? <span aria-hidden className="grid size-8 place-items-center rounded-md text-text-muted"><House className="size-4" /></span>
        : <PlatformLink href={href} aria-label={t('home')} className="grid size-8 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"><House className="size-4" aria-hidden /></PlatformLink>}
    </TooltipTrigger><TooltipContent side="right">{t('home')}</TooltipContent></Tooltip>
  </div>;
}
