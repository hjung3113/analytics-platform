import type { Text } from '@ap/contracts';
export const PAGE_CONDITION_TREE_MESSAGES = {
  sourceMissing: { ko: '계층 데이터 연결이 없습니다.', en: 'No hierarchy source is connected.' },
  covered: { ko: '상위 항목에 포함됨', en: 'Covered by a selected ancestor' },
  checking: { ko: '하위 항목을 확인하는 중…', en: 'Checking descendants…' },
  cancel: { ko: '선택 취소', en: 'Cancel selection' },
  invalidLeaf: { ko: '잎 항목만 선택할 수 있습니다.', en: 'Only leaf values can be selected.' },
} satisfies Record<string, Text>;
