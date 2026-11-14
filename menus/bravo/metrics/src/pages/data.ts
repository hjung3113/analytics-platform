import { formatText } from '@ap/kernel';
import { METRICS_MESSAGES } from '../messages';
/** Metric display labels (client only). Record types and the shared diff live in `../endpoints`. */
import type { Tone } from '@ap/ui';
import type { CatalogExportFilter, CatalogFilter, ConsumerMenuId, Domain, MetricKind, PublicationState, Text } from '../endpoints';
import { tableExportParams, type TableExportRequest } from '@ap/components';

export const DOMAIN_LABEL: Record<Domain, Text> = {
  productivity: METRICS_MESSAGES.dataProductivity,
  time: METRICS_MESSAGES.dataTime,
  movement: METRICS_MESSAGES.dataMovement,
  quality: METRICS_MESSAGES.dataQuality,
  maintenance: METRICS_MESSAGES.dataMaintenance,
};

export const STATUS_LABEL: Record<PublicationState, Text> = {
  draft: METRICS_MESSAGES.dataDraft,
  published: METRICS_MESSAGES.dataReleased,
  deprecated: METRICS_MESSAGES.dataDeprecated,
};

export const STATUS_TONE: Record<PublicationState, Tone> = {
  draft: 'neutral',
  published: 'success',
  deprecated: 'warning',
};

export const KIND_LABEL: Record<MetricKind, Text> = {
  ratio: METRICS_MESSAGES.dataRatio,
  quantile: METRICS_MESSAGES.dataQuantile,
  count: METRICS_MESSAGES.dataCount,
  duration: METRICS_MESSAGES.dataDuration,
};

export const CONSUMER_LABEL: Record<ConsumerMenuId, Text> = {
  'productivity-overview': METRICS_MESSAGES.dataProductivityOverview,
  'cycle-time': METRICS_MESSAGES.dataCycleTimeDetail,
};

/** Table-owned export params (#173): the catalog page filters, the selection ids (`null` = every filtered row) and the table's active sort; the request's conditions ride through (`TableExportRequest.filters`). */
export function exportParams(
  filter: CatalogFilter,
  request: TableExportRequest,
): CatalogExportFilter {
  return { ...filter, ...tableExportParams(request) };
}

/** Readable page filter for the XLSX 조회 정보 sheet (#173 review P2-3); an unset search is omitted. The conditions are listed by the table itself (`필터 · 상태` …). */
export function exportFilterSummary({ q }: CatalogFilter, lang: 'ko' | 'en'): [string, string][] {
  return q ? [[formatText(METRICS_MESSAGES.dataSearch, lang), q]] : [];
}



