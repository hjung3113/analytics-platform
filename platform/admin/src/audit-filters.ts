/**
 * The 변경 감사 page's filter fields (ADR-0105, #1217 node e2). Every condition is one `ColumnFilter` in the hidden repeated page key `filter`; the
 * page maps them to the typed `auditTrail` port query (`toAuditQuery`), the port itself is unchanged. The ids are the table's column ids, so the
 * port's `type` is the `targetType` column. Pure and node-runnable.
 */
import { type AuditSortField, type AuditTrailQuery, type ColumnFilter, type ColumnFilterSpec, type PageSort, type Text } from '@ap/contracts';
import type { InstantEntry } from '@ap/components';
import { ACTION_LABEL, AUDIT_ACTIONS, AUDIT_SOURCES, AUDIT_TYPE_TOKEN, SOURCE_LABEL } from './audit-query';
import { BAD_TOKEN, invalidText } from './token';

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

/** 시각 is entered to the second in the viewer's explicit zone: a nonexistent or repeated local time (DST) is refused in the editor, never moved (#305). */
export const auditTimeEntry = (timeZone: string): InstantEntry => ({ timeZone, precision: 'second' });

const BAD_TYPE: Text = { ko: '영문자로 시작하는 80자 이하 토큰이어야 합니다 (영문·숫자·_ . : -).', en: 'Must be a token of up to 80 characters that starts with a letter (letters, digits, _ . : -).' };
const BAD_MEMBER: Text = { ko: '목록에 없는 값입니다.', en: 'This value is not in the list.' };

/** The port's value rules, checked before any query (address and editor): token shapes of `type`/`actor`/`targetId` and membership of `action`/`source`. A well-formed unknown type is allowed. */
export function auditValueCheck(filter: ColumnFilter): Text | null {
  switch (filter.id) {
    case 'targetType': return filter.op === 'equals' && !AUDIT_TYPE_TOKEN.test(filter.value) ? BAD_TYPE : null;
    case 'actor': case 'targetId': return filter.op === 'equals' && invalidText(filter.value) ? BAD_TOKEN : null;
    case 'action': return filter.op === 'in' && !filter.value.every(v => AUDIT_ACTIONS.includes(v)) ? BAD_MEMBER : null;
    case 'source': return filter.op === 'in' && !filter.value.every(v => AUDIT_SOURCES.includes(v)) ? BAD_MEMBER : null;
    default: return null;
  }
}

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
