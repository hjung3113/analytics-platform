/** PROTOTYPE fixture (#1195, never merged): one synthetic model CSV of 40 data rows that yields every plan state. Names are synthetic. */
export type PlanState = 'new' | 'unchanged' | 'update' | 'conflict' | 'error';
export type Resolution = 'create' | 'skip' | 'map';
export type ApplyStatus = 'applied' | 'unchanged' | 'skipped' | 'excluded' | 'unresolved' | 'conflict' | 'failed';
export type JobStatus = 'uploaded' | 'mapped' | 'review_required' | 'applying' | 'completed' | 'partial_failure' | 'failed' | 'cancelled';

export const STEPS = [
  { n: 1, id: 'file', label: '파일 선택' },
  { n: 2, id: 'map', label: '열 매핑' },
  { n: 3, id: 'validate', label: '검증 결과' },
  { n: 4, id: 'resolve', label: '충돌 해결' },
  { n: 5, id: 'result', label: '적용 결과' },
] as const;
export type StepNo = 1 | 2 | 3 | 4 | 5;

export const PLAN_LABEL: Record<PlanState, string> = { new: '신규 후보', unchanged: '기존 일치', update: '갱신 후보', conflict: '충돌', error: '오류' };
export const PLAN_TONE: Record<PlanState, 'info' | 'neutral' | 'warning' | 'danger' | 'danger'> = { new: 'info', unchanged: 'neutral', update: 'warning', conflict: 'danger', error: 'danger' };
export const STATUS_LABEL: Record<JobStatus, string> = {
  uploaded: '업로드됨', mapped: '매핑됨', review_required: '검토 필요', applying: '적용 중', completed: '완료', partial_failure: '일부 실패', failed: '실패', cancelled: '취소됨',
};
export const APPLY_LABEL: Record<ApplyStatus, string> = { applied: '반영', unchanged: '기존 유지', skipped: '건너뜀', excluded: '제외(오류)', unresolved: '미해결', conflict: '충돌', failed: '실패' };
export const ERROR_LABEL: Record<string, string> = {
  required: '필수 값 누락', parent_missing: '제조사 코드가 카탈로그에 없음', duplicate_in_file: '파일 안에서 키가 중복됨',
};

/** Source headers as the file names them, and the target fields of the model entity (api/log-knowledge.md §importMap). */
export const HEADERS = ['Maker', 'ModelNo', 'Name', 'Process', 'Memo'] as const;
export const FIELDS = [
  { id: 'vendor_code', label: '제조사 코드', required: true },
  { id: 'model_code', label: '모델 코드', required: true },
  { id: 'model_name', label: '모델 이름', required: true },
  { id: 'process_codes', label: '공정 코드 (; 또는 , 로 구분)', required: false },
] as const;
export type FieldId = typeof FIELDS[number]['id'];
export const DEFAULT_MAPPING: Record<FieldId, string> = { vendor_code: 'Maker', model_code: 'ModelNo', model_name: 'Name', process_codes: 'Process' };

export type ImportRow = {
  rowNo: number; raw: Record<typeof HEADERS[number], string>; planState: PlanState; error?: { code: string; column: string };
  /** Existing catalog row the plan reads (update / conflict / unchanged). */
  current?: { name: string; processes: string; active: boolean; rowVersion: number };
  /** Plan targets of a conflict that can be mapped to. */
  mapChoices?: { id: string; label: string }[];
  /** The resolution the demo has chosen (conflicts only; new rows default to create). */
  demoResolution?: { resolution: Resolution; mapTargetId?: string };
  /** What the apply pass does with it in the partial-failure scenario. */
  partial?: { status: ApplyStatus; reason?: string };
};

const V = { D: 'VENDOR_DEMO', A: 'VENDOR_ALPHA', B: 'VENDOR_BETA', G: 'VENDOR_GAMMA' };
type Def = [number, string, string, string, string, PlanState, Partial<ImportRow>?];
const DEFS: Def[] = [
  [1, V.D, 'MODEL_X100', 'Demo Model X100', 'ETCH;CLEAN', 'new'],
  [2, V.D, 'MODEL_X101', 'Demo Model X101', 'ETCH', 'new'],
  [3, V.D, 'MODEL_X102', 'Demo Model X102', 'CLEAN', 'new'],
  [4, V.D, 'MODEL_X110', 'Demo Model X110', 'ETCH', 'unchanged', { current: { name: 'Demo Model X110', processes: 'ETCH', active: true, rowVersion: 3 } }],
  [5, V.D, 'MODEL_X120', 'Demo Model X120', 'CLEAN', 'update', { current: { name: 'Demo X120', processes: 'CLEAN', active: true, rowVersion: 2 } }],
  [6, V.A, 'MODEL_A200', 'Alpha Model A200', 'DEPO', 'new'],
  [7, V.A, 'MODEL_A210', 'Alpha Model A210', 'DEPO;ETCH', 'new'],
  [8, V.A, 'MODEL_A220', 'Alpha Model A220', 'DEPO', 'unchanged', { current: { name: 'Alpha Model A220', processes: 'DEPO', active: true, rowVersion: 1 } }],
  [9, V.A, 'MODEL_A230', 'Alpha Model A230', 'ETCH;CLEAN', 'update', { current: { name: 'Alpha Model A230', processes: 'ETCH', active: true, rowVersion: 4 } }],
  [10, V.A, 'MODEL_A240', 'Alpha Model A240', 'CMP', 'new', { partial: { status: 'failed', reason: 'process_inactive' } }],
  [11, V.B, 'MODEL_B010', 'Beta Model B010', '', 'new'],
  [12, V.B, 'MODEL_B020', 'Beta Model B020', '', 'new'],
  [13, V.B, 'MODEL_B030', 'Beta Model B030', 'CMP', 'unchanged', { current: { name: 'Beta Model B030', processes: 'CMP', active: true, rowVersion: 1 } }],
  [14, V.B, 'MODEL_B040', 'Beta Forty', 'CMP', 'conflict', {
    current: { name: 'Beta Model B040', processes: 'CMP', active: false, rowVersion: 5 },
    mapChoices: [{ id: 'mdl-b041', label: 'MODEL_B041 · Beta Model B041' }, { id: 'mdl-b030', label: 'MODEL_B030 · Beta Model B030' }],
    demoResolution: { resolution: 'skip' },
  }],
  [15, V.B, 'MODEL_B050', 'Beta Model B050', 'CMP', 'new'],
  [16, V.G, 'MODEL_G001', 'Gamma Model G001', 'LITHO', 'new'],
  [17, V.G, 'MODEL_G002', 'Gamma Model G002', 'LITHO', 'new'],
  [18, V.G, 'MODEL_G003', 'Gamma Model G003', 'LITHO', 'unchanged', { current: { name: 'Gamma Model G003', processes: 'LITHO', active: true, rowVersion: 2 } }],
  [19, V.G, 'MODEL_G004', 'Gamma Model G004', 'LITHO', 'update', { current: { name: 'Gamma G004', processes: 'LITHO', active: true, rowVersion: 2 } }],
  [20, V.G, 'MODEL_G005', 'Gamma Model G005', 'LITHO', 'new'],
  [21, V.D, 'MODEL_X130', 'Demo Model X130', 'ETCH', 'new'],
  [22, V.D, 'MODEL_X140', 'Demo Model X140', 'ETCH', 'new'],
  [23, V.D, 'MODEL_X150', 'Demo Model X150', 'CLEAN', 'new'],
  [24, V.A, 'MODEL_A250', 'Alpha Model A250', 'DEPO', 'new'],
  [25, V.A, 'MODEL_A260', 'Alpha Model A260', 'DEPO', 'new'],
  [26, V.B, 'MODEL_B060', 'Beta Model B060', 'CMP', 'new'],
  [27, V.B, 'MODEL_B070', 'Beta Model B070', 'CMP', 'new'],
  [28, V.G, 'MODEL_G006', 'Gamma Model G006', 'LITHO', 'new'],
  [29, V.G, 'MODEL_G007', 'Gamma Model G007', 'LITHO', 'new', { partial: { status: 'failed', reason: 'parent_inactive' } }],
  [30, V.D, 'MODEL_X160', 'Demo Model X160', 'ETCH', 'unchanged', { current: { name: 'Demo Model X160', processes: 'ETCH', active: true, rowVersion: 1 } }],
  [31, V.A, 'MODEL_A270', 'Alpha Model A270', 'DEPO', 'update', { current: { name: 'Alpha A270', processes: 'DEPO', active: true, rowVersion: 3 } }],
  [32, V.B, 'MODEL_B080', 'Beta Model B080', 'CMP', 'unchanged', { current: { name: 'Beta Model B080', processes: 'CMP', active: true, rowVersion: 1 } }],
  [33, V.D, 'MODEL_X170', 'Demo Model X170 (rev)', 'ETCH', 'conflict', {
    current: { name: 'Demo Model X170', processes: 'ETCH', active: false, rowVersion: 6 },
    mapChoices: [{ id: 'mdl-x171', label: 'MODEL_X171 · Demo Model X171' }, { id: 'mdl-x160', label: 'MODEL_X160 · Demo Model X160' }],
    demoResolution: { resolution: 'map', mapTargetId: 'mdl-x171' },
  }],
  [34, V.B, 'MODEL_B090', 'Beta Model B090', 'CMP', 'update', { current: { name: 'Beta B090', processes: 'CMP', active: true, rowVersion: 2 } }],
  [35, V.G, 'MODEL_G008', 'Gamma Model G008', 'LITHO', 'new'],
  [36, '', 'MODEL_Z001', 'Zeta Model Z001', 'ETCH', 'error', { error: { code: 'required', column: 'Maker' } }],
  [37, 'VENDOR_OMEGA', 'MODEL_W001', 'Omega Model W001', 'ETCH', 'error', { error: { code: 'parent_missing', column: 'Maker' } }],
  [38, V.D, 'MODEL_X100', 'Demo Model X100 (dup)', 'ETCH', 'error', { error: { code: 'duplicate_in_file', column: 'ModelNo' } }],
  [39, V.D, 'MODEL_X180', 'Demo Model X180', 'ETCH', 'new'],
  [40, V.A, 'MODEL_A280', 'Alpha Model A280', 'DEPO', 'new', { partial: { status: 'conflict', reason: 'taken' } }],
];

export const ROWS: ImportRow[] = DEFS.map(([rowNo, vendor, code, name, procs, planState, extra]) => ({
  rowNo, raw: { Maker: vendor, ModelNo: code, Name: name, Process: procs, Memo: rowNo % 7 === 0 ? '검토 요청' : '' }, planState, ...extra,
}));

export const FACTS = { fileName: 'catalog_models_2026-11.csv', fileMeta: 'CSV · UTF-8 · 14 KB', sheet: '해당 없음 (CSV)', source: '파일 업로드 · 모델', checkedAt: '2026-11-04 09:12', totalRows: ROWS.length, jobId: 'imp-0412' } as const;

export const LIMITS = ['5 MB 이하', '데이터 5,000행 이하', '50열 이하', 'CSV는 UTF-8, XLSX는 시트 1개'];

export function planCounts(rows: ImportRow[] = ROWS): Record<PlanState, number> {
  const c: Record<PlanState, number> = { new: 0, unchanged: 0, update: 0, conflict: 0, error: 0 };
  for (const r of rows) c[r.planState] += 1;
  return c;
}

export type ResultState = 'completed' | 'partial_failure' | 'applying';
/** Per-row apply status under the demo resolutions (contract priorities: error → excluded, skip → skipped, then the plan). */
export function applyStatusOf(row: ImportRow, resolutions: Record<number, { resolution: Resolution; mapTargetId?: string }>, scenario: ResultState): { status: ApplyStatus; reason?: string } {
  if (row.planState === 'error') return { status: 'excluded' };
  const res = resolutions[row.rowNo];
  if (res?.resolution === 'skip') return { status: 'skipped' };
  if (row.planState === 'unchanged') return { status: 'unchanged' };
  if (row.planState === 'conflict' && res?.resolution !== 'map') return { status: 'unresolved' };
  if (scenario === 'partial_failure' && row.partial) return row.partial;
  if (scenario === 'applying' && row.rowNo > 26) return { status: 'applied' as ApplyStatus, reason: '__pending' };
  return { status: 'applied' };
}

export const DEMO_RESOLUTIONS: Record<number, { resolution: Resolution; mapTargetId?: string }> = Object.fromEntries(
  ROWS.filter(r => r.demoResolution).map(r => [r.rowNo, r.demoResolution!]));

export type JobListItem = { id: string; file: string; entity: string; status: JobStatus; rows: number; at: string; note: string };
export const JOBS: JobListItem[] = [
  { id: 'imp-0412', file: FACTS.fileName, entity: '모델', status: 'review_required', rows: 40, at: '2026-11-04 09:12', note: '충돌 2건 해결 대기' },
  { id: 'imp-0409', file: 'catalog_software_2026-10.csv', entity: 'SW 버전', status: 'partial_failure', rows: 212, at: '2026-11-02 16:40', note: '실패 3행 재시도 가능' },
  { id: 'imp-0405', file: 'catalog_vendors.xlsx', entity: '제조사', status: 'completed', rows: 18, at: '2026-10-28 11:05', note: '반영 18행' },
  { id: 'imp-0401', file: 'catalog_processes.csv', entity: '공정', status: 'cancelled', rows: 9, at: '2026-10-26 10:21', note: '봉인 전 취소' },
];
