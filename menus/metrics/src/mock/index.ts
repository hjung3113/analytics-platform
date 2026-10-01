/**
 * Mock server half of the metric endpoints (#129). Registered by the app composition root via
 * `@ap/menu-metrics/mock`; pages never import this module. The pair verdict, catalog filters and paging,
 * definition, usage and history are all answered here — the page no longer holds the catalog.
 */
import { sortAndPage } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import {
  catalogListEndpoint, catalogPageEndpoint, definitionEndpoint, historyEndpoint, metricPairEndpoint, usageEndpoint,
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
