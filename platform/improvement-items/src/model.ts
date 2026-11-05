import type { ColumnFilter, Quest } from '@ap/contracts';
import type { Effect, Origin, Target } from './endpoints';
export type View = 'mine' | 'all' | 'unlinked';
export const filtersForView = (view: View): ColumnFilter[] => view === 'mine' ? [{ id: 'assignee', op: 'in', value: ['me'] }, { id: 'status', op: 'notIn', value: ['verified', 'dropped'] }] : view === 'unlinked' ? [{ id: 'questLinked', op: 'in', value: ['false'] }] : [];
export type MoveDraft = { action?: string; actionDate?: string; effect?: Effect; reason?: string };
export function moveErrors(move: string, draft: MoveDraft): string[] {
  const errors: string[] = [];
  if ((move === 'in_progress' || move === 'done') && !draft.action?.trim()) errors.push('action');
  if (move === 'done' && !draft.actionDate) errors.push('actionDate');
  if (move === 'verified' && !draft.effect) errors.push('effect');
  if ((move === 'dropped' || move === 'reopen') && !draft.reason?.trim()) errors.push('reason');
  return errors;
}
export function createErrors(input: { problem: string; origin: Origin | null; targets: Target[] }): string[] {
  return [...(!input.problem.trim() || [...input.problem.trim()].length > 500 ? ['problem'] : []), ...(!input.origin && input.targets.length === 0 ? ['origin'] : [])];
}
export type QuestState = 'ok' | 'not_found' | 'unavailable' | 'forbidden';
export function questPresentation(state: QuestState, snapshot: string, quest: Quest | null) {
  return { title: state === 'ok' && quest ? quest.title : snapshot, status: state === 'ok' ? quest?.status : undefined, state };
}
/** Analysis Context is wall-clock time in KST; actionDate is a separate calendar day. */
export function originPeriod(context: Record<string, unknown>, lang: 'ko' | 'en'): string {
  const from = typeof context.from === 'string' ? context.from.replace('T', ' ') : (lang === 'ko' ? '시작 미상' : 'Unknown start');
  const to = typeof context.to === 'string' ? context.to.replace('T', ' ') : (lang === 'ko' ? '종료 미상' : 'Unknown end');
  return `${from} – ${to} KST`;
}
