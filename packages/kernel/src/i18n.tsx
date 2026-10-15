import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ko' | 'en';
import type { Text } from '@ap/contracts';

export type { Text };

// UI copy only (docs/06 §23): master values and identifiers are never translated.
const dict = {
  close: { ko: '닫기', en: 'Close' },
  appName: { ko: 'Analytics Platform', en: 'Analytics Platform' },
  appTagline: { ko: '설비 로그 분석 플랫폼', en: 'Equipment log analytics' },
  searchPlaceholder: { ko: '메뉴 검색…', en: 'Search menus…' },
  collapse: { ko: '사이드바 접기', en: 'Collapse sidebar' },
  expand: { ko: '사이드바 펼치기', en: 'Expand sidebar' },
  filters: { ko: '필터', en: 'Filters' },
  collapseFilters: { ko: '필터 접기', en: 'Collapse filters' },
  expandFilters: { ko: '필터 펼치기', en: 'Expand filters' },
  collapsedSections: { ko: '접힌 항목', en: 'Collapsed' },
  collapseSection: { ko: '{title} 접기', en: 'Collapse {title}' },
  expandSection: { ko: '{title} 펼치기', en: 'Expand {title}' },
  collapsePageFilter: { ko: '{label} 접기', en: 'Collapse {label}' },
  expandPageFilter: { ko: '{label} 펼치기', en: 'Expand {label}' },
  collapseShort: { ko: '접기', en: 'Collapse' },
  pageFilterPendingChanges: { ko: '미적용 변경 있음', en: 'Unapplied changes' },
  appliedFilterCount: { ko: '{count}개 적용', en: '{count} applied' },
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
  scopeCheckFailed: { ko: '확인 실패', en: 'Check failed' },
  scopeRetryCheck: { ko: 'Scope 다시 확인', en: 'Re-check scope' },
  scopeErrorTitle: { ko: 'Scope를 확인하지 못했습니다', en: "Couldn't verify the scope" },
  scopeErrorBody: { ko: '서버에 닿지 못했습니다. 잠시 뒤 다시 시도하세요.', en: 'The server could not be reached. Try again in a moment.' },
  scopeUnknownTitle: { ko: '등록되지 않은 Scope입니다', en: 'This scope is not registered' },
  scopeUnknownBody: { ko: '등록된 범위가 아닙니다. 목록에서 다시 고르세요.', en: 'This scope is not registered. Pick another from the list.' },
  profile: { ko: '사용자 메뉴', en: 'User menu' },
  role: { ko: '역할(데모 전환)', en: 'Role (demo switch)' },
  language: { ko: '언어', en: 'Language' },
  signOut: { ko: '로그아웃', en: 'Sign out' },
  signOutUnavailable: { ko: '준비 중', en: 'Not available yet' },
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
  pageFilter: { ko: '페이지 필터', en: 'Page filters' },
  clearFilters: { ko: '필터 초기화', en: 'Clear filters' },
  skipToContent: { ko: '본문으로 건너뛰기', en: 'Skip to content' },
  breadcrumb: { ko: '이동 경로', en: 'Breadcrumb' },
  roomNames: { ko: 'room_name', en: 'room_name' },
  condition: { ko: '설비 그룹 조건', en: 'Group condition' },
  selection: { ko: '설비 선택', en: 'Equipment selection' },
  all: { ko: '전체', en: 'All' },
  none: { ko: '없음', en: 'None' },
  explicitEmpty: { ko: '빈 선택', en: 'Empty selection' },
  notUsed: { ko: '이 화면에서 미사용', en: 'Not used on this page' },
  referenceOnly: { ko: '참조만', en: 'Reference only' },
  applied: { ko: '적용', en: 'Applied' },
  inherited: { ko: '전달된 Context', en: 'Inherited context' },
  globalContext: { ko: '전역 Context', en: 'Global context' },
  home: { ko: '홈', en: 'Home' },
  back: { ko: '뒤로', en: 'Back' },
  returnContextReverted: { ko: '출발 화면의 Context로 돌아왔습니다. 상세에서 바꾼 항목을 되돌렸습니다: {items}', en: 'Returned to the starting context. Reverted: {items}.' },
  retry: { ko: '다시 시도', en: 'Retry' },
  loading: { ko: '불러오는 중…', en: 'Loading…' },
  refreshing: { ko: '같은 조건으로 갱신 중', en: 'Refreshing same context' },
  correlationId: { ko: 'Correlation ID', en: 'Correlation ID' },
  serverDetail: { ko: '서버 세부', en: 'Server detail' },
  askAccessOwner: { ko: '권한 담당자에게 요청하세요.', en: 'Ask the person who grants access.' },
  sharedOutcomeRegion: { ko: '위젯 상태 요약', en: 'Widget state summary' },
  sharedOutcomeSummary: { ko: '위젯 {count}개에서 같은 응답({outcome})이 확인되었습니다.', en: '{count} widgets report the same response ({outcome}).' },
  sharedOutcomeError: { ko: '서버 오류', en: 'server error' },
  sharedOutcomeTimeout: { ko: '시간 초과', en: 'timeout' },
  sharedOutcomeEmpty: { ko: '0건', en: 'zero rows' },
  stateTimeoutBody: { ko: '조회가 제한 시간 안에 끝나지 않았습니다. 기간을 줄이거나 집계 단위를 키워 다시 시도하세요.', en: 'The query did not finish in time. Shorten the period or coarsen the granularity and retry.' },
  stateEmpty: { ko: '조건에 맞는 결과가 없습니다', en: 'No matching result' },
  stateEmptyBody: { ko: '조회는 성공했고 결과가 0건입니다. 수집 중단·지연을 뜻하지 않습니다.', en: 'The query succeeded with zero rows. This does not imply a collection stop or delay.' },
  stateForbidden: { ko: '이 Scope에 접근 권한이 없습니다', en: 'You do not have access to this scope' },
  stateForbiddenBody: { ko: '현재 권한으로는 이 범위를 볼 수 없습니다. 권한 담당자에게 요청하세요.', en: 'Your current permissions cannot view this range. Ask the person who grants access.' },
  stateTooLarge: { ko: '조회 범위가 너무 큽니다', en: 'Query too large' },
  stateTooLargeBody: { ko: '한 번에 가져오기에는 범위가 큽니다. 기간을 줄이거나 설비 선택을 좁히세요.', en: 'The range is too large to load at once. Shorten the period or narrow the equipment selection.' },
  stateTimeout: { ko: '조회 시간이 초과되었습니다', en: 'Query timed out' },
  stateError: { ko: '데이터를 불러오지 못했습니다', en: 'Unable to load data' },
  stateErrorCause: { ko: '서버가 데이터를 보내지 못했습니다.', en: 'The server could not return the data.' },
  stateErrorAction: { ko: '다시 시도하세요. 문제가 계속되면 시스템 담당자에게 아래 Correlation ID를 전달하세요.', en: 'Retry. If the problem persists, share the Correlation ID below with your system administrator.' },
  timeDomainUnverifiedCause: { ko: '시간 기준이 확인되지 않아 함께 집계할 수 없습니다.', en: 'The time reference is unconfirmed, so these cannot be aggregated together.' },
  timeDomainUnverifiedAction: { ko: '설비를 좁히거나 기간을 줄이세요.', en: 'Narrow the equipment or shorten the period.' },
  timeDomainMismatchCause: { ko: '시간 기준이 서로 달라 함께 집계할 수 없습니다.', en: 'The time references differ, so these cannot be aggregated together.' },
  timeDomainMismatchAction: { ko: '같은 시간 기준의 설비를 고르거나 나눠 조회하세요.', en: 'Choose equipment that share a time reference, or query them separately.' },
  stateUnknown: { ko: '상태를 확인할 수 없습니다', en: 'Status could not be confirmed' },
  stateUnknownBody: { ko: '왜 이런 상태인지 확인하지 못했습니다. 잠시 뒤 다시 시도하세요.', en: 'The cause could not be confirmed. Try again in a moment.' },
  selectScope: { ko: 'Scope를 선택하세요', en: 'Select a scope' },
  selectScopeBody: { ko: '범위를 고르면 그 범위의 데이터를 조회합니다.', en: 'Pick a scope to load its data.' },
  applySuggested: { ko: '최근 Scope 적용', en: 'Apply recent scope' },
  selectPeriod: { ko: '기간을 선택하세요', en: 'Select a period' },
  contractError: { ko: 'URL 계약 오류', en: 'URL contract error' },
  contractErrorBody: { ko: '주소의 값이 올바르지 않아 조회하지 않았습니다. 주소를 고치거나 조건을 초기화하세요.', en: 'The address has a value this page cannot use. Fix the address or reset the conditions.' },
  resetContext: { ko: 'Context 초기화', en: 'Reset context' },
  notFound: { ko: '등록되지 않은 경로입니다', en: 'Unregistered route' },
  plannedTitle: { ko: '레지스트리에 선언된 메뉴 (화면 미구현)', en: 'Registered menu (screen not built)' },
  plannedBody: { ko: '이 메뉴는 Menu Registry 선언과 Context Capability만 존재합니다. 셸·Context 전달·권한 계약이 화면 구현 없이도 동작함을 보여줍니다.', en: 'Only the registry declaration exists. Shell, context transfer and permission contracts work without the screen.' },
  dataTrust: { ko: '데이터 신뢰', en: 'Data trust' },
  updated: { ko: '갱신', en: 'Updated' },
  dataThrough: { ko: '데이터 기준', en: 'Data through' },
  coverage: { ko: '커버리지', en: 'Coverage' },
  metricVersion: { ko: '지표 버전', en: 'Metric version' },
  currentPeriod: { ko: '현재 기간', en: 'Current period' },
  previousPeriod: { ko: '이전 기간', en: 'Previous period' },
  status: { ko: '상태', en: 'Status' },
  provisional: { ko: '잠정', en: 'Provisional' },
  final: { ko: '확정', en: 'Final' },
  source: { ko: '원천', en: 'Source' },
  export: { ko: '내보내기', en: 'Export' },
  palettePlaceholder: { ko: '이동할 메뉴를 입력하세요…', en: 'Type a menu to go to…' },
  paletteName: { ko: '메뉴 검색', en: 'Search menus' },
  palettePlatform: { ko: '플랫폼', en: 'Platform' },
  paletteEmpty: { ko: '일치하는 메뉴가 없습니다.', en: 'No matching menus.' },
  paletteHint: { ko: '메뉴 이동만 할 수 있습니다.', en: 'Menu navigation only.' },
  goTo: { ko: '이동', en: 'Go to' },
  planned: { ko: '예정', en: 'Planned' },
  restricted: { ko: '권한 필요', en: 'Restricted' },
  capability: { ko: 'Context Capability', en: 'Context capability' },
  pageType: { ko: '페이지 유형', en: 'Page type' },
  selectedRange: { ko: '선택 구간', en: 'Selected range' },
} satisfies Record<string, Text>;

export type Key = keyof typeof dict;
type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: (key: Key, params?: Record<string, string | number>) => string; tx: (text: Text) => string; text: (key: Key) => Text };
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
  const value = useMemo<I18n>(() => ({ lang, setLang, t: (key, params) => dict[key][lang].replace(/\{(\w+)\}/g, (token, name: string) => params?.[name] === undefined ? token : String(params[name])), tx: text => text[lang], text: key => dict[key] }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}

const ERROR_GUIDANCE = {
  time_domain_unverified: { cause: 'timeDomainUnverifiedCause', action: 'timeDomainUnverifiedAction' },
  time_domain_mismatch: { cause: 'timeDomainMismatchCause', action: 'timeDomainMismatchAction' },
} as const satisfies Record<string, { cause: Key; action: Key }>;

export type ErrorGuidance = { code: string | null; cause: Key; action: Key };

/** Classify a server `message` by the prefix before the first colon. Unmapped text uses the general error copy. */
export function errorGuidance(message: string | undefined): ErrorGuidance {
  const code = message?.split(':', 1)[0]?.trim() ?? '';
  if (code && Object.prototype.hasOwnProperty.call(ERROR_GUIDANCE, code)) {
    const guide = ERROR_GUIDANCE[code as keyof typeof ERROR_GUIDANCE];
    return { code, cause: guide.cause, action: guide.action };
  }
  return { code: null, cause: 'stateErrorCause', action: 'stateErrorAction' };
}

export function userFacingEntries(): readonly { key: string; ko: string; en: string }[] {
  return Object.entries(dict).map(([key, text]) => ({ key, ko: text.ko, en: text.en }));
}
