import type { Text } from '@ap/kernel';

export const TOPVIEW_MESSAGES = {

  // page-key-rules
  pageKeyRulesEquipment: { ko: "설비", en: "Equipment" },
  pageKeyRulesReplayRangeStart: { ko: "재생 구간 시작", en: "Replay range start" },
  pageKeyRulesReplayRangeEnd: { ko: "재생 구간 끝", en: "Replay range end" },

  // FocusScreen
  focusScreenDetail: { ko: "상세", en: "Detail" },

  // TopViewScreen
  topViewScreenDetail: { ko: "상세", en: "Detail" },
} satisfies Record<string, Text>;
