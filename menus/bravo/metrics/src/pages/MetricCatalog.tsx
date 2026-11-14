import { useMessages, formatText } from '@ap/kernel';
import { METRICS_MESSAGES } from '../messages';
import { useMemo } from 'react';
import { AlertTriangle, BookOpen, FilePen } from 'lucide-react';
import type { ColumnFilter } from '@ap/contracts';
import { CONTEXT_LABELS, type PageProps, PlatformLink, type QueryState, useI18n, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { RowAction, type PlatformColumn, PlatformDataTable, PlatformPage, QueryView, StateMessage, TableQuickSearch, TableUrlWarning, useClearFiltersAction, useTableFilterDeclaration, useTableUrlState } from '@ap/components';
import { Button } from '@ap/ui';
import {
  catalogExportEndpoint, catalogListEndpoint, catalogPageEndpoint, metricPairEndpoint, sortColumns,
  type CatalogFilter, type CatalogRow, type Lang, type PairVerdict,
} from '../endpoints';
import { exportFilterSummary, exportParams } from './data';
import { catalogColumns } from './columns';
import { metricDetailHref } from './detail-link';
import { catalogFilterDeclarations, catalogValueCheck } from './filter-fields';

const NO_DESTINATION = { viewedId: null, pageVersion: null };
const NOT_FILTER_KEYS = ['time', 'lot', 'roomNames', 'condition', 'selection'] as const;
const NO_FILTERS: ColumnFilter[] = [];

function pairText(verdict: PairVerdict, lang: 'ko' | 'en', pageVersion: string | null): { title: string; body: string; tone: 'neutral' | 'danger' | 'warning' } {
  switch (verdict.kind) {
    case 'absent':
      return { tone: 'neutral', title: formatText(METRICS_MESSAGES.metricCatalogNoGlobalMetricPair, lang), body: formatText(METRICS_MESSAGES.metricCatalogBothTheMetricAndTheVersionAre, lang) };
    case 'id-only':
      return { tone: 'warning', title: formatText(METRICS_MESSAGES.metricCatalogIncompletePair, lang), body: formatText(METRICS_MESSAGES.metricCatalogIsPresentWithoutAVersionPickA, lang, { metricId: String(verdict.metricId) }) };
    case 'valid': {
      const matched = pageVersion !== null && pageVersion === verdict.metricVersion;
      const body = pageVersion === null
        ? (formatText(METRICS_MESSAGES.metricCatalogTheListOnlyMarksThatRow, lang, { metricId: String(verdict.metricId), metricVersion: String(verdict.metricVersion) }))
        : matched
          ? (formatText(METRICS_MESSAGES.metricCatalogItMatchesTheVersionOpenOnThis, lang, { metricId: String(verdict.metricId), metricVersion: String(verdict.metricVersion) }))
          : (formatText(METRICS_MESSAGES.metricCatalogTheListOnlyMarksThatRow2, lang, { metricId: String(verdict.metricId), metricVersion: String(verdict.metricVersion) }));
      return { tone: 'neutral', title: formatText(METRICS_MESSAGES.metricCatalogGlobalPair, lang), body };
    }
    case 'unknown-metric':
      return { tone: 'danger', title: formatText(METRICS_MESSAGES.metricCatalogMetricWasNotFound, lang), body: formatText(METRICS_MESSAGES.metricCatalogIsNotInTheCatalogPickAnother, lang, { metricId: String(verdict.metricId), value: String(verdict.metricVersion ? ` @ ${verdict.metricVersion}` : '') }) };
    case 'version-not-member':
      return { tone: 'danger', title: formatText(METRICS_MESSAGES.metricCatalogChooseAVersionOfThisMetric, lang), body: formatText(METRICS_MESSAGES.metricCatalogCheckTheMetricVersionPickAVersion, lang, { value: String(verdict.metricId || '—'), metricVersion: String(verdict.metricVersion) }) };
    case 'other-metric':
      return { tone: 'warning', title: formatText(METRICS_MESSAGES.metricCatalogADifferentMetricIsSelected, lang), body: formatText(METRICS_MESSAGES.metricCatalogTheSelectedMetricIsItDiffersFrom, lang, { metricId: String(verdict.metricId), value: String(verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ''), viewedId: String(verdict.viewedId) }) };
    case 'conflict':
      return { tone: 'danger', title: formatText(METRICS_MESSAGES.metricCatalogSameMetricConflictingVersions, lang), body: formatText(METRICS_MESSAGES.metricCatalogGlobalThisPagePickOne, lang, { metricId: String(verdict.metricId), globalVersion: String(verdict.globalVersion), pageVersion: String(verdict.pageVersion) }) };
    default:
      return { tone: 'neutral', title: '', body: '' };
  }
}

/** The server validates the global metricId+metricVersion pair against the catalog (§6.1). Does not write the URL.
 *  The page owns the `metrics.pair` query and passes it in (#325-2): the banner is the first section of both
 *  pages, so the same single request also gates the detail page's anchor scroll — and the catalog, which reads
 *  the verdict for its active row, no longer sends the request twice. */
export function MetricPairBanner({ query, pageVersion = null, refreshNotice }: { query: QueryState<PairVerdict>; pageVersion?: string | null; refreshNotice?: 'visible' | 'hidden' }) {
  const m = useMessages(METRICS_MESSAGES);
  const { setPage } = usePlatform();
  const { lang } = useI18n();

  return <QueryView widgetName={m('metricCatalogMetricPairValidation')} query={query} compact skeletonRows={2} refreshNotice={refreshNotice}>
    {verdict => {
      const copy = pairText(verdict, lang, pageVersion);
      const box = copy.tone === 'danger' ? 'border-border-strong bg-accent-danger-soft text-text-danger-label' : copy.tone === 'warning' ? 'border-border-strong bg-accent-warn-soft text-text-warning-label' : 'border-border-subtle bg-surface-card text-text-secondary';
      return <div role={copy.tone === 'danger' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-xs ${box}`}>
        <p className="font-semibold text-text-primary">{copy.title}</p>
        <p className="mt-0.5">{copy.body}</p>
        {verdict.kind === 'conflict' && <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={() => setPage({ version: verdict.globalVersion })}>
            {m('metricCatalogShowTheGlobalVersionOnThisPage')}
          </Button>
        </div>}
      </div>;
    }}
  </QueryView>;
}

export default function MetricCatalogPage(_: PageProps) {
  const m = useMessages(METRICS_MESSAGES);
  const { pageParam, linkTo, global } = usePlatform();
  const { lang, tx } = useI18n();
  const notFilters = NOT_FILTER_KEYS.map(key => tx(CONTEXT_LABELS[key])).join(m('metricCatalogText'));
  const q = pageParam('q');
  // ADR-0105: 상태·도메인 are conditions of one hidden repeated page key `filter`; `q` stays the toolbar quick search.
  const { urlFilters, filterColumnProps } = useTableFilterDeclaration('filter', catalogFilterDeclarations, { lang, validate: catalogValueCheck });
  // §6.1 page keys: sort/page and the conditions are URL-owned; invalid wire values alert instead of substituting (never "empty rows").
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(sortColumns, { filters: urlFilters });
  const conditions = urlState?.filters ?? NO_FILTERS;
  // One clear for the search and every condition: one `setPage`, back to page 1.
  const clearButton = useClearFiltersAction({ filterKey: urlFilters.key, hasFilters: !!q || conditions.length > 0, extraKeys: ['q'] });
  // A global-Context change clears `page` in the kernel (manifest contextResetKeys); pages write no reset effect.
  const pair = useMenuQuery(metricPairEndpoint, NO_DESTINATION);
  const verdict = pair.response?.outcome === 'ok' ? pair.response.data : null;
  const activeRowId = verdict?.kind === 'valid' || verdict?.kind === 'id-only' ? verdict.metricId : null;
  const filter: CatalogFilter = { q, lang: lang as Lang };
  // The metric count is the full catalog: the count query never carries the conditions (UXA-4).
  const all = useMenuQuery(catalogListEndpoint, { lang: lang as Lang });
  const metricCount = all.response?.outcome === 'ok' ? all.response.data!.rows.length : null;
  // UXA-4: `…` only while the count is pending; a failed count query says nothing numeric.
  const metricCountText = metricCount !== null
    ? (m('metricCatalogSyntheticMetrics', { metricCount: String(metricCount) }))
    : all.response === null
      ? (m('metricCatalogSyntheticMetrics2'))
      : (m('metricCatalogSyntheticMetrics3'));
  const pages = useMenuFetch(catalogPageEndpoint);
  const exports = useMenuFetch(catalogExportEndpoint);
  const search = <TableQuickSearch pageKey="q" label={m('metricCatalogNameOrMetricid')} />;

  const columns = useMemo<PlatformColumn<CatalogRow>[]>(
    () => catalogColumns({ lang: lang as Lang, linkTo, tx, filterColumnProps }),
    [lang, linkTo, tx, filterColumnProps],
  );

  return <PlatformPage
    description={m('metricCatalogBrowseDefinitionsGrainNumeratorDenominatorAndThe')}
  >
    <div className="space-y-3">
      <MetricPairBanner query={pair} />
      {global.selection !== null && <p className="text-xs text-text-secondary">
        {m('metricCatalogEquipmentSelectionIsReferenceOnlyOnThis', { length: String(global.selection.length) })}
      </p>}
      {invalid ? <TableUrlWarning search={search} sentences={sentences} recoverKeys={recoverKeys} cause={cause} /> : <PlatformDataTable
        title={m('metricCatalogMetricCatalog')}
        subtitle={m('metricCatalogTheReleasedPointerIsStoredOnThe', { metricCountText: String(metricCountText) })}
        ariaLabel={m('metricCatalogMetricCatalog2')}
        preferenceKey="platform:table:metric-catalog"
        columns={columns}
        getRowId={row => row.metricId}
        // The rows are localized server-side, so a language change re-queries like a search change.
        filterKey={JSON.stringify([q, lang])}
        pageSize={8}
        urlState={urlState}
        activeRowId={activeRowId}
        search={search}
        loadPage={(query, signal) => pages.fetch({ ...filter, ...query }, signal)}
        emptyAction={clearButton}
        rowAction={(row, { compact }) => {
          const definition = m('metricCatalogDefinition');
          const draft = m('metricCatalogDraftV', { draftVersion: String(row.draftVersion) });
          return <span className={compact ? 'flex gap-1' : 'flex flex-wrap gap-2'}>
            <RowAction compact={compact} icon={BookOpen} label={definition} text={definition} textLink="primary" link={<PlatformLink href={metricDetailHref(linkTo, row)} />} />
            {row.draftVersion && <RowAction compact={compact} icon={FilePen} label={draft} text={draft} textLink="secondary" link={<PlatformLink href={metricDetailHref(linkTo, row, row.draftVersion)} />} />}
          </span>;
        }}
        // Table-owned export (#173): the page only says how to read the rows; the table builds the file.
        exportRows={(request, signal) => exports.fetch(exportParams(filter, request), signal)}
        exportFilterSummary={exportFilterSummary(filter, lang)} exportContext={catalogExportEndpoint.context}
      />}
      <p className="t-caption text-text-muted">
        {m('metricCatalogConditionsForOtherAnalysisScreensThisList', { notFilters: String(notFilters) })}
      </p>
    </div>
  </PlatformPage>;
}
