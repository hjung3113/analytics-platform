export const SURVEY_LIST_COPY = {
  emptyUnmanagedTitle: '관리할 수 있는 설문이 없습니다.',
  emptyUnmanagedBody: '참여할 설문은 설문 참여에서 확인하세요.',
} as const;

export const SURVEY_REPORT_FILTER_COPY = {
  status: (label: string) => `상태: ${label}`,
  followUp: '후속 조치 필요',
} as const;

export const SURVEY_BUILDER_COPY = {
  saveFailed: '저장하지 못했습니다.',
  notDraft: '설문이 더 이상 초안 상태가 아닙니다. 변경 내용을 따로 보관한 뒤 설문을 다시 불러와 주세요.',
  questionsChanged: '질문 목록이 변경되었습니다. 변경 내용을 따로 보관한 뒤 설문을 다시 불러와 주세요.',
} as const;
