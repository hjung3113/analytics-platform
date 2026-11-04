/**
 * Pure rules of the catalog import wizard (#1195 c): Korean sentences for every server answer, the paste refusal mapping, the step list,
 * the distinct new maker / process count, the conflict guide, and the three loops that talk to the server (read every page, resolve in
 * batches, apply until done). No React: the screens call these with their action and fetch functions.
 */
import type { ActionResult, ApiResponse, ColumnFilter, FieldError } from '@ap/contracts';
import type { ImportApplyCounts, ImportApplyResult, ImportApplyStatus, ImportDetail, ImportJobStatus, ImportPlanState, ImportResolveInput, ImportRowView, ImportStepResult } from '../../endpoints';

export const PASTE_ROW_LIMIT = 1000;
export const DETAIL_PAGE_SIZE = 200;
export const RESOLVE_BATCH = 500;
export const BUSY_WAIT_MS = 2000;
export const BUSY_TRIES = 30;
export const TEMPLATE_HEADER = '메이커명\t공정명\t모델명';
export const EXAMPLE = {
  header: ['메이커명', '공정명', '모델명'],
  rows: [['Alpha Semicap', 'Etch, Deposition', 'Alpha 300'], ['Beta Systems', 'Planarization', 'Beta 40']],
} as const;

// ---- steps ------------------------------------------------------------------------------------------------------

export type StepId = 1 | 2 | 3 | 4;
export const STEP_LABEL: Record<StepId, string> = { 1: '목록 붙여넣기', 2: '검사 결과', 3: '확인 필요 행 정리', 4: '적용 결과' };
/** Step 3 exists only when the check found rows that need a decision. */
export const stepSkipped = (step: StepId, conflicts: number): boolean => step === 3 && conflicts === 0;
export const nextStep = (step: StepId, conflicts: number): StepId => (step === 2 && conflicts === 0 ? 4 : ((step + 1) as StepId));
export const previousStep = (step: StepId, conflicts: number): StepId => (step === 4 && conflicts === 0 ? 2 : ((step - 1) as StepId));

// ---- labels and sentences ---------------------------------------------------------------------------------------

export const PLAN_LABEL: Record<ImportPlanState, string> = { pending: '검사 전', new: '새로 추가', update: '변경', unchanged: '그대로', conflict: '확인 필요', error: '오류' };
export const APPLY_LABEL: Record<ImportApplyStatus, string> = {
  applied: '반영', unchanged: '그대로', skipped: '건너뜀', excluded: '제외', unresolved: '정리 안 됨', conflict: '충돌', failed: '실패',
};
export const JOB_STATUS_LABEL: Record<ImportJobStatus, string> = {
  uploaded: '올림', mapped: '검사 전', validated: '검사 완료', review_required: '확인 필요', applying: '적용 중', completed: '완료', partial_failure: '일부 실패', failed: '실패', cancelled: '취소',
};
/** Column names as the owner's sheet writes them; the server's field ids never show. */
export const FIELD_LABEL: Record<string, string> = {
  vendor_name: '메이커명', vendor_code: '메이커명', model_name: '모델명', model_code: '모델명', process_names: '공정명', process_codes: '공정명', process_name: '공정명', process_code: '공정명',
};

/** Row error and conflict codes of the plan (contract §Catalog import: validate, §by names). */
export const PLAN_ERROR_SENTENCE: Record<string, string> = {
  required: '값이 비어 있습니다.',
  malformed: '쓸 수 없는 문자가 들어 있습니다.',
  too_long: '이름이 너무 깁니다. 64자 이하로 줄여 주세요.',
  duplicate: '이미 같은 이름이 있습니다.',
  duplicate_in_file: '붙여넣은 목록에 같은 메이커·모델이 이미 있습니다.',
  not_found: '카탈로그에서 찾을 수 없습니다.',
  inactive: '비활성 항목입니다.',
  parent_missing: '카탈로그에 없는 메이커입니다.',
  parent_inactive: '비활성 상태인 항목입니다.',
  process_missing: '카탈로그에 없는 공정입니다.',
  process_inactive: '비활성 상태인 공정입니다.',
  ambiguous_name: '같은 이름으로 읽히는 모델이 카탈로그에 둘 이상 있습니다.',
  ambiguous_parent: '같은 이름으로 읽히는 메이커·공정이 카탈로그에 둘 이상 있습니다.',
  formula: '수식 칸은 읽지 않습니다.',
  merged: '병합된 칸은 읽지 않습니다.',
  unsupported_cell: '읽을 수 없는 칸입니다.',
};
export const PLAN_ERROR_CODES: readonly string[] = Object.keys(PLAN_ERROR_SENTENCE);
export const PLAN_FALLBACK = '이 행은 확인이 필요합니다.';

/** Apply-time failure codes of a row (`applyError`). */
export const APPLY_ERROR_SENTENCE: Record<string, string> = {
  plan_changed: '검사 뒤에 목록이 바뀌어 반영하지 않았습니다. 다시 검사하세요.',
  parent_missing: '메이커가 카탈로그에 없어 반영하지 못했습니다.',
  parent_inactive: '메이커가 비활성이라 반영하지 못했습니다.',
  process_missing: '공정이 카탈로그에 없어 반영하지 못했습니다.',
  process_inactive: '공정이 비활성이라 반영하지 못했습니다.',
  ambiguous_parent: '같은 이름의 메이커·공정이 둘 이상이라 반영하지 못했습니다.',
  taken: '같은 이름이 그 사이 먼저 등록되었습니다.',
  stale_target: '카탈로그의 모델이 그 사이 바뀌었습니다.',
  inactive_target: '카탈로그의 모델이 비활성입니다.',
  identity_conflict: '이미 다른 항목에 연결된 이름입니다.',
  unexpected: '예상하지 못한 오류로 반영하지 못했습니다.',
};
export const APPLY_ERROR_CODES: readonly string[] = Object.keys(APPLY_ERROR_SENTENCE);
export const APPLY_FALLBACK = '반영하지 못했습니다. 다시 적용해 보세요.';

export function rowErrorText(error: { field: string; code: string }): string {
  const column = FIELD_LABEL[error.field];
  const sentence = PLAN_ERROR_SENTENCE[error.code] ?? PLAN_FALLBACK;
  return column ? `‘${column}’ ${sentence}` : sentence;
}
export const applyErrorText = (code: string | null): string => (code === null ? '' : (APPLY_ERROR_SENTENCE[code] ?? APPLY_FALLBACK));

/** A refused or unanswered import action with no field errors to show. */
export function actionFailureText(outcome: string): string {
  if (outcome === 'forbidden') return '이 작업을 할 권한이 없습니다.';
  if (outcome === 'not_found') return '가져오기 작업을 찾을 수 없습니다. 처음부터 다시 붙여넣어 주세요.';
  if (outcome === 'invalid') return '입력을 확인해 주세요.';
  return '서버에서 답을 받지 못했습니다. 잠시 후 다시 시도하세요.';
}

// ---- paste refusal ----------------------------------------------------------------------------------------------

/** File-level refusal codes of `importPaste` (contract §paste). */
const PASTE_SENTENCE: Record<string, (headers: string[]) => string> = {
  missing_header: headers => (headers.length > 0 ? `${headers.map(h => `‘${h}’`).join(', ')} 머리글이 없습니다. 첫 줄에 메이커명, 모델명(공정명은 선택) 머리글이 있어야 합니다.` : '필요한 머리글이 없습니다.'),
  duplicate_header: headers => `${headers.map(h => `‘${h}’`).join(', ')} 머리글이 같은 열로 겹칩니다. 한 열만 남겨 주세요.`,
  invalid_headers: () => '비어 있는 머리글이 있습니다. 첫 줄의 모든 칸에 열 이름을 적어 주세요.',
  empty: () => '붙여넣은 내용이 없습니다.',
  too_many_columns: () => '열이 너무 많습니다. 메이커명 · 공정명 · 모델명 열만 복사해 주세요.',
  unreadable: () => '줄마다 칸 수가 달라 읽을 수 없습니다. 엑셀에서 열을 그대로 복사했는지 확인하세요.',
  too_many_rows: () => `한 번에 ${PASTE_ROW_LIMIT.toLocaleString('ko-KR')}행까지 가져올 수 있습니다. 나누어 붙여넣어 주세요.`,
  file_too_large: () => '내용이 너무 큽니다. 나누어 붙여넣어 주세요.',
  required: () => '붙여넣은 내용이 없습니다.',
};
export const PASTE_REFUSAL_CODES: readonly string[] = [...Object.keys(PASTE_SENTENCE), 'busy'];
export const BUSY_TEXT = '잠시 후 다시 시도하세요.';

/** A refused paste as one sentence. `busy` is the retry-later answer: the button stays usable. */
export function pasteRefusalText(errors: readonly FieldError[]): { text: string; busy: boolean } {
  const top = errors.find(e => e.path.length === 1 && e.path[0] === 'text');
  if (top?.code === 'busy') return { text: BUSY_TEXT, busy: true };
  const headers = errors.filter(e => e.path[1] === 'headers' && typeof e.path[2] === 'string').map(e => e.path[2] as string);
  const sentence = top ? PASTE_SENTENCE[top.code] : undefined;
  return { text: sentence ? sentence(headers) : '붙여넣은 내용을 읽지 못했습니다. 엑셀에서 머리글 행과 함께 다시 복사해 주세요.', busy: false };
}

// ---- row cells ---------------------------------------------------------------------------------------------------

const ALIASES = { vendor: ['vendor_name', '메이커명', '메이커', '제조사'], model: ['model_name', '모델명', '모델'], process: ['process_names', '공정명', '공정'] } as const;
const fold = (value: string): string => value.normalize('NFKC').trim().toLowerCase();

/** The pasted maker / model / process text of a row: the job's own header mapping first, else the alias list. */
export function cellOf(row: Pick<ImportRowView, 'raw'>, kind: keyof typeof ALIASES, mapping: Record<string, string> | null): string {
  const mapped = mapping?.[ALIASES[kind][0]];
  if (mapped !== undefined && mapped in row.raw) return row.raw[mapped] ?? '';
  const names = ALIASES[kind].map(fold);
  const header = Object.keys(row.raw).find(h => names.includes(fold(h)));
  return header === undefined ? '' : (row.raw[header] ?? '');
}

/** The server's comparison key of a name (ADR-0107): NFKC, trim, inner whitespace runs to one space, upper case. */
export const toCodeKey = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toUpperCase();

/** 「새로 만들 메이커 N · 공정 M」: distinct planned parents over every row of the plan. Error and conflict rows write nothing. */
export function countNewParents(rows: readonly Pick<ImportRowView, 'planState' | 'creates'>[]): { vendors: number; processes: number } {
  const vendors = new Set<string>(), processes = new Set<string>();
  for (const row of rows) {
    if ((row.planState !== 'new' && row.planState !== 'update') || !row.creates) continue;
    if (row.creates.vendor !== undefined) vendors.add(toCodeKey(row.creates.vendor));
    for (const p of row.creates.processes) processes.add(toCodeKey(p));
  }
  return { vendors: vendors.size, processes: processes.size };
}

// ---- conflicts ---------------------------------------------------------------------------------------------------

export type ConflictKind = 'ambiguous_name' | 'ambiguous_parent' | 'parent_inactive' | 'inactive_model';
/** Which of the conflict kinds a row is; an inactive existing model carries a target and no code. */
export function conflictKind(row: Pick<ImportRowView, 'errors' | 'targetId'>): ConflictKind {
  const codes = row.errors.map(e => e.code);
  if (codes.includes('ambiguous_name')) return 'ambiguous_name';
  if (codes.includes('ambiguous_parent')) return 'ambiguous_parent';
  if (codes.includes('parent_inactive')) return 'parent_inactive';
  return 'inactive_model';
}
export const CONFLICT_GUIDE: Record<ConflictKind, { why: string; fix: string }> = {
  ambiguous_name: {
    why: '카탈로그에 같은 이름으로 읽히는 모델이 둘 이상 있어 어느 쪽인지 정할 수 없습니다.',
    fix: '카탈로그에서 두 모델 중 하나의 이름을 바꾼 뒤 「다시 검사」를 누르세요.',
  },
  ambiguous_parent: {
    why: '카탈로그에 같은 이름으로 읽히는 메이커 또는 공정이 둘 이상 있어 어느 쪽인지 정할 수 없습니다.',
    fix: '카탈로그에서 이름이 겹치는 메이커·공정 중 하나의 이름을 바꾼 뒤 「다시 검사」를 누르세요.',
  },
  parent_inactive: {
    why: '이름이 같은 메이커 또는 공정이 카탈로그에 있지만 비활성입니다. 비활성 항목은 새로 만들지 않습니다.',
    fix: '카탈로그에서 그 메이커·공정을 다시 활성화한 뒤 「다시 검사」를 누르세요.',
  },
  inactive_model: {
    why: '같은 모델이 카탈로그에 있지만 비활성입니다.',
    fix: '카탈로그에서 그 모델을 다시 활성화한 뒤 「다시 검사」를 누르세요.',
  },
};
export const conflictText = (row: Pick<ImportRowView, 'errors' | 'targetId'>): { why: string; fix: string } => CONFLICT_GUIDE[conflictKind(row)];

// ---- loops -------------------------------------------------------------------------------------------------------

type DetailFetch = (params: { page: number; pageSize: number; filters?: ColumnFilter[] }) => Promise<ApiResponse<ImportDetail>>;
export type AllRows = { ok: true; detail: ImportDetail; rows: ImportRowView[] } | { ok: false; outcome: string };

/** Every row of a job: pages of 200 until `total` is read (the job holds at most 1,000 rows). Never a single page. */
export async function fetchAllRows(fetchPage: DetailFetch, filters?: ColumnFilter[], pageSize = DETAIL_PAGE_SIZE): Promise<AllRows> {
  const rows: ImportRowView[] = [];
  let first: ImportDetail | null = null;
  for (let page = 0; ; page += 1) {
    const res = await fetchPage({ page, pageSize, ...(filters && filters.length > 0 ? { filters } : {}) });
    if (res.outcome === 'empty' && first) break;
    if ((res.outcome !== 'ok' && res.outcome !== 'empty') || !res.data) return { ok: false, outcome: res.outcome };
    first ??= res.data;
    rows.push(...res.data.rows);
    if (res.data.rows.length === 0 || rows.length >= res.data.total || page >= Math.ceil(PASTE_ROW_LIMIT / pageSize)) break;
  }
  return { ok: true, detail: first!, rows };
}

export type ResolveEnd = { ok: true; version: string | null; planVersion: number | null } | { ok: false; outcome: ActionResult<unknown>['outcome']; version: string | null; done: number };
type ResolveRun = (input: ImportResolveInput, options: { expectedVersion: string }) => Promise<ActionResult<ImportStepResult & { resolved: number }>>;

/** Skips the rows in batches of 500; each batch carries the version the previous answer returned. A stale version stops with the server's current one. */
export async function resolveInBatches(run: ResolveRun, jobId: string, rowNos: readonly number[], version: string): Promise<ResolveEnd> {
  let current = version, planVersion: number | null = null, done = 0;
  for (let at = 0; at < rowNos.length; at += RESOLVE_BATCH) {
    const batch = rowNos.slice(at, at + RESOLVE_BATCH);
    const res = await run({ jobId, resolutions: batch.map(rowNo => ({ rowNo, resolution: 'skip' as const })) }, { expectedVersion: current });
    if (res.outcome !== 'ok') return { ok: false, outcome: res.outcome, version: res.outcome === 'conflict' ? res.version : current, done };
    current = res.version ?? current; planVersion = res.data?.planVersion ?? planVersion; done += batch.length;
  }
  return { ok: true, version: current, planVersion };
}

export type ApplyEnd =
  | { kind: 'done'; status: 'completed' | 'partial_failure'; planVersion: number; counts: ImportApplyCounts }
  | { kind: 'conflict'; reason: 'plan_version' | 'state' }
  | { kind: 'not_found' }
  | { kind: 'busy' }
  | { kind: 'failed'; status?: ImportJobStatus }
  | { kind: 'stalled' }
  | { kind: 'aborted' };
export type ApplyProgress = { remaining: number; counts: ImportApplyCounts };
type ApplyStep = (expectedPlanVersion: number) => Promise<ActionResult<ImportApplyResult>>;
const RETRY_LIMIT = 2;
const STALL_LIMIT = 5;

/**
 * Calls `step` until the job is `completed` or `partial_failure`. Each call is fresh (a new idempotency key); only an `error` or
 * `unknown` answer is resent with its own `retry` (same key), at most twice. `busy` waits `backoffMs` and tries again, at most
 * `maxBusy` times in a row. Five progress answers without a smaller `remaining` end the loop (`stalled`) instead of spinning.
 */
export async function runApplyLoop(input: {
  step: ApplyStep; planVersion: number; onProgress?: (progress: ApplyProgress) => void; wait?: (ms: number) => Promise<void>; shouldStop?: () => boolean;
  backoffMs?: number; maxBusy?: number;
}): Promise<ApplyEnd> {
  const wait = input.wait ?? ((ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); }));
  const backoff = input.backoffMs ?? BUSY_WAIT_MS, maxBusy = input.maxBusy ?? BUSY_TRIES;
  let planVersion = input.planVersion, busy = 0, still = 0, lowest = Number.POSITIVE_INFINITY;
  for (;;) {
    if (input.shouldStop?.()) return { kind: 'aborted' };
    let res = await input.step(planVersion);
    for (let tries = 0; (res.outcome === 'error' || res.outcome === 'unknown') && res.retry && tries < RETRY_LIMIT; tries += 1) res = await res.retry();
    if (res.outcome !== 'ok' || !res.data) return { kind: 'failed' };
    const data = res.data;
    if (data.outcome === 'not_found') return { kind: 'not_found' };
    if (data.outcome === 'conflict') return { kind: 'conflict', reason: data.reason };
    if (data.outcome === 'busy') {
      busy += 1;
      if (busy >= maxBusy) return { kind: 'busy' };
      await wait(backoff);
      continue;
    }
    busy = 0; planVersion = data.planVersion;
    input.onProgress?.({ remaining: data.remaining, counts: data.counts });
    if (data.status === 'completed' || data.status === 'partial_failure') return { kind: 'done', status: data.status, planVersion, counts: data.counts };
    if (data.status === 'failed' || data.status === 'cancelled') return { kind: 'failed', status: data.status };
    if (data.remaining < lowest) { lowest = data.remaining; still = 0; } else { still += 1; if (still >= STALL_LIMIT) return { kind: 'stalled' }; }
  }
}

export const APPLY_END_TEXT = {
  conflict_plan_version: '검사한 뒤에 가져오기 작업이 바뀌었습니다. 「다시 검사」로 확인한 뒤 적용하세요. 아무것도 적용하지 않았습니다.',
  conflict_state: '이 가져오기 작업은 지금 적용할 수 없는 상태입니다. 「다시 검사」로 확인하세요.',
  not_found: '가져오기 작업을 찾을 수 없습니다. 처음부터 다시 붙여넣어 주세요.',
  busy: '다른 적용이 진행 중이라 잠시 기다렸지만 시작하지 못했습니다. 잠시 후 「적용」을 다시 누르세요.',
  failed: '적용 중 서버 응답을 받지 못했습니다. 아래 결과를 확인하고 다시 적용하세요.',
  stalled: '적용이 더 진행되지 않습니다. 잠시 후 「적용」을 다시 누르세요.',
} as const;
export function applyEndText(end: Exclude<ApplyEnd, { kind: 'done' | 'aborted' }>): string {
  if (end.kind === 'conflict') return end.reason === 'plan_version' ? APPLY_END_TEXT.conflict_plan_version : APPLY_END_TEXT.conflict_state;
  return APPLY_END_TEXT[end.kind];
}
