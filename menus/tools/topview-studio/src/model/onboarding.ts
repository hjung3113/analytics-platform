/** Words, steps and gates of the 설비 온보딩 screen (#1658). The server keeps codes; the screen owns the words (ONBOARDING §1, §6). */
import { DIRTY_REASON, type PublishPlan } from '@eqv/editor';
import type { FleetStatusCode, WindowState } from '../endpoints';

export const FLEET_STATUS_LABEL: Record<FleetStatusCode, string> = {
  'no-observations': '관측 없음', unstarted: '미착수', draft: '초안', published: '게시됨', drift: 'Drift', 'drift-unknown': '게시됨 · Drift 미확인',
};
export const FLEET_STATUS_TONE = {
  'no-observations': 'neutral', unstarted: 'neutral', draft: 'neutral', published: 'success', drift: 'warning', 'drift-unknown': 'neutral',
} as const satisfies Record<FleetStatusCode, string>;

export const WINDOW_STATE_LABEL: Record<WindowState, string> = { active: '사용 중', staged: '교체 대기', replaced: '교체됨', retired: '퇴역' };
export const WINDOW_STATE_TONE = { active: 'success', staged: 'warning', replaced: 'neutral', retired: 'neutral' } as const satisfies Record<WindowState, string>;

export const STEPS = [
  { key: 'data', label: '데이터' }, { key: 'inventory', label: 'Inventory' }, { key: 'template', label: 'Template' },
  { key: 'mapping', label: 'Mapping' }, { key: 'validate', label: '검증·게시' }, { key: 'drift', label: 'Drift' },
] as const;
export type StepKey = typeof STEPS[number]['key'];
export const DEFAULT_STEP: StepKey = 'data';
export const isStep = (raw: string): raw is StepKey => STEPS.some((s) => s.key === raw);

/** `done` (CircleCheck), `attention` (CircleAlert) or no marker. 검증·게시 never shows a blocking mark: Conflicts do not block publish. */
export type StepMark = 'done' | 'attention' | null;
export interface StepFacts {
  windows: number;
  aliases: number | null;
  hasDraft: boolean | null;
  /** Saved-rule dry-run: unmapped alias count and Mapping Conflict count; null while computing or without a draft. */
  unmapped: number | null;
  conflicts: number | null;
  /** The draft and saved rules equal the latest Binding (nothing new to publish). */
  upToDate: boolean | null;
  drift: 'none' | 'drifted' | 'unknown' | 'unpublished' | null;
}
export function stepMarks(f: StepFacts): Record<StepKey, StepMark> {
  return {
    data: f.windows > 0 ? 'done' : 'attention',
    inventory: f.aliases === null ? null : f.aliases > 0 ? 'done' : 'attention',
    template: f.hasDraft === null ? null : f.hasDraft ? 'done' : 'attention',
    mapping: f.unmapped === null || f.conflicts === null ? null : f.unmapped === 0 && f.conflicts === 0 ? 'done' : 'attention',
    validate: f.upToDate ? 'done' : null,
    drift: f.drift === 'none' ? 'done' : f.drift === 'drifted' || f.drift === 'unknown' ? 'attention' : null,
  };
}
export const MARK_WORD: Record<Exclude<StepMark, null>, string> = { done: '완료', attention: '확인 필요' };

/**
 * D9/D10: the one reason `게시 검토` is disabled, or null. Only unsaved Board edits, `publishMapping` issues, an invalid `effectiveFrom`
 * and «이전 게시와 같습니다» block (all but the first come from `derivePublishPlan`'s problems); Mapping Conflicts never do.
 */
export function publishBlockReason(input: { dirty: boolean; plan: PublishPlan | null }): string | null {
  if (input.dirty) return DIRTY_REASON;
  if (input.plan === null) return '검증 결과를 계산하는 중입니다.';
  return input.plan.problems[0] ?? null;
}

export const percent = (ratio: number | null | undefined): string => (ratio === null || ratio === undefined ? '—' : `${Math.round(ratio * 100)}%`);
export const windowHex = (hash: string): string => hash.replace(/^sha256:/, '');
