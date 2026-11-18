import type { Text } from '@ap/kernel';
import { REPLAY_NO_DATA_MESSAGES } from '@eqv/views';
import { FOCUS_MENU_LABEL } from './labels.js';

export const TOPVIEW_MESSAGES = {

  // page-key-rules
  pageKeyRulesEquipment: { ko: "설비", en: "Equipment" },
  pageKeyRulesReplayRangeStart: { ko: "재생 구간 시작", en: "Replay range start" },
  pageKeyRulesReplayRangeEnd: { ko: "재생 구간 끝", en: "Replay range end" },
  pageKeyRulesCursor: { ko: "재생 커서 시각", en: "Replay cursor time" },

  // FocusScreen
  focusMenuLabel: FOCUS_MENU_LABEL,
  focusScreenDetail: { ko: "상세", en: "Detail" },

  // TopViewScreen
  focusOpen: { ko: "동기 재생 열기", en: "Open synchronized playback" },
  layoutEdit: { ko: "레이아웃 편집", en: "Edit layout" },
  layoutEditDenied: { ko: "레이아웃 편집 권한이 없습니다 (eqv-studio:view)", en: "You need eqv-studio:view permission to edit layouts" },
  topViewScreenDetail: { ko: "상세", en: "Detail" },
  ...REPLAY_NO_DATA_MESSAGES,
} satisfies Record<string, Text>;
