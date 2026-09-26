import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ko' | 'en';
import type { Text } from '@ap/contracts';

export type { Text };

// UI copy only (docs/06 §23): master values and identifiers are never translated.
const dict = {
  appName: { ko: 'Analytics Platform', en: 'Analytics Platform' },
  appTagline: { ko: '설비 로그 분석 플랫폼', en: 'Equipment log analytics' },
  searchPlaceholder: { ko: '메뉴 검색…', en: 'Search menus…' },
  menuSearch: { ko: '메뉴 필터', en: 'Filter menus' },
  collapse: { ko: '사이드바 접기', en: 'Collapse sidebar' },
  expand: { ko: '사이드바 펼치기', en: 'Expand sidebar' },
  favorites: { ko: '즐겨찾기', en: 'Favorites' },
  recent: { ko: '최근 방문', en: 'Recent' },
  noFavorites: { ko: '즐겨찾기가 없습니다. 화면 제목 옆 ☆로 추가하세요.', en: 'No favorites yet. Use ☆ next to a page title.' },
  noRecent: { ko: '최근 방문한 화면이 없습니다.', en: 'No recently visited pages.' },
  addFavorite: { ko: '즐겨찾기에 추가', en: 'Add to favorites' },
  removeFavorite: { ko: '즐겨찾기에서 제거', en: 'Remove from favorites' },
  scope: { ko: 'Scope', en: 'Scope' },
  scopeNone: { ko: 'Scope 선택', en: 'Select scope' },
  scopeValidating: { ko: '검증 중…', en: 'Validating…' },
  scopeValid: { ko: '서버 검증됨', en: 'Server validated' },
  scopeForbidden: { ko: '접근 불가', en: 'No access' },
  scopeUnknown: { ko: '알 수 없는 Scope', en: 'Unknown scope' },
  scopeUnknownTitle: { ko: '등록되지 않은 Scope입니다', en: 'This scope is not registered' },
  scopeUnknownBody: { ko: '이 scopeId는 권한 거부가 아닙니다. 서버가 Scope를 확인하지 못했으며 다른 Scope로 바꾸지 않습니다.', en: 'This is not a permission denial. The server does not recognize this scopeId, and no other scope is substituted.' },
  notifications: { ko: '알림', en: 'Notifications' },
  profile: { ko: '사용자 메뉴', en: 'User menu' },
  role: { ko: '역할(데모 전환)', en: 'Role (demo switch)' },
  language: { ko: '언어', en: 'Language' },
  signOut: { ko: '로그아웃', en: 'Sign out' },
  scenario: { ko: '응답 시나리오', en: 'Response scenario' },
  scenarioHint: { ko: '프로토타입 전용: 모의 서버 응답을 강제합니다.', en: 'Prototype only: forces mock server outcomes.' },
  period: { ko: '기간', en: 'Period' },
  preset1d: { ko: '1일', en: '1 day' },
  preset7d: { ko: '7일', en: '7 days' },
  presetCustom: { ko: '사용자 지정', en: 'Custom' },
  apply: { ko: '적용', en: 'Apply' },
  cancel: { ko: '취소', en: 'Cancel' },
  reset: { ko: '초기화', en: 'Reset' },
  clear: { ko: '지우기', en: 'Clear' },
  roomNames: { ko: 'room_name', en: 'room_name' },
  condition: { ko: '설비 그룹 조건', en: 'Group condition' },
  selection: { ko: '설비 선택', en: 'Equipment selection' },
  all: { ko: '전체', en: 'All' },
  none: { ko: '없음', en: 'None' },
  explicitEmpty: { ko: '명시적 빈 집합', en: 'Explicit empty set' },
  notUsed: { ko: '이 화면에서 미사용', en: 'Not used on this page' },
  referenceOnly: { ko: '참조만', en: 'Reference only' },
  applied: { ko: '적용', en: 'Applied' },
  inherited: { ko: '전달된 Context', en: 'Inherited context' },
  globalContext: { ko: '전역 Context', en: 'Global context' },
  home: { ko: '홈', en: 'Home' },
  back: { ko: '뒤로', en: 'Back' },
  retry: { ko: '다시 시도', en: 'Retry' },
  loading: { ko: '불러오는 중…', en: 'Loading…' },
  refreshing: { ko: '같은 조건으로 갱신 중', en: 'Refreshing same context' },
  correlationId: { ko: 'Correlation ID', en: 'Correlation ID' },
  stateEmpty: { ko: '조건에 맞는 결과가 없습니다', en: 'No matching result' },
  stateEmptyBody: { ko: '조회는 성공했고 결과가 0건입니다. 수집 중단·지연을 뜻하지 않습니다.', en: 'The query succeeded with zero rows. This does not imply a collection stop or delay.' },
  stateForbidden: { ko: '이 Scope에 접근 권한이 없습니다', en: 'You do not have access to this scope' },
  stateForbiddenBody: { ko: '서버가 현재 사용자 권한으로 요청을 거부했습니다. 다른 Scope로 조용히 대체하지 않습니다.', en: 'The server rejected the request for your current permissions. No other scope is substituted.' },
  stateTooLarge: { ko: '조회 범위가 너무 큽니다', en: 'Query too large' },
  stateTooLargeBody: { ko: '기간을 줄이거나 설비 선택을 좁히세요.', en: 'Shorten the period or narrow the equipment selection.' },
  stateTimeout: { ko: '조회 시간이 초과되었습니다', en: 'Query timed out' },
  stateError: { ko: '데이터를 불러오지 못했습니다', en: 'Unable to load data' },
  stateUnknown: { ko: '상태를 확인할 수 없습니다', en: 'Status unknown' },
  stateUnknownBody: { ko: '원인 상태 원천이 확인되지 않아 원인을 단정하지 않습니다.', en: 'No status source confirmed a cause.' },
  statePartial: { ko: '일부 위젯을 불러오지 못했습니다', en: 'Partial widget failure' },
  selectScope: { ko: 'Scope를 선택하세요', en: 'Select a scope' },
  selectScopeBody: { ko: 'Scope가 없으면 데이터를 조회하지 않습니다. 세션값을 자동 적용하지 않습니다.', en: 'No data is queried without a scope. Session values are not applied automatically.' },
  applySuggested: { ko: '최근 Scope 적용', en: 'Apply recent scope' },
  selectPeriod: { ko: '기간을 선택하세요', en: 'Select a period' },
  contractError: { ko: 'URL 계약 오류', en: 'URL contract error' },
  contractErrorBody: { ko: '잘못된 값을 자동 보정하지 않습니다. URL을 수정하거나 Context를 초기화하세요.', en: 'Invalid values are not auto-corrected. Fix the URL or reset the context.' },
  resetContext: { ko: 'Context 초기화', en: 'Reset context' },
  notFound: { ko: '등록되지 않은 경로입니다', en: 'Unregistered route' },
  plannedTitle: { ko: '레지스트리에 선언된 메뉴 (화면 미구현)', en: 'Registered menu (screen not built)' },
  plannedBody: { ko: '이 메뉴는 Menu Registry 선언과 Context Capability만 존재합니다. 셸·Context 전달·권한 계약이 화면 구현 없이도 동작함을 보여줍니다.', en: 'Only the registry declaration exists. Shell, context transfer and permission contracts work without the screen.' },
  dataTrust: { ko: '데이터 신뢰', en: 'Data trust' },
  updated: { ko: '갱신', en: 'Updated' },
  dataThrough: { ko: '데이터 기준', en: 'Data through' },
  coverage: { ko: '커버리지', en: 'Coverage' },
  metricVersion: { ko: '지표 버전', en: 'Metric version' },
  status: { ko: '상태', en: 'Status' },
  provisional: { ko: '잠정', en: 'Provisional' },
  final: { ko: '확정', en: 'Final' },
  source: { ko: '원천', en: 'Source' },
  export: { ko: '내보내기', en: 'Export' },
  palettePlaceholder: { ko: '이동할 메뉴를 입력하세요…', en: 'Type a menu to go to…' },
  paletteEmpty: { ko: '일치하는 메뉴가 없습니다.', en: 'No matching menus.' },
  paletteHint: { ko: '메뉴 이동 전용 — 객체/액션 검색은 Deferred', en: 'Menu navigation only — entity/action search deferred' },
  goTo: { ko: '이동', en: 'Go to' },
  planned: { ko: '예정', en: 'Planned' },
  restricted: { ko: '권한 필요', en: 'Restricted' },
  capability: { ko: 'Context Capability', en: 'Context capability' },
  pageType: { ko: '페이지 유형', en: 'Page type' },
  selectedRange: { ko: '선택 구간', en: 'Selected range' },
} satisfies Record<string, Text>;

export type Key = keyof typeof dict;
type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: (key: Key) => string; tx: (text: Text) => string };
const I18nContext = createContext<I18n | null>(null);
const STORAGE = 'platform:lang';

function initialLang(): Lang {
  try { return localStorage.getItem(STORAGE) === 'en' ? 'en' : 'ko'; } catch { return 'ko'; }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next;
    try { localStorage.setItem(STORAGE, next); } catch { /* preference stays in memory */ }
  }, []);
  const value = useMemo<I18n>(() => ({ lang, setLang, t: key => dict[key][lang], tx: text => text[lang] }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
