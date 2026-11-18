import type { Text } from '@ap/kernel';

export const STUDIO_MESSAGES = {
  propertiesSaveStatus: { ko: '저장 상태', en: 'Save status' },
  propertiesSaved: { ko: '저장됨', en: 'Saved' },
  propertiesUnsaved: { ko: '저장 안 됨', en: 'Unsaved changes' },
} satisfies Record<string, Text>;
