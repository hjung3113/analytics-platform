/** Words, steps and gates of the 설비 온보딩 screen (#1658). The server keeps codes; the screen owns the words (ONBOARDING §1, §6). */
import { DIRTY_REASON, type PublishPlan } from '@eqv/editor';
import { UPLOAD_FILE_MAX_BYTES } from '@ap/contracts';
import { EQUIPMENT_ID_MAX, EQUIPMENT_ID_PATTERN, SAMPLE_WINDOW_FILE_SUFFIX, type FleetStatusCode, type WindowState } from '../endpoints';

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
export function publishBlockReason(input: { dirty: boolean; plan: Pick<PublishPlan, 'problems'> | null }): string | null {
  if (input.dirty) return DIRTY_REASON;
  if (input.plan === null) return '검증 결과를 계산하는 중입니다.';
  // Nothing new to publish says more than the empty effectiveFrom the D7 default leaves right after a publish.
  return input.plan.problems.find((problem) => problem === SAME_AS_LATEST) ?? input.plan.problems[0] ?? null;
}

/** `derivePublishPlan`'s problem when the draft and saved rules equal the latest Binding. */
export const SAME_AS_LATEST = '이전 게시와 같습니다';
/** The header line stays short; the effectiveFrom input names the exact reason under itself. */
export const publishHeaderReason = (problem: string): string => (problem.startsWith('effectiveFrom') ? 'effectiveFrom 확인 필요' : problem);

/**
 * C6: publishing a draft without a matching Layout Revision runs `publishRevision` first, which needs `eqv-studio:layout-publish`
 * (the Layouts menu's right). `needsRevision` is null while the Revision list is not read yet.
 */
export function publishRightReason(input: { canLayoutPublish: boolean; needsRevision: boolean | null }): string | null {
  if (input.canLayoutPublish || input.needsRevision === false) return null;
  return input.needsRevision === null ? 'Layout Revision을 확인하는 중입니다.'
    : 'Layout Revision 게시 권한(eqv-studio:layout-publish)이 없습니다. 레이아웃 메뉴에서 Revision을 먼저 게시하세요.';
}

const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}\.\d{3}$/;
/** Site Wall-clock as `YYYY-MM-DD HH:mm` where space is tight; anything else unchanged. Show the full value in `title`. */
export const wallClockShort = (value: string): string => {
  const match = WALL_CLOCK.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
};
/** `2026-01-01 10:00–10:30` on one day, else both ends in full short form. */
export const rangeShort = (from: string, to: string): string => {
  const a = wallClockShort(from);
  const b = wallClockShort(to);
  return a.slice(0, 10) === b.slice(0, 10) && WALL_CLOCK.test(from) && WALL_CLOCK.test(to) ? `${a}–${b.slice(11)}` : `${a} – ${b}`;
};
/** Selector label: what differs between windows of one range first (EV#105 generations), then the short range. */
export const windowLabel = (w: { from: string; to: string; dataGeneration: string; state: WindowState }): string =>
  `${w.dataGeneration} · ${WINDOW_STATE_LABEL[w.state]} · ${rangeShort(w.from, w.to)}`;

export const percent = (ratio: number | null | undefined): string => (ratio === null || ratio === undefined ? '—' : `${Math.round(ratio * 100)}%`);
export const windowHex = (hash: string): string => hash.replace(/^sha256:/, '');

// ---- Sample Window import and equipment registration (#1658 import PR, ADR-0140) ----

/** The picked file's pre-check, only to spare an upload: the server judges size, type and content again. */
export function windowFileProblem(file: { name: string; size: number; type: string }): string | null {
  if (file.size > UPLOAD_FILE_MAX_BYTES) return '32 MiB를 넘는 파일은 가져올 수 없습니다.';
  // An empty `type` is common for `.json` files; the upload declares `application/json` for it.
  if (!file.name.endsWith(SAMPLE_WINDOW_FILE_SUFFIX) || (file.type !== '' && file.type !== 'application/json')) return '*.batch.json 파일만 가져올 수 있습니다.';
  return null;
}

/** What the screen says when `uploadFile` did not answer `ok`. */
export function uploadFailure(answer: { outcome: string; fieldErrors: readonly { code: string }[] }): string {
  if (answer.outcome === 'forbidden') return '권한이 없어 파일을 올리지 못했습니다.';
  if (answer.outcome === 'conflict') return '같은 요청으로 다른 파일이 이미 올라갔습니다. 파일을 다시 고르세요.';
  if (answer.outcome === 'invalid') {
    const code = answer.fieldErrors[0]?.code;
    return code === 'too_large' ? '파일이 32 MiB를 넘어 올리지 못했습니다.' : code === 'unsupported_type' ? '이 형식의 파일은 올릴 수 없습니다.' : '파일을 올리지 못했습니다.';
  }
  return '파일을 올리지 못했습니다. 다시 시도하세요.';
}

/** A field error as one short line: `code · path`. */
export const fieldErrorLine = (error: { path: readonly (string | number)[]; code: string }): string => `${error.code} · ${error.path.map(String).join('.') || '(root)'}`;

/** Registration words for the server's refusal codes (`eqv.registerEquipment`). */
export function registerFailure(answer: { outcome: string; fieldErrors: readonly { path: readonly (string | number)[]; code: string }[] }): string {
  if (answer.outcome === 'forbidden') return '권한이 없어 등록하지 못했습니다.';
  const [first] = answer.fieldErrors;
  if (answer.outcome !== 'invalid' || !first) return '등록하지 못했습니다. 다시 시도하세요.';
  if (first.path[0] === 'equipmentId') return first.code === 'exists' ? '이미 등록된 설비 ID입니다. 대소문자만 다른 ID도 같은 설비로 봅니다.' : '설비 ID를 확인하세요.';
  if (first.path[0] === 'label') return '이름을 확인하세요.';
  if (first.path[0] === 'vendorId' || first.path[0] === 'modelId') return '이 Model을 찾을 수 없습니다.';
  return `등록하지 못했습니다. ${fieldErrorLine(first)}`;
}
/** Client check of a new equipment id: what the address and the server both accept. */
export const equipmentIdProblem = (id: string): string | null =>
  id === '' ? null : id.length > EQUIPMENT_ID_MAX || !EQUIPMENT_ID_PATTERN.test(id) ? '영문·숫자로 시작하고 영문·숫자·.·_·-만 씁니다.' : null;
