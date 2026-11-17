import type { Text } from '@ap/contracts';

export const DEV_MESSAGES = {

  panelCatalog: { ko: '패널 카탈로그', en: 'Panel catalog' },
  panelCatalogDescription: { ko: '메뉴가 등록한 패널의 입력·출력과 권한을 확인합니다.', en: 'Inspect registered panel inputs, outputs and permissions.' },
  panelKeyFilter: { ko: '키 필터', en: 'Key filter' },
  panelId: { ko: '패널', en: 'Panel' },
  panelTitle: { ko: '제목', en: 'Title' },
  panelQuery: { ko: '조회 입력', en: 'Query inputs' },
  panelDisplay: { ko: '표시 입력', en: 'Display inputs' },
  panelOutputs: { ko: '출력', en: 'Outputs' },
  panelGrain: { ko: '데이터 단위', en: 'Grain' },
  panelEndpoints: { ko: '엔드포인트', en: 'Endpoints' },
  panelPermissions: { ko: '필요 권한', en: 'Required permissions' },
  panelWriting: { ko: '이 키를 쓰는 패널', en: 'Panels writing this key' },
  panelReading: { ko: '이 키를 읽는 패널', en: 'Panels reading this key' },
  // DevTools
  devToolsNormal: { ko: '정상', en: 'Normal' },
  devToolsSlow22s: { ko: '느린 응답 (+2.2s)', en: 'Slow (+2.2s)' },
  devToolsZeroRowsEmpty: { ko: '0건 (empty)', en: 'Zero rows (empty)' },
  devToolsStatusSourceUnknown: { ko: '상태 원천 미확인', en: 'Status source unknown' },
  devToolsPartialWidgetFailure: { ko: '일부 위젯 실패', en: 'Partial widget failure' },
  devToolsForbidden: { ko: '권한 거부 (forbidden)', en: 'Forbidden' },
  devToolsTooLarge: { ko: '조회 과대 (too_large)', en: 'Too large' },
  devToolsTimeout: { ko: '시간 초과 (timeout)', en: 'Timeout' },
  devToolsServerError: { ko: '서버 오류 (error)', en: 'Server error' },
  devToolsMalformedResponse: { ko: '응답 형식 오류 (malformed)', en: 'Malformed response' },
  devToolsScopeCheckFailed: { ko: 'Scope 확인 실패', en: 'Scope check failed' },
  devToolsRoleSwitchedPermissionsAndScopeReValidated: { ko: '역할 전환: {roleKo} — 권한·Scope를 다시 검증합니다.', en: 'Role switched: {roleEn} — permissions and scope re-validated.' },
  devToolsContractTestLinks: { ko: '계약 검증 링크', en: 'Contract test links' },
  devToolsForbiddenScopeXIA: { ko: '권한 없는 Scope (XIA)', en: 'Forbidden scope (XIA)' },
  devToolsUnsupportedVersionV2: { ko: '미지원 URL 버전 (v=2)', en: 'Unsupported version (v=2)' },
  devToolsPartialPeriodFromOnly: { ko: '기간 한쪽만 (from만)', en: 'Partial period (from only)' },
  devToolsUnsupportedLotContext: { ko: '미지원 Lot Context 전달', en: 'Unsupported Lot context' },
  devToolsExplicitEmptySelection: { ko: '명시적 빈 설비 선택', en: 'Explicit empty selection' },
  devTools90DayQueryTooLarge: { ko: '90일 조회 (too_large)', en: '90-day query (too_large)' },
  devTools7DayMultiEquipmentTimeDomainUnverified: { ko: '7일 복수 설비 (time_domain_unverified)', en: '7-day multi-equipment (time_domain_unverified)' },

  // EditSimulation
  editSimulation3ChangesInTheSpecEditorAre: { ko: '스펙 편집기의 변경 3건이 저장되지 않았습니다', en: '3 changes in the spec editor are not saved' },
  editSimulationSimulateEditing: { ko: '편집 중 시뮬레이션', en: 'Simulate editing' },
  editSimulationTurnOnAndTypeAChangeTo: { ko: '켜고 변경 내용을 입력하면 메뉴 이동 확인이 열립니다.', en: 'Turn on and type a change to make menu moves ask first.' },
  editSimulationChanges: { ko: '변경 내용', en: 'Changes' },
  editSimulationCustomMessage: { ko: '사용자 지정 메시지', en: 'Custom message' },
  editSimulationReset: { ko: '초기화', en: 'Reset' },

  // MockNotice
  mockNoticeIntegratedPrototypeSyntheticData: { ko: '통합 프로토타입 · 합성 데이터', en: 'Integrated prototype · synthetic data' },
} satisfies Record<string, Text>;
