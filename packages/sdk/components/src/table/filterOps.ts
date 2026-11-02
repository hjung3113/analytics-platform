import type { ColumnFilterOp } from '@ap/contracts';

/**
 * The words for every filter operator (ADR-0105): the XLSX 조회 정보 sheet and chips use them now, the 1217b editor's operator list
 * reuses them. One table so the sheet, the chips and the editor never name an operator differently. `eq` `gte` `lte` read as symbols
 * in a described value (`= 3`, `≥ 3`), as words here.
 */
export const FILTER_OP_LABELS: Readonly<Record<ColumnFilterOp, { ko: string; en: string }>> = {
  contains: { ko: '포함', en: 'contains' },
  notContains: { ko: '포함하지 않음', en: 'does not contain' },
  startsWith: { ko: '다음으로 시작', en: 'starts with' },
  endsWith: { ko: '다음으로 끝남', en: 'ends with' },
  equals: { ko: '같음', en: 'equals' },
  notEquals: { ko: '같지 않음', en: 'does not equal' },
  eq: { ko: '같음', en: 'equals' },
  neq: { ko: '같지 않음', en: 'does not equal' },
  gt: { ko: '초과', en: 'greater than' },
  gte: { ko: '이상', en: 'at least' },
  lt: { ko: '미만', en: 'less than' },
  lte: { ko: '이하', en: 'at most' },
  between: { ko: '범위', en: 'between' },
  before: { ko: '이전', en: 'before' },
  after: { ko: '이후', en: 'after' },
  in: { ko: '다음 중 하나', en: 'is one of' },
  notIn: { ko: '다음 중 아님', en: 'is none of' },
  isEmpty: { ko: '비어 있음', en: 'is empty' },
  isNotEmpty: { ko: '비어 있지 않음', en: 'is not empty' },
};
