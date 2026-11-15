export const ANALYTICS_AREA_WORKLOAD_SIGNALS_LABEL = '작업량 신호';
export const ANALYTICS_AREA_RECENT_FINDINGS_LABEL = '최근 Finding';

export const ANALYTICS_AREA_FILTER_COPY = {
  unset: '분석 영역: 미지정',
  unresolved: '분석 영역: 선택한 영역',
  resolved: (name: string, archived: boolean) =>
    `분석 영역: ${name}${archived ? ' (보관됨)' : ''}`,
} as const;
