/**
 * Mock server half of the metric endpoints (#129). Registered by the app composition root via
 * `@ap/menu-metrics/mock`; pages never import this module. The pair verdict, catalog filters and paging,
 * definition and usage are answered here; history is the shared audit store's (ADR-0048) — the page no longer holds the catalog.
 */
import { filterRows, sortAndPage, sortRows, validateFilters, type ColumnFilter } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import {
  catalogExportEndpoint, catalogFilterSpecs, catalogListEndpoint, catalogPageEndpoint, definitionEndpoint, metricPairEndpoint, usageEndpoint,
} from '../endpoints';
import { buildDefinition, buildUsage, catalogRows, filterCatalog, judgeGlobalPair } from './catalog';

/** Metric audit seeds for the shared mock audit store; the app's mock assembly passes them to `createMockAdapter` (ADR-0048). */
export { METRIC_AUDIT_EVENTS as metricsAuditEvents } from './catalog';

/** ADR-0105 / P11: a condition on an undeclared field, an operator outside the field's `ops` or a malformed value is a malformed request, never an empty answer. */
const rejectUndeclaredCondition = ({ params }: { params: { filters?: ColumnFilter[] } }): string | null => {
  const check = validateFilters(params.filters ?? [], catalogFilterSpecs);
  return check.ok ? null : `invalid filter ${check.filter.id}:${check.filter.op} (${check.reason})`;
};

export const metricsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(metricPairEndpoint, {
    handle: ({ context, params }) => judgeGlobalPair(context.metricId, context.metricVersion, params.viewedId, params.pageVersion),
    metricVersion: ({ context }) => context.metricVersion ?? undefined,
  }),
  defineMockEndpoint(catalogListEndpoint, {
    // The metric count reads the full catalog: conditions do not narrow it (UXA-4).
    handle: ({ params: { lang } }) => ({ rows: catalogRows(lang) }),
  }),
  defineMockEndpoint(catalogPageEndpoint, {
    validate: rejectUndeclaredCondition,
    handle: ({ params: { q, lang, page, pageSize, sorting, filters } }) =>
      sortAndPage(filterRows(filterCatalog(catalogRows(lang), q), filters, undefined, { specs: catalogFilterSpecs }), { page, pageSize, sorting }),
    isEmpty: data => data.total === 0,
  }),
  defineMockEndpoint(catalogExportEndpoint, {
    validate: rejectUndeclaredCondition,
    // Selection export: ids filter server-side, so the declared maxRows is judged on the selection.
    // `sorting` is the table's active sort — the same sort the page endpoint applies, so export order = page order (#173 UX P2-6).
    handle: ({ params: { q, lang, ids, sorting = [], filters } }) => {
      const rows = filterRows(filterCatalog(catalogRows(lang), q), filters, undefined, { specs: catalogFilterSpecs });
      const selected = ids == null ? rows : rows.filter(r => ids.includes(r.metricId));
      return sortRows(selected, sorting);
    },
  }),
  defineMockEndpoint(definitionEndpoint, {
    handle: ({ params }) => buildDefinition(params.metricId, params.version),
    metricVersion: ({ params }) => params.version ?? undefined,
  }),
  defineMockEndpoint(usageEndpoint, {
    handle: ({ params }) => buildUsage(params.metricId, params.version),
    isEmpty: data => data.problem === null && data.rows.length === 0,
    metricVersion: ({ params }) => params.version,
  }),
];
