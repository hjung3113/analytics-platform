import type { Text } from '@ap/contracts';

/** Neutral defaults; consumers supply labels that carry their own meaning. */
export const MATRIX_MESSAGES = {
  levels: { ko: '단계 순서', en: 'Level order' },
  reset: { ko: '기본값으로', en: 'Reset to default' },
  up: { ko: '{name} 위로 이동', en: 'Move {name} up' },
  down: { ko: '{name} 아래로 이동', en: 'Move {name} down' },
  expand: { ko: '{name} 펼치기', en: 'Expand {name}' },
  collapse: { ko: '{name} 접기', en: 'Collapse {name}' },
  menu: { ko: '{name} 메뉴', en: '{name} menu' },
  emphasize: { ko: '이 행에서 강조…', en: 'Emphasize in this row…' },
  emphasis: { ko: '강조', en: 'Emphasis' },
  emphasisCount: { ko: '강조 {count}', en: 'Emphasis {count}' },
  matchCount: { ko: '{count}개 해당', en: '{count} matches' },
  remove: { ko: '{name} 강조 지우기', en: 'Clear emphasis for {name}' },
  clearAll: { ko: '모두 지우기', en: 'Clear all' },
  onlyMatching: { ko: '이 열만 보기', en: 'Show only these columns' },
  min: { ko: '최솟값', en: 'Minimum' },
  max: { ko: '최댓값', en: 'Maximum' },
  apply: { ko: '적용', en: 'Apply' },
  clear: { ko: '지우기', en: 'Clear' },
  invalidRange: { ko: '최솟값은 최댓값 이하여야 합니다.', en: 'Minimum must be no greater than maximum.' },
} satisfies Record<string, Text>;
