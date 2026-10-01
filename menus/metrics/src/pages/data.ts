/** Metric display labels (client only). Record types and the shared diff live in `../endpoints`. */
import type { Tone } from '@ap/ui';
import type { ConsumerMenuId, Domain, MetricKind, PublicationState, Text } from '../endpoints';

export const DOMAIN_LABEL: Record<Domain, Text> = {
  productivity: { ko: '생산성', en: 'Productivity' },
  time: { ko: '시간', en: 'Time' },
  movement: { ko: '이송', en: 'Movement' },
  quality: { ko: '품질', en: 'Quality' },
  maintenance: { ko: '보전', en: 'Maintenance' },
};

export const STATUS_LABEL: Record<PublicationState, Text> = {
  draft: { ko: '초안', en: 'Draft' },
  published: { ko: '게시', en: 'Published' },
  deprecated: { ko: '폐기', en: 'Deprecated' },
};

export const STATUS_TONE: Record<PublicationState, Tone> = {
  draft: 'neutral',
  published: 'success',
  deprecated: 'warning',
};

export const KIND_LABEL: Record<MetricKind, Text> = {
  ratio: { ko: '비율', en: 'Ratio' },
  quantile: { ko: '분위수', en: 'Quantile' },
  count: { ko: '건수', en: 'Count' },
  duration: { ko: '시간', en: 'Duration' },
};

export const CONSUMER_LABEL: Record<ConsumerMenuId, Text> = {
  'productivity-overview': { ko: '생산성 개요', en: 'Productivity overview' },
  'cycle-time': { ko: '사이클타임 상세', en: 'Cycle time detail' },
};

