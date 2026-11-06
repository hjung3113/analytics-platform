import type { ReactNode } from 'react';
import { useI18n } from '@ap/kernel';
import { formatInstant, type FieldError } from '@ap/contracts';
import { Button, FieldLabel, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@ap/ui';
export function useSpecWords() {
  const { tx } = useI18n();
  return (ko: string, en: string) => tx({ ko, en });
}
/** ISO instants of this screen in the viewer's language; the kernel's time-zone contract stays in `formatInstant`. */
export function useSpecInstant() {
  const { lang } = useI18n();
  return (iso: string) => formatInstant(iso, lang);
}
/** Localized text of the spec actions' closed error vocabulary (the catalog's `fieldErrorText` pattern). */
const SPEC_CODE_TEXT: Record<string, { ko: string; en: string }> = {
  required: { ko: '필수 값입니다.', en: 'This field is required.' },
  too_long: { ko: '너무 깁니다.', en: 'This value is too long.' },
  too_large: { ko: '너무 큽니다.', en: 'This value is too large.' },
  malformed: { ko: '형식을 확인해 주세요.', en: 'Check the format.' },
  rows_or_text: { ko: '구조화된 행과 텍스트는 한 번에 하나만 보낼 수 있습니다.', en: 'Send structured rows or text, not both.' },
  duplicate: { ko: '이미 있는 대상입니다.', en: 'This target already exists.' },
  not_found: { ko: '찾을 수 없습니다.', en: 'Not found.' },
  unexpected_field: { ko: '알 수 없는 값입니다.', en: 'Unknown field.' },
  target_mismatch: { ko: '값의 이름이 대상과 일치하지 않습니다.', en: 'The value name does not match the target.' },
  already_exists: { ko: '이미 있는 대상입니다.', en: 'This target already exists.' },
  overlap: { ko: '같은 대상의 적용 구간이 겹칩니다.', en: 'Another change overlaps this target.' },
  too_many: { ko: '열린 변경점이 너무 많습니다.', en: 'Too many open changes.' },
  empty: { ko: '내용이 비어 있어 발행할 수 없습니다.', en: 'The draft is empty and cannot be published.' },
  not_after_start: { ko: '종료 시점이 시작보다 앞섭니다.', en: 'The end must come after the start.' },
  already_retired: { ko: '이미 닫힌 변경점입니다.', en: 'This change is already retired.' },
  not_set: { ko: '재검토 필요 표시가 없습니다.', en: 'The revalidation flag is not set.' },
  conflict: { ko: '다른 쓰기가 먼저 완료됐습니다.', en: 'Another write completed first.' },
  none_published: { ko: '발행된 명세가 없습니다.', en: 'No published specification.' },
  draft_exists: { ko: '열린 초안이 이미 있습니다.', en: 'An open draft already exists.' },
  invalid_headers: { ko: 'TSV 첫 행의 열 이름을 확인해 주세요.', en: 'Check the header row of the TSV.' },
  unknown_column: { ko: '알 수 없는 열 이름입니다.', en: 'Unknown column name.' },
  duplicate_column: { ko: '열 이름이 중복됩니다.', en: 'Duplicate column name.' },
  unexpected_value: { ko: '이 종류의 행에는 쓸 수 없는 칸입니다.', en: 'This column is not used by this kind of row.' },
  too_many_cells: { ko: '칸이 열 이름보다 많습니다.', en: 'The row has more cells than columns.' },
  unknown_value: { ko: '알 수 없는 값입니다. module, event, relation 중 하나여야 합니다.', en: 'Unknown value. Use module, event or relation.' },
  cycle: { ko: '상위 Module이 순환합니다.', en: 'The parent Modules form a cycle.' },
  self_relation: { ko: '관계의 양쪽이 같은 Event입니다.', en: 'Both ends of the relation are the same Event.' },
};
/** Where a wire error lands: the editor control that owns it and the part of the path worth showing. */
export type FieldRoute = (path: readonly string[]) => { control: string; path: readonly string[] } | null;
export type FieldFeedback = { fields: Record<string, string>; rest: string[] };
const MAX_LINES = 20;
/** Server field errors aggregated per editor control with a readable location and reason; errors no control owns
 *  come back in `rest` so the caller can show them next to the summary instead of dropping them. */
export function useSpecFieldErrors() {
  const w = useSpecWords();
  const place = (path: readonly string[]): string => {
    if (path[0] === 'text') {
      const line = path.find(part => part.startsWith('line ')), column = path.find(part => part.startsWith('column '));
      return [line ? w(`${line.slice(5)}행`, `Line ${line.slice(5)}`) : '', column ? column.slice(7) : ''].filter(Boolean).join(' · ');
    }
    return path.reduce((out, part) => /^\d+$/.test(part) ? `${out}[${part}]` : out ? `${out}.${part}` : part, '');
  };
  return (errors: readonly FieldError[], route: FieldRoute): FieldFeedback => {
    const lines: Record<string, string[]> = {}, rest: string[] = [], totals: Record<string, string> = {};
    let restTotal = '';
    for (const error of errors) {
      const known = SPEC_CODE_TEXT[error.code];
      const more = error.path[1] === 'more_errors' && error.path[0] === 'text';
      const reason = more ? w(`오류가 모두 ${error.code}건입니다. 앞의 일부만 표시합니다.`, `${error.code} errors in total; only the first are shown.`) : known ? w(known.ko, known.en) : w('입력을 확인해 주세요.', 'Check this input.');
      const target = route(error.path), where = more ? '' : place(target?.path ?? error.path);
      const line = where ? `${where}: ${reason}` : reason;
      // The server's total-error marker is kept apart from the detail-line budget: the display cut never replaces it.
      if (more) { if (target) totals[target.control] = line; else restTotal = line; continue; }
      if (target) (lines[target.control] ??= []).push(line); else rest.push(line);
    }
    const cut = (list: string[], total?: string) => [...(list.length > MAX_LINES ? [...list.slice(0, MAX_LINES), w(`…외 ${list.length - MAX_LINES}건`, `… and ${list.length - MAX_LINES} more`)] : list), ...(total ? [total] : [])];
    const controls = new Set([...Object.keys(lines), ...Object.keys(totals)]);
    return { fields: Object.fromEntries([...controls].map(control => [control, cut(lines[control] ?? [], totals[control]).join('\n')])), rest: cut(rest, restTotal) };
  };
}
export function SpecSelect({ label, value, options, onChange, disabled, hideLabel = false }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean; hideLabel?: boolean }) {
  return <div className="grid min-w-0 gap-1 text-sm">{!hideLabel && <span className="text-text-secondary">{label}</span>}<Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={label} className="w-full min-w-0"><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
  </Select></div>;
}
export function SpecField({ id, label, value, onChange, multiline = false, disabled = false, hint, error, required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean; hint?: ReactNode; error?: string; required?: boolean }) {
  const hintId = hint !== undefined && !error ? `${id}-hint` : undefined, errorId = error !== undefined ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const props = { id, value, disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value), 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true } : {}), ...(required ? { 'aria-required': true } : {}) };
  return <div className="grid gap-1.5"><FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>{multiline ? <Textarea {...props} /> : <Input {...props} />}
    {error && <p id={errorId} role="alert" className="whitespace-pre-line text-xs text-text-danger-label">{error}</p>}
    {hint && <p id={hintId} className="text-xs text-text-muted">{hint}</p>}
  </div>;
}
export function Pager({ page, size, total, onChange }: { page: number; size: number; total: number; onChange: (page: number) => void }) {
  const w = useSpecWords();
  return <div className="flex items-center gap-2 text-xs"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => onChange(page - 1)}>{w('이전', 'Previous')}</Button><span>{page * size + (total ? 1 : 0)}–{Math.min(total, (page + 1) * size)} / {total}</span><Button size="sm" variant="secondary" disabled={(page + 1) * size >= total} onClick={() => onChange(page + 1)}>{w('다음', 'Next')}</Button></div>;
}
