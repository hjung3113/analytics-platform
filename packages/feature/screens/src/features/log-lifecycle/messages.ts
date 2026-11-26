/** Copy for lifecycle page composition. */
export const pageCopy = {
  models: '모델', requests: '검증 요청', project: '개발 건', unknownModel: '모델 확인 불가',
  roundOpen: 'Round 열기', projectUpdate: '개발 건 수정', cancel: '개발 건 취소', reopen: '개발 건 재개', profile: '모델·SW 프로파일',
  projectPermission: '개발 건 관리 권한이 없습니다.', roundPermission: 'Round 관리 권한이 없습니다.', openRound: '이미 열린 Round가 있습니다.',
  software: 'SW', owner: '담당', target: '목표일', unassigned: '미지정', unknownVersion: '버전 이름 확인 불가', unknownName: '이름 확인 불가', undecided: '미정',
  move: (stage: string) => `${stage}로 이동`, projectTitle: (model: string) => `${model} · 개발 건`,
  roundTitle: (model: string, seq?: number) => `${model} · Round${seq === undefined ? '' : ` ${seq}`}`,
  sourceInfo: (count: number) => `${count}파일 · 파일 순서 → 줄 번호 · Top View 미연결`,
  gateDecision: 'Gate 결정', attempt: '시도', latestExecution: '최신 실행', gate: 'Gate', resultScope: '결과 범위',
  decisionReasonOneLine: '결정 사유 (한 줄)', decisionRequiredMark: '· 필수', decisionReasonRequired: '결정 사유를 입력해 주세요.',
  opinionGrade: '의견 등급', opinionGradePrefix: '의견 등급:', all: '전체', problems: '문제만', noOpinion: '의견 없음',
  resultsLoading: '규칙 결과 불러오는 중…', resultsUnavailable: '규칙 결과 집계 불가',
  scaleLoading: '의견 척도 불러오는 중…', scaleUndeclared: '의견 척도 미선언', showAll: '전체 보기',
  requiredUnchecked: (count: number) => `필수 오류·미검증·건너뜀 ${count}건`, resultCount: (count: number, total: number) => `${count}건 · 전체 규칙 ${total}건`,
  noCompletedAttempt: '완료된 검증 시도 없음', noRequests: '요청 없음 · 이 Round의 검증을 요청하면 작업자가 실행 시간대에 가져갑니다.', unknownState: '상태 확인 불가',
  completedResult: (number: number) => `완료된 시도 #${number}의 결과를 보여 줍니다.`,
  register: '요청 등록', outside: '시간대 밖', queueInfo: '실행 시간대 안내',
  window: (from: number, to: number) => `실행 시간대 평일 ${String(from).padStart(2, '0')}–${String(to).padStart(2, '0')}`,
  queueDetail: (zone: string, server: string, limit: number) => `시간대 ${zone} · 서버 시각 ${server} · 사용자당 즉시 대기 요청 동시 ${limit}건까지`,
  weekend: (allDay: boolean) => `주말 ${allDay ? '종일' : '동일 시간대'}`,
  filters: (count: number) => `추가 필터 (${count}) ▾`,
} as const;

/** Copy for the lifecycle forms' submit validation (#2574): one error per required or malformed field. */
export const formCopy = {
  ownerRequired: '담당 Actor ID를 입력해 주세요.', reasonRequired: '사유를 입력해 주세요.', sourceOwnerRequired: '원본 소유자를 입력해 주세요.',
  sampleLocationRequired: (n: number) => `샘플 ${n} 위치를 입력해 주세요.`, sampleShaMalformed: 'SHA-256은 16진수 64자로 입력해 주세요.',
  riskActorRequired: '위험 수용자 Actor ID를 입력해 주세요.', scopeRequired: '예외 범위를 입력해 주세요.',
  decisionRequired: '결정을 선택해 주세요.', noDecisionAllowed: '서버가 허용한 결정이 없습니다.',
} as const;
