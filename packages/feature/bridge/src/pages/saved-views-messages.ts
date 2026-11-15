import type { Text } from '@ap/contracts';

export const SAVED_VIEWS_MESSAGES = {
  name: { ko: '저장된 보기 이름', en: 'Saved view name' },
  placeholder: { ko: '현재 필터 저장', en: 'Save current filters' },
  save: { ko: '저장', en: 'Save' },
  saving: { ko: '저장 중…', en: 'Saving…' },
  remove: { ko: '저장된 보기 {name} 삭제', en: 'Delete saved view {name}' },
  loading: { ko: '불러오는 중…', en: 'Loading…' },
  loadError: { ko: '저장된 보기를 불러오지 못했습니다.', en: 'Could not load saved views.' },
  hint: { ko: 'VOC 처리함이나 분류에서 현재 필터를 저장할 수 있습니다.', en: 'Save the current filter from Inbox or Triage.' },
} satisfies Record<string, Text>;
