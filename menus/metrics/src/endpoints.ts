/**
 * Metric query endpoints (docs/integration/menu-query-port.md §2.2, #129).
 * Client-safe: declarations, the catalog record types, and pure helpers the page and the server share
 * (`versionDiff`). The synthetic catalog itself and every lookup live in `src/mock/` (the server half).
 */
import { defineEndpoint, type AuditEvent, type PageQuery, type PageResult } from '@ap/contracts';

export type Text = { ko: string; en: string };
export type Lang = 'ko' | 'en';
export type PublicationState = 'draft' | 'published' | 'deprecated';
export type MetricKind = 'ratio' | 'quantile' | 'count' | 'duration';
export type Domain = 'productivity' | 'time' | 'movement' | 'quality' | 'maintenance';
export type PopulationRule = 'not-retired' | 'active-only' | 'etch' | 'maintenance-or-active';
export type ConsumerMenuId = 'productivity-overview' | 'cycle-time';

export const DOMAINS: Domain[] = ['productivity', 'time', 'movement', 'quality', 'maintenance'];
export const STATUSES: PublicationState[] = ['draft', 'published', 'deprecated'];
/** §6.1: sortable catalog columns, in table order; the synthetic _select column never joins the allow-list. */
export const sortColumns = ['metricId', 'nameSort', 'domain', 'grain', 'numerator', 'denominator', 'publishedPointer', 'status', 'owner', 'updatedAt'] as const;

export type MetricVersion = {
  version: string;
  state: PublicationState;
  grain: Text;
  unit: string;
  formula: Text;
  numerator: string | null;
  denominator: string | null;
  numeratorAgg: 'sum' | null;
  denominatorAgg: 'sum' | null;
  reaggregationRule: 'ratioOfSums' | 'recomputeFromDistribution' | 'sum';
  averageOfRatiosAllowed: false;
  averageOfQuantilesAllowed: false | null;
  filters: Text[];
  sourceContractRef: string;
  coverage: { populationRef: Text; includedBasis: Text; excludedBasis: Text; denominatorBasis: Text; sourceRef: string | null };
  changeReason: Text;
  registeredAt: string;
  publishedAt: string | null;
  deprecatedAt: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type UsageBinding = { menuId: ConsumerMenuId; place: Text; versions: string[] };

export type MetricDef = {
  metricId: string;
  name: Text;
  description: Text;
  domain: Domain;
  kind: MetricKind;
  ownerId: string;
  owner: Text;
  organizationRef: string | null;
  /** Stored published pointer. Not computed as max(version). */
  publishedPointer: string | null;
  /** Version whose grain/numerator the catalog row shows. */
  catalogVersion: string;
  /** Separate from the pointer. Drafts are never the analysis default. */
  draftVersion: string | null;
  catalogStatus: PublicationState;
  populationRule: PopulationRule;
  versions: MetricVersion[];
  usage: UsageBinding[];
  updatedAt: string;
};

/** Period basis shown on every definition (wall-clock, 06 §6.3). */
export const PERIOD_BASIS: Text = { ko: '[from, to) wall-clock. 이 화면의 전역 Time 필터가 아닙니다.', en: '[from, to) wall-clock. Not this screen’s global time filter.' };

export type CatalogRow = {
  metricId: string;
  nameKo: string;
  nameEn: string;
  nameSort: string;
  domain: Domain;
  grain: string;
  numerator: string;
  denominator: string;
  publishedPointer: string | null;
  catalogVersion: string;
  draftVersion: string | null;
  status: PublicationState;
  ownerId: string;
  owner: string;
  updatedAt: string;
};

export type DiffRow = { field: string; before: string; after: string };

export function versionDiff(current: MetricVersion, previous: MetricVersion | null, lang: Lang): DiffRow[] {
  if (!previous) return [];
  const rows: DiffRow[] = [
    { field: 'grain', before: previous.grain[lang], after: current.grain[lang] },
    { field: 'unit', before: previous.unit, after: current.unit },
    { field: 'numerator', before: previous.numerator ?? '—', after: current.numerator ?? '—' },
    { field: 'denominator', before: previous.denominator ?? '—', after: current.denominator ?? '—' },
    { field: 'formula', before: previous.formula[lang], after: current.formula[lang] },
    { field: 'publicationState', before: previous.state, after: current.state },
    { field: 'filters', before: previous.filters.map(f => f[lang]).join('; ') || '—', after: current.filters.map(f => f[lang]).join('; ') || '—' },
    { field: 'sourceContractRef', before: previous.sourceContractRef, after: current.sourceContractRef },
  ];
  return rows.filter(r => r.before !== r.after);
}

export type DefinitionPayload = {
  problem: 'unknown-metric' | 'need-version' | 'version-not-member' | null;
  requestedVersion: string | null;
  metric: MetricDef | null;
  version: MetricVersion | null;
  previous: MetricVersion | null;
  exampleEquipmentIds: string[];
  exampleRooms: string[];
};

export type UsageRow = { menuId: ConsumerMenuId; place: Text; version: string; evidenceSource: 'declared-dependency'; observedAt: null };
export type UsagePayload = { problem: 'unknown-metric' | 'version-not-member' | null; rows: UsageRow[] };

export type HistoryPayload = { problem: 'unknown-metric' | null; events: AuditEvent[] };

export type PairVerdict =
  | { kind: 'absent' }
  | { kind: 'id-only'; metricId: string; known: boolean }
  | { kind: 'valid'; metricId: string; metricVersion: string }
  | { kind: 'unknown-metric'; metricId: string; metricVersion: string | null }
  | { kind: 'version-not-member'; metricId: string; metricVersion: string }
  | { kind: 'other-metric'; metricId: string; metricVersion: string | null; viewedId: string }
  | { kind: 'conflict'; metricId: string; globalVersion: string; pageVersion: string };

/** Page list filters (URL page keys q/status/domain); localized columns follow `lang`. */
export type CatalogFilter = { q: string | null; status: string | null; domain: string | null; lang: Lang };
export type CatalogList = { rows: CatalogRow[]; filterProblem: 'status' | 'domain' | null };

/** Metric catalog and detail apply no site Context: metrics are not site data (no Scope). */
const base = { permission: 'metrics:view', requiresScope: false, kinds: ['processing_delay'], mergeTimeDomain: false } as const;

/**
 * The global metric pair judged by the server against the catalog (06 §6.1): membership, other metric, conflict.
 * `metric` applies, so the pair travels as Context; the destination being viewed travels as params.
 */
export const metricPairEndpoint = defineEndpoint<{ viewedId: string | null; pageVersion: string | null }, PairVerdict>({
  ...base, id: 'metrics.pair', menuId: 'metric-catalog', context: { metric: 'apply' }, paramKeys: { viewedId: true, pageVersion: true },
});

/** Filtered catalog for export, plus the filter verdict. */
export const catalogListEndpoint = defineEndpoint<CatalogFilter, CatalogList>({
  ...base, id: 'metrics.catalog.list', menuId: 'metric-catalog', context: {}, paramKeys: { q: true, status: true, domain: true, lang: true },
});

/** One catalog table page (06 §15). */
export const catalogPageEndpoint = defineEndpoint<CatalogFilter & PageQuery, PageResult<CatalogRow>>({
  ...base, id: 'metrics.catalog.page', menuId: 'metric-catalog', context: {},
  paramKeys: { q: true, status: true, domain: true, lang: true, page: true, pageSize: true, sorting: true },
});

/** Catalog filters plus an explicit row selection (`null` = every filtered row) for table-owned export. */
export type CatalogExportFilter = CatalogFilter & { ids: string[] | null };

/**
 * The export set for table-owned export (#173): a row array, so the server declares `limits.maxRows` on it.
 * `metrics.catalog.list` returns `CatalogList` (an object) and cannot declare a row cap.
 */
export const catalogExportEndpoint = defineEndpoint<CatalogExportFilter, CatalogRow[]>({
  ...base, id: 'metrics.catalog.export', menuId: 'metric-catalog', context: {}, paramKeys: { q: true, status: true, domain: true, lang: true, ids: true },
  limits: { maxRows: 50_000 },
});

export const definitionEndpoint = defineEndpoint<{ metricId: string; version: string | null }, DefinitionPayload>({
  ...base, id: 'metrics.definition', menuId: 'metric-detail', context: {}, paramKeys: { metricId: true, version: true },
});

export const usageEndpoint = defineEndpoint<{ metricId: string; version: string }, UsagePayload>({
  ...base, id: 'metrics.usage', menuId: 'metric-detail', context: {}, paramKeys: { metricId: true, version: true },
});

export const historyEndpoint = defineEndpoint<{ metricId: string; lang: Lang }, HistoryPayload>({
  ...base, id: 'metrics.history', menuId: 'metric-detail', context: {}, paramKeys: { metricId: true, lang: true },
});
