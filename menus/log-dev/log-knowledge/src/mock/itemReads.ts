/**
 * Mock server half of the knowledge item reads (ADR-0109, #1197 s2): `logKnowledge.items` and `logKnowledge.itemDetail`,
 * answered like the real server (`modules/log-knowledge/item-endpoints.ts`): the common list params (an unknown field,
 * operator, value or sort id is an `error`, never an empty page), no `publicationState` condition = published only,
 * default sort `updatedAt` descending, `q` over the latest title and `KI-<n>` / `KI<n>`; an unknown id or a revision the
 * item does not have answers `ok` with `data: null`.
 */
import { validateFilters, type ColumnFilter, type PageResult } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { ITEM_SORT_IDS, itemDetailEndpoint, itemFilterSpecs, itemsEndpoint, specSubjectItemsEndpoint, type CatalogPageParams, type ItemDetail, type ItemDetailParams, type ItemRow, type SpecSubjectItemRow } from '../endpoints';
import { allItems, allLinks, itemById, latestRevision, ownerOf, type ItemRec } from './items';
import { resolvedSubjects } from './subjectLinks';

const PAGE_SIZE_MAX = 200, Q_MAX = 200, SORT_KEYS_MAX = 3, FILTER_VALUES_MAX = 200, REVISION_NO_MAX = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_KEYS = ['q', 'page', 'pageSize', 'sorting', 'filters'];
const UUID_FIELDS = ['ownerModelId', 'ownerSoftwareId'];
const TARGET_KEY_MAX = 1200;

/** Mirrors the server's `unsafeText` (platform-port/text-safety.ts): NUL and lone UTF-16 surrogates are refused. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const unsafeText = (value: string): boolean => value.includes('\u0000') || LONE_SURROGATE.test(value);

const exactKeys = (value: unknown, allowed: readonly string[]): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k));

/** The refusal message of a list read's params, or null. */
export function itemListMessage(params: CatalogPageParams): string | null {
  if (!exactKeys(params, LIST_KEYS)) return 'unknown param';
  const { q = null, page = 0, pageSize = 50, sorting = [], filters = [] } = params as Partial<CatalogPageParams>;
  if (q !== null && (typeof q !== 'string' || q.length > Q_MAX || unsafeText(q))) return `q must be a string of at most ${Q_MAX} characters or null`;
  if (!Number.isInteger(page) || page < 0 || page > 1_000_000) return 'page must be a non-negative integer (0-based)';
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) return `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`;
  if (!Array.isArray(sorting) || sorting.length > SORT_KEYS_MAX) return `sorting must be a list of at most ${SORT_KEYS_MAX} sort keys`;
  const seen = new Set<string>();
  for (const s of sorting) {
    if (!exactKeys(s, ['id', 'desc']) || typeof s.id !== 'string' || typeof s.desc !== 'boolean') return 'a sort key is { id: string, desc: boolean }';
    if (!(ITEM_SORT_IDS as readonly string[]).includes(s.id)) return `sorting by ${s.id} is not supported`;
    if (seen.has(s.id)) return `sorting by ${s.id} twice`;
    seen.add(s.id);
  }
  if (!Array.isArray(filters)) return 'filters must be a list of { id, op, value } conditions';
  for (const f of filters as readonly unknown[]) if (!exactKeys(f, ['id', 'op', 'value'])) return 'a filter is { id, op, value }';
  const check = validateFilters(filters, itemFilterSpecs);
  if (!check.ok) return `invalid filter ${check.filter.id}:${check.filter.op} (${check.reason})`;
  for (const f of filters) {
    if (f.op !== 'in' && f.op !== 'notIn') continue;
    if (f.value.length > FILTER_VALUES_MAX) return `filter ${f.id} takes at most ${FILTER_VALUES_MAX} values`;
    if (UUID_FIELDS.includes(f.id) && !f.value.every(v => UUID.test(v))) return `filter ${f.id} values are uuid strings`;
    const spec = itemFilterSpecs[f.id];
    // `subject` (#1196 f) is one escaped target key: free text, no closed vocabulary.
    if (f.id === 'subject' && !f.value.every(v => v.trim() !== '' && v.length <= TARGET_KEY_MAX && !unsafeText(v))) return `filter subject takes a non-blank target key of at most ${TARGET_KEY_MAX} characters`;
    if (!UUID_FIELDS.includes(f.id) && f.id !== 'subject' && spec?.kind === 'enum' && !f.value.every(v => spec.options.some(o => o.value === v))) return `filter ${f.id} accepts only its listed values`;
  }
  return null;
}

function detailMessage(params: ItemDetailParams): string | null {
  if (!exactKeys(params, ['itemId', 'revisionNo'])) return 'unknown param';
  if (typeof params.itemId !== 'string' || !UUID.test(params.itemId)) return 'itemId must be a uuid string';
  const n = params.revisionNo;
  if (n !== undefined && !(typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= REVISION_NO_MAX)) return 'revisionNo must be a positive integer';
  return null;
}

type Condition = { op: 'in' | 'notIn'; values: string[] };
const conditionsOf = (filters: readonly ColumnFilter[] = []): Record<string, Condition> => Object.fromEntries(
  filters.flatMap(f => (f.op === 'in' || f.op === 'notIn' ? [[f.id, { op: f.op, values: f.id === 'includeSoftware' || !UUID_FIELDS.includes(f.id) ? f.value : f.value.map(v => v.toLowerCase()) }]] : [])),
);
const pass = (c: Condition | undefined, value: string | null): boolean =>
  c === undefined || (c.op === 'in' ? value !== null && c.values.includes(value) : value !== null && !c.values.includes(value));

export function toRow(rec: ItemRec): ItemRow {
  const rev = latestRevision(rec);
  return {
    id: rec.id, itemNo: rec.itemNo, title: rev.title, typeCode: rev.typeCode as ItemRow['typeCode'], owner: ownerOf(rec),
    verificationState: rec.verificationState as ItemRow['verificationState'], processingState: rec.processingState as ItemRow['processingState'],
    publicationState: rec.publicationState as ItemRow['publicationState'], latestRevisionNo: rev.revisionNo, updatedAt: rec.updatedAt,
  };
}

function list(params: CatalogPageParams): PageResult<ItemRow> {
  const { q = null, page = 0, pageSize = 50, sorting = [], filters } = params;
  const c = conditionsOf(filters);
  const includeSoftware = c.includeSoftware?.values[0] === 'true';
  const text = q?.trim() ?? '';
  const no = /^ki-?(\d{1,9})$/i.exec(text);
  const rows = allItems().map(toRow).filter(row => {
    const rec = itemById(row.id)!;
    // No publicationState condition = published only (the server's rule); an explicit one is the caller's choice.
    if (c.publicationState ? !pass(c.publicationState, row.publicationState) : row.publicationState !== 'published') return false;
    if (c.ownerKind && !pass(c.ownerKind, row.owner.kind)) return false;
    if (c.ownerModelId && !pass(c.ownerModelId, includeSoftware ? row.owner.modelId : rec.ownerModelId)) return false;
    if (c.ownerSoftwareId && !pass(c.ownerSoftwareId, rec.ownerSoftwareId)) return false;
    // `subject`: the LATEST revision has a subject with this target key (the model is scoped by `ownerModelId`).
    if (c.subject && !pass(c.subject, (rec.subjects[row.latestRevisionNo] ?? []).some(s => s.targetKey === c.subject!.values[0]) ? c.subject.values[0]! : null)) return false;
    if (!pass(c.typeCode, row.typeCode) || !pass(c.verificationState, row.verificationState) || !pass(c.processingState, row.processingState)) return false;
    return text === '' || row.title.toLowerCase().includes(text.toLowerCase()) || (no !== null && row.itemNo === Number(no[1]));
  });
  const keys = sorting.length > 0 ? sorting : [{ id: 'updatedAt', desc: true }];
  const value = (r: ItemRow, id: string): string | number => (id === 'itemNo' ? r.itemNo : id === 'title' ? r.title : r.updatedAt);
  rows.sort((a, b) => {
    for (const k of keys) {
      const x = value(a, k.id), y = value(b, k.id);
      if (x !== y) return (x < y ? -1 : 1) * (k.desc ? -1 : 1);
    }
    return a.id < b.id ? -1 : 1;
  });
  return { rows: rows.slice(page * pageSize, (page + 1) * pageSize), total: rows.length };
}

function detail(params: ItemDetailParams): ItemDetail | null {
  const rec = itemById(params.itemId);
  if (!rec) return null;
  const rev = rec.revisions.find(r => r.revisionNo === (params.revisionNo ?? latestRevision(rec).revisionNo));
  if (!rev) return null;
  const linkRows = allLinks().flatMap(l => {
    const outgoing = l.sourceItemId === rec.id;
    if (!outgoing && l.targetItemId !== rec.id) return [];
    const other = itemById(outgoing ? l.targetItemId : l.sourceItemId)!;
    return [{ kind: l.kind, direction: outgoing ? ('outgoing' as const) : ('incoming' as const), itemId: other.id, itemNo: other.itemNo, title: latestRevision(other).title, owner: ownerOf(other), sourceRevisionNo: l.sourceRevisionNo }];
  });
  return {
    item: { ...toRow(rec), version: String(rec.rowVersion), createdBy: rec.createdBy, createdAt: rec.createdAt },
    revision: rev as ItemDetail['revision'],
    revisions: [...rec.revisions].reverse().map(r => ({ revisionNo: r.revisionNo, title: r.title, publishedBy: r.publishedBy, publishedAt: r.publishedAt, changeNote: r.changeNote })),
    assessments: [...rec.assessments].sort((a, b) => (a.observedAt === b.observedAt ? (a.id < b.id ? 1 : -1) : a.observedAt < b.observedAt ? 1 : -1)),
    links: linkRows,
    subjects: resolvedSubjects(rec, rev.revisionNo),
  };
}

const subjectItemsMessage = (p: { modelId?: unknown; targetKey?: unknown; page?: unknown; pageSize?: unknown }): string | null => {
  if (typeof p.modelId !== 'string' || !UUID.test(p.modelId)) return 'modelId must be a uuid string';
  if (typeof p.targetKey !== 'string' || p.targetKey.trim() === '' || p.targetKey.length > TARGET_KEY_MAX || unsafeText(p.targetKey)) return `targetKey must be non-blank text of at most ${TARGET_KEY_MAX} characters`;
  if (p.page !== undefined && (typeof p.page !== 'number' || !Number.isInteger(p.page) || p.page < 0 || p.page > 1_000_000)) return 'page must be a non-negative integer (0-based)';
  if (p.pageSize !== undefined && (typeof p.pageSize !== 'number' || !Number.isInteger(p.pageSize) || p.pageSize < 1 || p.pageSize > PAGE_SIZE_MAX)) return `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`;
  return null;
};

export const itemReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(itemsEndpoint, { mart: false, validate: ({ params }) => itemListMessage(params), handle: ({ params }) => list(params) }),
  defineMockEndpoint(itemDetailEndpoint, { mart: false, validate: ({ params }) => detailMessage(params), handle: ({ params }) => detail(params) }),
];

/** The spec detail's «이 이벤트를 다룬 Item» read; registered with the spec reads (the server's order). */
export const subjectItemsMock: readonly AnyMockEndpoint[] = [
  // Published items whose LATEST revision is about this model target, newest update first.
  defineMockEndpoint(specSubjectItemsEndpoint, { mart: false, validate: ({ params }) => subjectItemsMessage(params), handle: ({ params: p }) => {
    const modelId = p.modelId.toLowerCase();
    const found = allItems().filter(rec => rec.publicationState === 'published').flatMap(rec => {
      const hit = (rec.subjects[latestRevision(rec).revisionNo] ?? []).find(s => s.modelId === modelId && s.targetKey === p.targetKey);
      return hit ? [{ ...toRow(rec), subjectRelation: hit.subjectRelation } satisfies SpecSubjectItemRow] : [];
    }).sort((a, b) => (a.updatedAt === b.updatedAt ? (a.id < b.id ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1));
    const size = p.pageSize ?? 50, page = p.page ?? 0;
    return { rows: found.slice(page * size, (page + 1) * size), total: found.length };
  } }),
];
