import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { usePreferenceController, usePreferenceState } from './platform/preferenceContext';

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
  expandShort: { ko: '펼치기', en: 'Expand' },
  pageHeadExpand: { ko: '페이지 머리 펼치기', en: 'Expand page head' },
  pageHeadCollapse: { ko: '페이지 머리 접기', en: 'Collapse page head' },
  pageNotesCount: { ko: '안내 {count}', en: 'Notes {count}' },
  pageIssuesCount: { ko: '확인 필요 {count}', en: 'Needs attention {count}' },
  outcomeDetails: { ko: '자세히', en: 'Details' },
  pageFilterPendingChanges: { ko: '미적용 변경 있음', en: 'Unapplied changes' },
  appliedFilterCount: { ko: '{count}개 적용', en: '{count} applied' },
  applyWithCount: { ko: '적용 ({count})', en: 'Apply ({count})' },
  unappliedFilterMarker: { ko: '미적용 {count}', en: 'Unapplied {count}' },
  unappliedFilterRail: { ko: '미적용 변경 {count}개', en: '{count} unapplied changes' },
  filterStateDescription: { ko: '적용된 필터 {applied}개, 미적용 변경 {count}개', en: '{applied} filters applied, {count} unapplied changes' },
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
  scopeUnknownBody: { ko: '등록된 Scope가 아닙니다. 목록에서 다시 고르세요.', en: 'This scope is not registered. Pick another from the list.' },
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
  membershipAsOf: { ko: '그 시점 소속', en: 'Membership as of period' },
  line: { ko: 'Line', en: 'Line' },
  prcGroup: { ko: 'PRC 그룹', en: 'PRC group' },
  condition: { ko: '설비 그룹 조건', en: 'Group condition' },
  selection: { ko: '설비 선택', en: 'Equipment selection' },
  all: { ko: '전체', en: 'All' },
  none: { ko: '없음', en: 'None' },
  explicitEmpty: { ko: '빈 선택', en: 'Empty selection' },
  notUsed: { ko: '이 화면에서 미사용', en: 'Not used on this screen' },
  referenceOnly: { ko: '참조만', en: 'Reference only' },
  applied: { ko: '적용', en: 'Applied' },
  inherited: { ko: '전달된 Context', en: 'Carried-over context' },
  globalContext: { ko: '전역 Context', en: 'Global context' },
  home: { ko: '홈', en: 'Home' },
  back: { ko: '뒤로', en: 'Back' },
  returnContextReverted: { ko: '출발 화면의 Context로 돌아왔습니다. 상세에서 바꾼 항목을 되돌렸습니다: {items}', en: 'Returned to the starting context. Reverted: {items}.' },
  returnRowBack: { ko: '← {menu}로 돌아가기', en: '← Back to {menu}' },
  returnRowFrom: { ko: '{system}에서 왔습니다', en: 'From {system}' },
  retry: { ko: '다시 시도', en: 'Retry' },
  loading: { ko: '불러오는 중…', en: 'Loading…' },
  refreshing: { ko: '같은 조건으로 갱신 중', en: 'Refreshing same context' },
  correlationId: { ko: 'Correlation ID', en: 'Correlation ID' },
  serverDetail: { ko: '서버 세부', en: 'Server detail' },
  askAccessOwner: { ko: '관리자에게 요청하세요.', en: 'Ask the person who grants access.' },
  sharedOutcomeRegion: { ko: '위젯 상태 요약', en: 'Widget state summary' },
  sharedOutcomeSummary: { ko: '위젯 {count}개에서 같은 응답({outcome})이 확인되었습니다.', en: '{count} widgets report the same response ({outcome}).' },
  sharedOutcomeError: { ko: '서버 오류', en: 'server error' },
  sharedOutcomeTimeout: { ko: '시간 초과', en: 'timeout' },
  sharedOutcomeEmpty: { ko: '0건', en: 'zero rows' },
  stateTimeoutBody: { ko: '조회가 제한 시간 안에 끝나지 않았습니다. 기간을 줄이거나 집계 단위를 키워 다시 시도하세요.', en: 'The query did not finish in time. Shorten the period or coarsen the granularity and retry.' },
  stateIdle: { ko: '아직 조회하지 않았습니다', en: 'No query has run yet' },
  queryMissing: { ko: '{label}{particle} 선택하세요', en: 'Select {label}' },
  stateEmpty: { ko: '조건에 맞는 결과가 없습니다', en: 'No matching result' },
  stateEmptyBody: { ko: '조회는 성공했고 결과가 0건입니다. 조건을 바꿔 다시 조회하세요.', en: 'The query succeeded with zero rows. Change the conditions and query again.' },
  stateForbidden: { ko: '이 Scope에 접근 권한이 없습니다', en: 'You do not have access to this scope' },
  stateForbiddenBody: { ko: '현재 권한으로는 이 Scope를 볼 수 없습니다. 관리자에게 요청하세요.', en: 'Your current permissions cannot view this range. Ask the person who grants access.' },
  stateTooLarge: { ko: '조회 범위가 너무 큽니다', en: 'Query too large' },
  stateTooLargeBody: { ko: '한 번에 가져오기에는 범위가 큽니다. 조회 조건을 좁혀 다시 시도하세요.', en: 'The range is too large to load at once. Narrow the conditions and retry.' },
  stateTimeout: { ko: '조회 시간이 초과되었습니다', en: 'Query timed out' },
  stateError: { ko: '데이터를 불러오지 못했습니다', en: 'Unable to load data' },
  stateErrorCause: { ko: '서버가 데이터를 보내지 못했습니다.', en: 'The server could not return the data.' },
  stateErrorAction: { ko: '다시 시도하세요. 문제가 계속되면 관리자에게 아래 Correlation ID를 전달하세요.', en: 'Retry. If the problem persists, share the Correlation ID below with your system administrator.' },
  timeDomainUnverifiedCause: { ko: '시간 기준이 확인되지 않아 함께 집계할 수 없습니다.', en: 'The time reference is unconfirmed, so these cannot be aggregated together.' },
  timeDomainUnverifiedAction: { ko: '설비를 좁히거나 기간을 줄이세요.', en: 'Narrow the equipment or shorten the period.' },
  timeDomainMismatchCause: { ko: '시간 기준이 서로 달라 함께 집계할 수 없습니다.', en: 'The time references differ, so these cannot be aggregated together.' },
  timeDomainMismatchAction: { ko: '같은 시간 기준의 설비를 고르거나 나눠 조회하세요.', en: 'Choose equipment that share a time reference, or query them separately.' },
  stateUnknown: { ko: '상태를 확인할 수 없습니다', en: 'Status could not be confirmed' },
  stateUnknownBody: { ko: '왜 이런 상태인지 확인하지 못했습니다. 잠시 뒤 다시 시도하세요.', en: 'The cause could not be confirmed. Try again in a moment.' },
  selectScope: { ko: 'Scope를 선택하세요', en: 'Select a scope' },
  selectScopeBody: { ko: 'Scope를 고르면 그 Scope의 데이터를 조회합니다.', en: 'Pick a scope to load its data.' },
  applySuggested: { ko: '최근 Scope 적용', en: 'Apply recent scope' },
  selectPeriod: { ko: '기간을 선택하세요', en: 'Select a period' },
  contractError: { ko: '주소에 쓸 수 없는 값이 있습니다', en: 'The address has a value this page cannot use' },
  contractErrorBody: { ko: '주소의 값이 올바르지 않아 조회하지 않았습니다. 주소를 고치거나 조건을 초기화하세요.', en: 'The address has a value this page cannot use. Fix the address or reset the conditions.' },
  contractErrorAction: { ko: '주소를 고치거나 조건을 초기화하세요.', en: 'Fix the address or reset the conditions.' },
  contractCauseMembershipPair: { ko: '소속 기준에는 설비 그룹 조건 또는 PRC 그룹이 필요합니다.', en: 'Membership basis requires a condition or PRC group.' },
  contractCauseMembershipUnsupported: { ko: '소속 이력을 지원하지 않는 조건입니다.', en: 'A condition axis does not support membership history.' },
  contractCausePartialPeriod: { ko: '기간의 시작과 끝 중 하나만 있습니다.', en: 'Only one end of the period is in the address.' },
  contractCauseInvalidPeriod: { ko: '기간의 시작이 끝보다 늦습니다.', en: 'The period starts after it ends.' },
  contractCauseDuplicateKey: { ko: '같은 키가 주소에 두 번 있습니다.', en: 'The same key is written twice in the address.' },
  contractCauseAliasConflict: { ko: '설비 선택을 두 이름으로 같이 적었습니다.', en: 'The equipment selection is written under both names.' },
  contractCauseMetricPair: { ko: '지표 버전만 있고 어느 지표인지 없습니다.', en: 'A metric version is present without the metric.' },
  contractCauseMetricPairIncomplete: { ko: '지표만 있고 버전이 없습니다.', en: 'A metric is present without its version.' },
  contractCauseEmptySetWithList: { ko: '빈 선택 표시와 목록을 주소에 같이 적었습니다.', en: 'An empty-selection mark and a list are both written in the address.' },
  resetContext: { ko: '조건 초기화', en: 'Reset conditions' },
  notFound: { ko: '등록되지 않은 경로입니다', en: 'Unregistered route' },
  plannedTitle: { ko: '레지스트리에 선언된 메뉴 (화면 미구현)', en: 'Registered menu (screen not built)' },
  plannedBody: { ko: '이 메뉴는 등록만 되어 있고 화면은 아직 없습니다. 이동, 조건 전달, 권한 확인은 화면 없이도 동작합니다.', en: 'This menu is registered but its screen is not built yet. Navigation, carried conditions and access checks already work.' },
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
  switcherTitle: { ko: '시스템 및 플랫폼 메뉴', en: 'Systems and platform menu' },
  switcherCurrent: { ko: '시스템 및 플랫폼 메뉴 · 현재: {space}', en: 'Systems and platform menu · current: {space}' },
  platformMenu: { ko: '플랫폼 메뉴', en: 'Platform menu' },
  platformMenuShared: { ko: '모든 시스템에서 공통', en: 'Shared by every system' },
  unreadNamed: { ko: '{label}, 읽지 않음 {count}건', en: '{label}, {count} unread' },
  countNamed: { ko: '{label}, {count}건', en: '{label}, {count}' },
  unreadCount: { ko: '읽지 않음 {count}', en: '{count} unread' },
  viewAll: { ko: '모두 보기', en: 'View all' },
  switcherSystemsHeading: { ko: '업무 시스템', en: 'Business systems' },
  platformName: { ko: '분석 플랫폼', en: 'Analytics platform' },
  switcherCurrentBadge: { ko: '현재', en: 'Current' },
  switcherResume: { ko: '이어서: {menu}', en: 'Resume: {menu}' },
  switcherStart: { ko: '시작: {menu}', en: 'Start: {menu}' },
  switcherPlannedHeading: { ko: '준비 중', en: 'Coming soon' },
  switcherPlannedBody: { ko: '아직 사용할 수 없습니다', en: 'Not available yet' },
  switcherEmpty: { ko: '접근 가능한 업무 시스템이 없습니다', en: 'No business system is available to you' },
  railSections: { ko: '시스템 섹션', en: 'System sections' },
  restricted: { ko: '권한 필요', en: 'Restricted' },
  capability: { ko: 'Context 지원 방식', en: 'Context capability' },
  pageType: { ko: '페이지 유형', en: 'Page type' },
  selectedRange: { ko: '선택 구간', en: 'Selected range' },
  invalidUrlValue: { ko: '{field} “{raw}”{particle} 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.', en: '{field} “{raw}” is not a value this page can use. Reset the conditions.' },
  invalidUrlFilter: { ko: '{field} “{raw}”{particle} 이 화면에서 쓸 수 없는 필터입니다. 조건을 초기화하세요.', en: '{field} “{raw}” is not available on this screen. Reset the filters.' },
  invalidUrlDrillGap: { ko: '{field} “{raw}”{particle} 앞 단계 없이 쓸 수 없습니다.', en: '{field} “{raw}” cannot be used without the earlier steps.' },
  invalidUrlPlain: { ko: '{field} “{raw}”{particle} 이 화면에서 쓸 수 없습니다.', en: '{field} “{raw}” cannot be used on this page.' },
  invalidTableTitle: { ko: '정렬·페이지 값이 올바르지 않습니다', en: 'The sort or page value cannot be used' },
  invalidFilterTitle: { ko: '필터 값이 올바르지 않습니다', en: 'A filter value cannot be used' },
  invalidTableSort: { ko: '정렬', en: 'Sort' },
  invalidTablePage: { ko: '페이지', en: 'Page' },
  preferencesUnsaved: { ko: '설정을 서버에 저장하지 못했습니다. 이 브라우저에는 남아 있으며 다시 시도합니다.', en: 'Your settings could not be saved to the server. They stay in this browser and will be retried.' },
} satisfies Record<string, Text>;

export type Key = keyof typeof dict;
/** Static copy for a message raised where no I18nProvider value is read (the Provider's own toast). */
export function textFor(key: Key, lang: Lang): string {
  return dict[key][lang];
}
type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: (key: Key, params?: Record<string, string | number>) => string; tx: (text: Text) => string; text: (key: Key) => Text };
const I18nContext = createContext<I18n | null>(null);
const STORAGE = 'platform:lang';

function initialLang(): Lang {
  try { return localStorage.getItem(STORAGE) === 'en' ? 'en' : 'ko'; } catch { return 'ko'; }
}

const makeI18n = (lang: Lang, setLang: (lang: Lang) => void): I18n => ({ lang, setLang, t: (key, params) => dict[key][lang].replace(/\{(\w+)\}/g, (token, name: string) => params?.[name] === undefined ? token : String(params[name])), tx: text => text[lang], text: key => dict[key] });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE, next); } catch { /* preference stays in memory */ }
  }, []);
  const value = useMemo<I18n>(() => makeI18n(lang, setLang), [lang, setLang]);
  // The document language follows the language that is visible — also on a reload, where no setLang runs
  // (mock fallback has no ServerLanguage, whose effect covers only the server-preference assembly, #1139).
  useLayoutEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const asLang = (value: unknown): Lang | undefined => (value === 'ko' || value === 'en' ? value : undefined);

/**
 * Inside a PlatformProvider that carries the server preference seam: the account's `lang` replaces the browser-wide choice
 * (which shows until the server value is known) and a language change is written to the account, not to browser storage.
 */
export function ServerLanguage({ children }: { children: ReactNode }) {
  const base = useContext(I18nContext);
  const preferences = usePreferenceController();
  usePreferenceState(preferences);
  const serverLang = preferences ? asLang(preferences.get('lang')) : undefined;
  const lang = serverLang ?? base?.lang ?? 'ko';
  const setLang = useCallback((next: Lang) => { preferences?.set('lang', next); }, [preferences]);
  const value = useMemo<I18n | null>(() => (base && preferences ? makeI18n(lang, setLang) : base), [base, preferences, lang, setLang]);
  // The document language follows the language that is visible: the account's, else the browser-wide fallback.
  useLayoutEffect(() => { document.documentElement.lang = lang; }, [lang]);
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

const INVALID_URL_KEY = { value: 'invalidUrlValue', filter: 'invalidUrlFilter', plain: 'invalidUrlPlain', drillGap: 'invalidUrlDrillGap' } as const satisfies Record<string, Key>;

/** Korean topic particle by the final-consonant of the last character; anything that is not a Hangul syllable takes 는. */
export function topicParticle(name: string): '은' | '는' {
  const code = name.charCodeAt(name.length - 1);
  const syllable = code >= 0xac00 && code <= 0xd7a3;
  return syllable && (code - 0xac00) % 28 !== 0 ? '은' : '는';
}

/** Korean object particle by the final-consonant of the last character; anything that is not a Hangul syllable takes 를. */
export function objectParticle(name: string): '을' | '를' {
  const code = name.charCodeAt(name.length - 1);
  const syllable = code >= 0xac00 && code <= 0xd7a3;
  return syllable && (code - 0xac00) % 28 !== 0 ? '을' : '를';
}

/** Missing-condition line shared by the query bar and the result area, so both name the field and particle the same way. */
export function queryMissingSentence(lang: Lang, label: Text): string {
  return dict.queryMissing[lang].replace(/\{(label|particle)\}/g, (_token, name: string) => name === 'label' ? label[lang] : lang === 'ko' ? objectParticle(label.ko) : '');
}

/** ADR-0034 sentence for an invalid URL value: the field's user name + the raw value as entered (quoted, untruncated) + cause/action. Placeholders fill in one pass, so the raw value is never re-read. */
export function invalidValueSentence(lang: Lang, kind: 'value' | 'filter' | 'plain' | 'drillGap', field: Text, raw: string): string {
  const fill: Record<string, string> = { field: field[lang], raw, particle: lang === 'ko' ? topicParticle(field.ko) : '' };
  return dict[INVALID_URL_KEY[kind]][lang].replace(/\{(field|raw|particle)\}/g, (_token, name: string) => fill[name] ?? '');
}

const IDENTIFIER_NAMES = {
  lineNames: dict.line, prcGroups: dict.prcGroup,
  roomNames: dict.roomNames, selectedEquipmentIds: dict.selection,
  lotIds: { ko: 'Lot', en: 'Lot' }, recipeIds: { ko: 'Recipe', en: 'Recipe' }, ppid: { ko: 'PPID', en: 'PPID' },
} as const satisfies Record<string, Text>;

/** User names of the URL keys a `ContractError` can blame (`field`); the set markers share their set's name. */
export const URL_FIELD_NAMES: Readonly<Record<string, Text>> = {
  from: { ko: '시작 시각', en: 'Start time' },
  to: { ko: '끝 시각', en: 'End time' },
  scopeId: dict.scope,
  v: { ko: '주소 버전', en: 'Address version' },
  ...IDENTIFIER_NAMES,
  roomSelection: IDENTIFIER_NAMES.roomNames, equipmentSelection: IDENTIFIER_NAMES.selectedEquipmentIds,
  lotSelection: IDENTIFIER_NAMES.lotIds, recipeSelection: IDENTIFIER_NAMES.recipeIds,
  metricId: { ko: '지표', en: 'Metric' },
  metricVersion: dict.metricVersion,
  membershipBasis: { ko: '소속 기준', en: 'Membership basis' },
  lineSelection: dict.line, prcGroupSelection: dict.prcGroup,
  equipmentGroup: dict.condition,
};

const CONTRACT_CAUSE = {
  membership_basis_pair: 'contractCauseMembershipPair',
  membership_basis_unsupported: 'contractCauseMembershipUnsupported',
  partial_period: 'contractCausePartialPeriod',
  invalid_period: 'contractCauseInvalidPeriod',
  duplicate_singleton: 'contractCauseDuplicateKey',
  duplicate_page_key: 'contractCauseDuplicateKey',
  alias_conflict: 'contractCauseAliasConflict',
  metric_pair: 'contractCauseMetricPair',
  metric_pair_incomplete: 'contractCauseMetricPairIncomplete',
  invalid_set: 'contractCauseEmptySetWithList',
} as const satisfies Record<string, Key>;

/** Body copy of the URL error screen: the blamed field + quoted raw value (ADR-0034), else a per-code cause, then the action. Parser text never appears here. */
export function contractErrorSentence(lang: Lang, error: { code: string; field?: string; raw?: string }): string {
  const name = error.field === undefined ? undefined : URL_FIELD_NAMES[error.field];
  if (name && error.raw !== undefined) return `${invalidValueSentence(lang, 'plain', name, error.raw)} ${dict.contractErrorAction[lang]}`;
  if (Object.prototype.hasOwnProperty.call(CONTRACT_CAUSE, error.code)) return `${dict[CONTRACT_CAUSE[error.code as keyof typeof CONTRACT_CAUSE]][lang]} ${dict.contractErrorAction[lang]}`;
  return dict.contractErrorBody[lang];
}
