/**
 * The 변경 감사 page's filter fields (ADR-0105, #1217 node e2). Every condition is one `ColumnFilter` in the hidden repeated page key `filter`; the
 * page maps them to the typed `auditTrail` port query (`toAuditQuery`), the port itself is unchanged. The ids are the table's column ids, so the
 * port's `type` is the `targetType` column. Pure and node-runnable.
 */
import { instantEpochMs, type AuditSortField, type AuditTrailQuery, type ColumnFilter, type ColumnFilterSpec, type PageSort } from '@ap/contracts';
import { ACTION_LABEL, AT_INSTANT, AUDIT_ACTIONS, AUDIT_SOURCES, AUDIT_TYPE_TOKEN, SOURCE_LABEL, invalidText } from './audit-query';

type Lang = 'ko' | 'en';

/** Field ids = the audit table's column ids. */
export const AUDIT_FILTER_IDS = ['at', 'actor', 'action', 'source', 'targetType', 'targetId'] as const;

const wording = (labels: Record<string, { ko: string; en: string }>, lang: Lang) => Object.entries(labels).map(([value, text]) => ({ value, label: text[lang] }));

/** Wire meaning of each field, matching the port (`AuditTrailQuery`): exact case-sensitive actor/type/target id, ONE action and source, a half-open instant window, `targetId` only with a type. */
export function auditFilterSpecs(lang: Lang): Record<(typeof AUDIT_FILTER_IDS)[number], ColumnFilterSpec> {
  return {
    at: { kind: 'instant', ops: ['between'] },
    actor: { kind: 'text', ops: ['equals'], caseSensitive: true },
    action: { kind: 'enum', options: wording(ACTION_LABEL, lang), ops: ['in'], multiple: false },
    source: { kind: 'enum', options: wording(SOURCE_LABEL, lang), ops: ['in'], multiple: false },
    targetType: { kind: 'text', ops: ['equals'], caseSensitive: true },
    targetId: { kind: 'text', ops: ['equals'], caseSensitive: true, requires: ['targetType'] },
  };
}

/** Pinned fields of the filter line, in this order (R2: 작업 before 행위자; the column order is the other way round). */
export const AUDIT_PINNED: Readonly<Record<string, number>> = { action: 1, actor: 2 };

const equalsText = (id: string, raw: string): ColumnFilter | null => (invalidText(raw) ? null : { id, op: 'equals', value: raw });
const oneOf = (id: string, raw: string, allowed: readonly string[]): ColumnFilter | null => (allowed.includes(raw) ? { id, op: 'in', value: [raw] } : null);
const instantEnd = (end: 'from' | 'to', raw: string): ColumnFilter | null => {
  if (!AT_INSTANT.test(raw)) return null;
  try { instantEpochMs(raw); } catch { return null; }
  return { id: 'at', op: 'between', value: { [end]: raw } };
};

/**
 * The old single page keys as conditions, read for one release and rewritten away (P8). A value the old screen rejected is rejected here
 * (`null` → the codec's warning), never repaired. `fromAt` and `toAt` merge into the one `at` range.
 */
export const AUDIT_LEGACY_KEYS = [
  { key: 'type', toFilter: (raw: string) => (AUDIT_TYPE_TOKEN.test(raw) ? { id: 'targetType', op: 'equals' as const, value: raw } : null) },
  { key: 'actor', toFilter: (raw: string) => equalsText('actor', raw) },
  { key: 'action', toFilter: (raw: string) => oneOf('action', raw, AUDIT_ACTIONS) },
  { key: 'source', toFilter: (raw: string) => oneOf('source', raw, AUDIT_SOURCES) },
  { key: 'fromAt', toFilter: (raw: string) => instantEnd('from', raw) },
  { key: 'toAt', toFilter: (raw: string) => instantEnd('to', raw) },
  { key: 'targetId', toFilter: (raw: string) => equalsText('targetId', raw) },
];

/** The table page being asked for: 1-based page, the page size and the active sort. */
export type AuditPage = { page: number; pageSize: number; sorting: readonly PageSort[] };

/**
 * `ColumnFilter[]` → the typed port query. Every filter is mapped or the call throws: a condition is never dropped, so an undeclared one (which the
 * codec has already refused) cannot show the wrong rows.
 */
export function toAuditQuery(filters: readonly ColumnFilter[], { page, pageSize, sorting }: AuditPage): AuditTrailQuery {
  const query: AuditTrailQuery = {};
  for (const filter of filters) {
    switch (filter.id) {
      case 'actor': case 'targetType': case 'targetId': {
        if (filter.op !== 'equals') throw new RangeError(`toAuditQuery: ${filter.id} takes "equals", got "${filter.op}"`);
        if (filter.id === 'actor') query.actor = filter.value;
        else if (filter.id === 'targetType') query.type = filter.value;
        else query.targetId = filter.value;
        break;
      }
      case 'action': case 'source': {
        if (filter.op !== 'in' || filter.value.length !== 1) throw new RangeError(`toAuditQuery: ${filter.id} takes exactly one value`);
        if (filter.id === 'action') query.action = filter.value[0] as NonNullable<AuditTrailQuery['action']>;
        else query.source = filter.value[0] as NonNullable<AuditTrailQuery['source']>;
        break;
      }
      case 'at': {
        if (filter.op !== 'between' || Array.isArray(filter.value)) throw new RangeError('toAuditQuery: at takes a "between" window');
        if (filter.value.from) query.fromAt = filter.value.from;
        if (filter.value.to) query.toAt = filter.value.to;
        break;
      }
      default: throw new RangeError(`toAuditQuery: unknown field "${filter.id}"`);
    }
  }
  const sort = sorting[0];
  if (sort) query.sort = { field: sort.id as AuditSortField, desc: sort.desc };
  return { ...query, page, pageSize };
}
