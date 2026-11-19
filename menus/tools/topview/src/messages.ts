import type { Text } from '@ap/kernel';
import { REPLAY_NO_DATA_MESSAGES } from '@eqv/views';
import { FOCUS_MENU_LABEL } from './labels.js';
import { EQV_MAX_WINDOW_HOURS } from './limits.js';

export const REPLAY_TOO_LARGE_KO = `설비 재생은 한 번에 최대 ${EQV_MAX_WINDOW_HOURS}시간까지 불러옵니다. 설비를 선택한 뒤 데이터 구간이 있으면 «이 구간 보기»를 누르세요.`;

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
  topViewScreenDetail: { ko: "상세", en: "Detail" },
  ...REPLAY_NO_DATA_MESSAGES,
} satisfies Record<string, Text>;
