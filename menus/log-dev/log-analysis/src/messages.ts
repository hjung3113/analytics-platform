import type { Text } from '@ap/contracts';

export const EXPLORER_MESSAGES = {
  roundInvestigationTitle: { ko: 'Round 조사 · {fileRef}', en: 'Round investigation · {fileRef}' },
  roundInvestigationTitleFallback: { ko: 'Round 조사', en: 'Round investigation' },
  roundInvestigationStart: { ko: '이 Round로 조사 시작', en: 'Start investigation from this Round' },
  roundInvestigationStarting: { ko: '조사 시작 중…', en: 'Starting investigation…' },
  roundInvestigationRetry: { ko: '같은 요청 다시 시도', en: 'Retry the same request' },
  roundInvestigationPermission: { ko: '조사 쓰기 권한이 없습니다.', en: 'Investigation write permission is required.' },
  roundInvestigationMissing: { ko: 'Round를 찾을 수 없거나 열 수 없습니다.', en: 'The Round could not be found or opened.' },
  roundInvestigationUnknown: { ko: '응답을 받지 못했습니다. 생성 여부를 확인할 수 없어 같은 요청으로 다시 시도합니다.', en: 'No response was received. The same request can be retried because its result is unknown.' },
  roundInvestigationError: { ko: '조사를 시작하지 못했습니다. 같은 요청으로 다시 시도하세요.', en: 'The investigation could not be started. Retry the same request.' },
  roundInvestigationFailed: { ko: '조사를 시작하지 못했습니다. Round와 권한을 확인하세요.', en: 'The investigation could not be started. Check the Round and your permission.' },
  recentSources: { ko: '최근 Source', en: 'Recent Sources' },
  recentSourcesLoading: { ko: '최근 Source 불러오는 중…', en: 'Loading recent Sources…' },
  recentSourcesError: { ko: '최근 Source를 불러오지 못했습니다. 직접 입력할 수 있습니다.', en: 'Recent Sources could not be loaded. You can enter details directly.' },
  recentSourcesPartialError: { ko: '최근 Source 일부를 불러오지 못했습니다. 찾은 항목만 표시합니다. 직접 입력할 수 있습니다.', en: 'Some recent Sources could not be loaded. Showing the Sources found so far; you can also enter details directly.' },
  recentSourcesEmpty: { ko: '최근 Source가 없습니다.', en: 'There are no recent Sources.' },
  directInput: { ko: '직접 입력', en: 'Enter directly' },
  recentSourceLoading: { ko: '선택한 Source 불러오는 중…', en: 'Loading the selected Source…' },
  recentSourceError: { ko: '선택한 Source를 불러오지 못했습니다. 직접 입력해 주세요.', en: 'The selected Source could not be loaded. Enter its details directly.' },
} as const satisfies Record<string, Text>;
