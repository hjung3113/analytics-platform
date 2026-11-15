/** Attempt-diagnostic copy; API-provided text is rendered literally. */
export const diagnosticCopy = {
  diagnostics: '진단', attemptDiagnostics: '시도 진단', attempt: '시도', list: '진단 목록', title: '제목 · 상세',
  producer: '생산자', key: '항목 키', shape: '형태 요약', evidence: '근거 위치', tables: '표', rows: '행',
  rule: '규칙', analysis: '시도 전체 분석', state: '본문 상태', live: '보관 중',
  no_permission: '본문 열람 권한 없음', erased_retention: '보관 만료', erased_admin: '관리자 삭제',
  denied: '원본 열람 권한이 없어 진단 본문을 볼 수 없습니다. 형태 메타데이터만 표시합니다.',
  retained: '보관 기간이 지나 본문이 삭제되었습니다.', admin: '관리자가 본문을 삭제했습니다.',
  hiddenTitle: '제목 열람 불가', untitled: '제목 없는 진단',
  noItems: '이 시도에 제출된 진단이 없습니다', missing: '찾을 수 없음 · 진단 항목을 찾을 수 없습니다.',
  noAttempt: '선택한 시도가 없습니다. 설정·이력에서 시도를 선택해 주세요.',
  incompleteAttempt: '선택한 시도는 결과 저장이 완료되지 않아 진단을 볼 수 없습니다.',
  explanation: '설명', openSource: '원본에서 보기', unavailableSource: '원본 확인 불가 · 샘플 위치 또는 해시를 확인해 주세요.',
  noEvidence: '근거 위치 없음', sourceUnavailable: '이 화면에서는 원본 보기를 사용할 수 없습니다.',
  openDiagnostics: '이 규칙의 진단 보기', openRule: '출처 규칙 열기', filter: '출처 규칙', clearFilter: '규칙 필터 해제',
  emptyFilter: '이 규칙에 연결된 진단이 없습니다', yes: '예', no: '아니오', expand: '셀 전체 보기', collapse: '셀 접기',
  allTables: '전체 표 보기', selectedTable: '선택한 표',
} as const;
