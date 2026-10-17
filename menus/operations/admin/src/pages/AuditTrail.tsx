import { useId, useMemo, useState } from 'react';
import { formatInstant, instantEpochMs, type AuditEvent, type AuditSortField, type Text } from '@ap/contracts';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { FilterApplyButton, ManagementLayout, PageFilterBar, type PlatformColumn, PlatformDataTable, PlatformPage, TableUrlWarning, encodeTableSort, focusPageFallback, useFilterDraft, useTableUrlWarning } from '@ap/components';
import { Button, Input, StatusBadge } from '@ap/ui';
import { auditDestination } from '../audit-destination';
import { ACTION_LABEL, AUDIT_PAGE_KEYS, SORT_FIELDS, SOURCE_LABEL, TYPE_LABEL, auditKeyProblem, parseAuditKeys, type AuditKeyProblem } from '../audit-query';
import { AUDIT_TIME_FIELD_EXAMPLE, instantToLocalField, localFieldToInstant, viewerTimeZone, type LocalFieldFailure } from '../audit-window';

type Lang = keyof Text;

const TIME_LABEL = {
  fromAt: { ko: '시각 이후', en: 'At or after' },
  toAt: { ko: '시각 미만', en: 'Before' },
} as const;

const FIELD_ERROR: Record<LocalFieldFailure | 'order', Text> = {
  format: { ko: `초까지 입력하세요. 예: ${AUDIT_TIME_FIELD_EXAMPLE}`, en: `Enter the time with seconds. Example: ${AUDIT_TIME_FIELD_EXAMPLE}` },
  calendar: { ko: '없는 날짜이거나 시각입니다.', en: 'That date or time does not exist.' },
  gap: { ko: '이 시간대에 없는 시각입니다.', en: 'That time does not exist in this time zone.' },
  fold: { ko: '이 시각은 같은 날 두 번입니다. 어느 쪽인지 알 수 없습니다.', en: 'That time happens twice on that day, so it is ambiguous.' },
  zone: { ko: '시간대를 확인할 수 없습니다.', en: 'The time zone could not be read.' },
  order: { ko: '시각 이후보다 뒤여야 합니다.', en: 'Must be later than the start time.' },
};

const URL_KEY: Record<AuditKeyProblem['key'], Text> = {
  sort: { ko: '정렬', en: 'Sort' },
  page: { ko: '페이지', en: 'Page' },
  type: { ko: '대상 유형', en: 'Type' },
  action: { ko: '작업', en: 'Action' },
  source: { ko: '출처', en: 'Source' },
  actor: { ko: '행위자', en: 'Actor' },
  targetId: { ko: '대상 ID', en: 'Target id' },
  fromAt: TIME_LABEL.fromAt,
  toAt: TIME_LABEL.toAt,
};

function urlProblemLine(problem: AuditKeyProblem, lang: Lang): string {
  const head = lang === 'ko' ? '필터 값이 잘못되었습니다.' : 'Invalid filter value.';
  if (problem.reason === 'order') {
    return lang === 'ko'
      ? `${head} 시각 미만은 시각 이후보다 뒤여야 합니다.`
      : `${head} Before must be later than At or after.`;
  }
  if (problem.reason === 'needs-type') {
    return lang === 'ko'
      ? `${head} 대상 ID는 대상 유형과 함께 있어야 합니다.`
      : `${head} A target id needs a type.`;
  }
  const name = URL_KEY[problem.key][lang];
  if (problem.reason === 'calendar') {
    return lang === 'ko'
      ? `${head} ${name}에 없는 날짜가 있습니다. 날짜를 고치거나 필터를 초기화하세요.`
      : `${head} The ${name} value is a date that does not exist. Fix the date or reset the filters.`;
  }
  if ((problem.key === 'fromAt' || problem.key === 'toAt') && problem.reason === 'invalid') {
    return lang === 'ko'
      ? `${head} ${name} 값의 형식을 읽을 수 없습니다. 값을 고치거나 필터를 초기화하세요.`
      : `${head} The ${name} value is not in a readable format. Fix the value or reset the filters.`;
  }
  return lang === 'ko' ? `${head} ${name} 값을 읽을 수 없습니다.` : `${head} The ${name} value cannot be read.`;
}

function shownTime(urlValue: string | null, timeZone: string): string {
  if (!urlValue) return '';
  return instantToLocalField(urlValue, timeZone) ?? urlValue;
}

/** Unedited field whose text is still the URL instant's local form keeps that instant, fractions included. */
function resolveTime(text: string, touched: boolean, origin: string | null, timeZone: string):
  | { ok: true; value: string | null }
  | { ok: false; reason: LocalFieldFailure } {
  if (text.trim() === '') return { ok: true, value: null };
  const local = origin ? instantToLocalField(origin, timeZone) : null;
  if (!touched && origin && local !== null && text.trim() === local) return { ok: true, value: origin };
  const converted = localFieldToInstant(text, timeZone);
  if (!converted.ok) return converted;
  return { ok: true, value: converted.instant };
}

function AuditTimeInput({ label, value, error, onValueChange }: { label: string; value: string; error: string | null; onValueChange: (value: string) => void }) {
  const errorId = useId();
  return <>
    <Input
      aria-label={label}
      value={value}
      placeholder={AUDIT_TIME_FIELD_EXAMPLE}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onChange={event => onValueChange(event.target.value)}
      className="w-full border-border-control"
    />
    {error ? <p id={errorId} className="text-xs text-text-danger-label">{error}</p> : null}
  </>;
}

const mono = (value: unknown) => <span className="t-mono">{String(value)}</span>;

/**
 * 변경 감사 (issue #50, 06 §12.3 management list). The console's index over the shared audit store: the
 * table is the index, the destination's own AuditTimeline is the detail, and a row links out with linkTo
 * instead of opening a second timeline in a drawer. Server-side sort/page (offset, not cursor), the client
 * never re-sorts a page; the default sort is the server's newest-first and no URL key is written for it.
 */
export default function AuditTrail() {
  const { t, lang } = useI18n();
  const ko = lang === 'ko';
  const timeZone = viewerTimeZone();
  const { adapter, global, linkTo, pageParam, setPage } = usePlatform();
  const raw = {
    type: pageParam('type'), actor: pageParam('actor'), action: pageParam('action'), source: pageParam('source'),
    fromAt: pageParam('fromAt'), toAt: pageParam('toAt'), targetId: pageParam('targetId'),
    sort: pageParam('sort'), page: pageParam('page'),
  };
  // §6.1 page keys: an invalid wire value alerts instead of substituting, and no adapter call is made.
  const parsed = parseAuditKeys(raw);
  // auditKeyProblem reports sort/page first and stops, so the filter keys are judged without them. A bad filter key keeps the
  // screen's own alert (its reset clears every key); only a bad sort/page is the shared table warning, which keeps applied filters.
  const filterProblem = auditKeyProblem({ ...raw, sort: null, page: null });
  const tableWarning = useTableUrlWarning(SORT_FIELDS);
  const filterKey = JSON.stringify(parsed.ok ? parsed.filters : null);
  // Draft + apply (ADR-0037): every field is a draft held above ManagementLayout. The draft holds viewer-local display
  // text; the raw URL instants stay in `raw` for resolveTime. The draft rebases (and the time metadata resets) when any
  // of the seven raw applied values or the time zone changes — even if the displayed text stays equal — never on
  // ordinary rerenders or non-filter URL changes.
  const identity = JSON.stringify([raw.type, raw.action, raw.source, raw.actor, raw.targetId, raw.fromAt, raw.toAt, timeZone]);
  const draft = useFilterDraft({
    type: raw.type ?? '', action: raw.action ?? '', source: raw.source ?? '', actor: raw.actor ?? '', targetId: raw.targetId ?? '',
    fromAt: shownTime(raw.fromAt, timeZone), toAt: shownTime(raw.toAt, timeZone),
  }, identity);
  const [timeTouched, setTimeTouched] = useState({ fromAt: false, toAt: false });
  const [timeError, setTimeError] = useState<{ fromAt: string | null; toAt: string | null }>({ fromAt: null, toAt: null });
  const [syncedIdentity, setSyncedIdentity] = useState(identity);
  if (syncedIdentity !== identity) {
    setSyncedIdentity(identity);
    setTimeTouched({ fromAt: false, toAt: false });
    setTimeError({ fromAt: null, toAt: null });
  }
  const setTimeDraft = (key: 'fromAt' | 'toAt', value: string) => {
    draft.set(key, value);
    setTimeTouched(current => ({ ...current, [key]: true }));
    setTimeError(current => ({ ...current, [key]: null }));
  };
  const applyDrafts = () => {
    const from = resolveTime(draft.values.fromAt, timeTouched.fromAt, raw.fromAt, timeZone);
    const to = resolveTime(draft.values.toAt, timeTouched.toAt, raw.toAt, timeZone);
    let fromMessage = from.ok ? null : FIELD_ERROR[from.reason][lang];
    let toMessage = to.ok ? null : FIELD_ERROR[to.reason][lang];
    if (from.ok && to.ok && from.value !== null && to.value !== null && fromMessage === null && toMessage === null) {
      try {
        if (instantEpochMs(from.value) >= instantEpochMs(to.value)) toMessage = FIELD_ERROR.order[lang];
      } catch {
        fromMessage = FIELD_ERROR.format[lang];
      }
    }
    setTimeError({ fromAt: fromMessage, toAt: toMessage });
    if (fromMessage || toMessage || !from.ok || !to.ok) return;
    setPage({ ...draft.patch(), fromAt: from.value, toAt: to.value, page: null });
  };
  const activeFilterCount = [raw.type, raw.actor, raw.action, raw.source, raw.fromAt, raw.toAt, raw.targetId].filter(Boolean).length;
  const clearFilters = () => {
    draft.reset({});
    setTimeTouched({ fromAt: false, toAt: false });
    setTimeError({ fromAt: null, toAt: null });
    setPage(Object.fromEntries(AUDIT_PAGE_KEYS.map(k => [k, null])));
  };
  // Recovery from an invalid URL always offers the reset; the filter footer and the empty state only when a filter is applied.
  const clear = activeFilterCount > 0 ? <Button type="button" size="sm" variant="secondary" onClick={clearFilters}>{t('clearFilters')}</Button> : null;
  // The alert's button disappears with the alert, so focus goes to main first (06 §26); the footer button keeps the filter bar's own rule.
  const recover = <Button type="button" size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); clearFilters(); }}>{t('clearFilters')}</Button>;
  const select = (key: 'type' | 'action' | 'source', label: string, labels: Record<string, Text>) =>
    ({ kind: 'select', key, label, value: draft.values[key], emptyOptionLabel: ko ? '전체' : 'All', options: Object.entries(labels).map(([value, text]) => ({ value, label: text[lang] })), onValueChange: (value: string) => draft.set(key, value) }) as const;
  const filters = <PageFilterBar orientation="column" label={ko ? '감사 필터' : 'Audit filters'} onApply={applyDrafts} fields={[
      select('type', ko ? '대상 유형' : 'Type', TYPE_LABEL),
      select('action', ko ? '작업' : 'Action', ACTION_LABEL),
      select('source', ko ? '출처' : 'Source', SOURCE_LABEL),
      { kind: 'text', key: 'actor', label: ko ? '행위자 정확 일치' : 'Exact actor', value: draft.values.actor, onValueChange: value => draft.set('actor', value) },
      { kind: 'text', key: 'targetId', label: ko ? '대상 ID 정확 일치' : 'Exact target id', value: draft.values.targetId, onValueChange: value => draft.set('targetId', value) },
      { kind: 'custom', key: 'fromAt', label: TIME_LABEL.fromAt[lang], content: <AuditTimeInput label={TIME_LABEL.fromAt[lang]} value={draft.values.fromAt} error={timeError.fromAt} onValueChange={value => setTimeDraft('fromAt', value)} /> },
      { kind: 'custom', key: 'toAt', label: TIME_LABEL.toAt[lang], content: <AuditTimeInput label={TIME_LABEL.toAt[lang]} value={draft.values.toAt} error={timeError.toAt} onValueChange={value => setTimeDraft('toAt', value)} /> },
    ]} actions={<><FilterApplyButton changedCount={draft.changedCount} />{clear}</>} />;
  const columns = useMemo<PlatformColumn<AuditEvent>[]>(() => [
    { id: 'at', header: ko ? '시각' : 'At', size: 150, cell: row => <span className="tabular">{formatInstant(row.at, lang, timeZone)}</span> },
    { id: 'actor', header: ko ? '행위자' : 'Actor', size: 130, cell: row => mono(row.actor) },
    { id: 'action', header: ko ? '작업' : 'Action', size: 110, cell: row => ACTION_LABEL[row.action][lang] },
    { id: 'source', header: ko ? '출처' : 'Source', size: 100, cell: row => <StatusBadge tone={row.source === 'system' ? 'neutral' : 'info'}>{SOURCE_LABEL[row.source][lang]}</StatusBadge> },
    { id: 'targetType', header: ko ? '대상 유형' : 'Target type', value: row => row.target.type, size: 110, cell: row => Object.hasOwn(TYPE_LABEL, row.target.type) ? TYPE_LABEL[row.target.type as 'equipment' | 'metric' | 'annotation'][lang] : mono(row.target.type) },
    { id: 'targetId', header: ko ? '대상 ID' : 'Target ID', sortable: false, value: row => row.target.id, size: 170, cell: row => mono(row.target.id) },
    { id: 'scopeId', header: ko ? '사이트' : 'Site', sortable: false, size: 90, cell: row => row.target.scopeId ?? '—' },
    { id: 'changes', header: ko ? '변경 필드' : 'Changed fields', sortable: false, size: 220, cell: row => row.changes ? Object.keys(row.changes).sort().join(', ') : '—' },
    { id: 'reason', header: ko ? '사유' : 'Reason', sortable: false, size: 200, cell: row => row.reason ? <span className="block truncate" title={row.reason}>{row.reason}</span> : '—' },
  ], [ko, lang, timeZone]);
  return <PlatformPage description={ko ? '모든 사이트의 마스터 변경 로그입니다. 행의 링크는 각 상세 화면의 변경 이력 탭으로 이동합니다.' : 'The master-change log across all sites. A row link opens the destination detail\'s change-history tab.'}>
    <ManagementLayout filter={filters} activeFilterCount={activeFilterCount} pendingFilterCount={draft.changedCount}
      table={filterSlot => <>
    {!parsed.ok && (filterProblem
      ? <div className="flex flex-col gap-3">{filterSlot}<p role="alert">{urlProblemLine(filterProblem, lang)} {recover}</p></div>
      : <TableUrlWarning filters={filterSlot} sentences={tableWarning.sentences} />)}
    {parsed.ok && <PlatformDataTable<AuditEvent>
        title={ko ? '변경 감사' : 'Audit trail'}
        ariaLabel={ko ? '변경 감사 목록' : 'Audit trail list'}
        subtitle={ko ? '합성 감사 이벤트입니다. 기본 정렬은 최신순이며 room 필터를 적용하지 않습니다.' : 'Synthetic audit events. Default sort is newest first; no room filter is applied.'}
        filters={filterSlot}
        columns={columns} getRowId={row => row.id} filterKey={filterKey}
        preferenceKey="admin-audit:columns:v1" pageSize={25}
        urlState={{
          page: parsed.page,
          sorting: parsed.sorting,
          onChange: ({ page, sorting }, reason) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }, { replace: reason === 'clamp' }),
        }}
        loadPage={async (pageQuery, signal) => {
          const { filters } = parsed;
          const sort = pageQuery.sorting[0];
          // The port answers AuditTrailPage { items, total }; the table wants PageResult { rows, total }.
          const response = await adapter.auditTrail({
            ...(filters.type && { type: filters.type }),
            ...(filters.actor && { actor: filters.actor }),
            ...(filters.action && { action: filters.action }),
            ...(filters.source && { source: filters.source }),
            ...(filters.fromAt && { fromAt: filters.fromAt }),
            ...(filters.toAt && { toAt: filters.toAt }),
            ...(filters.targetId && { targetId: filters.targetId }),
            ...(sort && { sort: { field: sort.id as AuditSortField, desc: sort.desc } }),
            page: pageQuery.page + 1,
            pageSize: 25,
          }, signal);
          return {
            outcome: response.outcome,
            data: response.data === null ? null : { rows: [...response.data.items], total: response.data.total },
            assessments: response.assessments,
            trust: response.trust,
            correlationId: response.correlationId,
            ...(response.message !== undefined && { message: response.message }),
          };
        }}
        emptyAction={clear}
        rowAction={row => {
          const link = auditDestination(linkTo, row.target);
          return link.ok
            ? <Button asChild size="toolbar" variant="ghost"><PlatformLink href={link.href} aria-label={ko ? `${row.target.id} 상세` : `Detail ${row.target.id}`}>{ko ? '상세' : 'Detail'}</PlatformLink></Button>
            : <span className="text-xs text-text-muted" title={ko ? '이 대상의 상세 화면이 없습니다.' : 'No detail screen for this target.'}>{ko ? '상세 화면 없음' : 'No detail page'}</span>;
        }}
      />}
      </>} />
  </PlatformPage>;
}
