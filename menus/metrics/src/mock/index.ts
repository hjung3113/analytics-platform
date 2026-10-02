/**
 * Mock server half of the metric endpoints (#129). Registered by the app composition root via
 * `@ap/menu-metrics/mock`; pages never import this module. The pair verdict, catalog filters and paging,
 * definition, usage and history are all answered here — the page no longer holds the catalog.
 */
import { sortAndPage, sortRows } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import {
  catalogExportEndpoint, catalogListEndpoint, catalogPageEndpoint, definitionEndpoint, historyEndpoint, metricPairEndpoint, usageEndpoint,
} from '../endpoints';
import { buildDefinition, buildHistory, buildUsage, catalogRows, filterCatalog, judgeGlobalPair } from './catalog';

export const metricsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(metricPairEndpoint, {
    handle: ({ context, params }) => judgeGlobalPair(context.metricId, context.metricVersion, params.viewedId, params.pageVersion),
    metricVersion: ({ context }) => context.metricVersion ?? undefined,
  }),
  defineMockEndpoint(catalogListEndpoint, {
    handle: ({ params: { q, status, domain, lang } }) => filterCatalog(catalogRows(lang), q, status, domain),
  }),
  defineMockEndpoint(catalogPageEndpoint, {
    handle: ({ params: { q, status, domain, lang, page, pageSize, sorting } }) =>
      sortAndPage(filterCatalog(catalogRows(lang), q, status, domain).rows, { page, pageSize, sorting }),
    isEmpty: data => data.total === 0,
  }),
  defineMockEndpoint(catalogExportEndpoint, {
    // Selection export: ids filter server-side, so the declared maxRows is judged on the selection.
    // `sorting` is the table's active sort — the same sort the page endpoint applies, so export order = page order (#173 UX P2-6).
    handle: ({ params: { q, status, domain, lang, ids, sorting = [] } }) => {
      const rows = filterCatalog(catalogRows(lang), q, status, domain).rows;
      const selected = ids == null ? rows : rows.filter(r => ids.includes(r.metricId));
      return sortRows(selected, sorting);
    },
  }),
  defineMockEndpoint(definitionEndpoint, {
    handle: ({ equipment, params }) => buildDefinition(params.metricId, params.version, equipment),
    metricVersion: ({ params }) => params.version ?? undefined,
  }),
  defineMockEndpoint(usageEndpoint, {
    handle: ({ params }) => buildUsage(params.metricId, params.version),
    isEmpty: data => data.problem === null && data.rows.length === 0,
    metricVersion: ({ params }) => params.version,
  }),
  defineMockEndpoint(historyEndpoint, {
    handle: ({ params }) => buildHistory(params.metricId, params.lang),
  }),
];
