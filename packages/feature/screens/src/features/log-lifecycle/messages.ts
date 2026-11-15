/** Copy for lifecycle page composition. */
export const pageCopy = {
  models: '모델', requests: '검증 요청', project: '개발 건', unknownModel: '모델 확인 불가',
  roundOpen: 'Round 열기', projectUpdate: '개발 건 수정', cancel: '개발 건 취소', reopen: '개발 건 재개', profile: '모델·SW 프로파일',
  projectPermission: '개발 건 관리 권한이 없습니다.', roundPermission: 'Round 관리 권한이 없습니다.', openRound: '이미 열린 Round가 있습니다.',
  software: 'SW', owner: '담당', target: '목표일', unassigned: '미지정', unknownVersion: '버전 이름 확인 불가', unknownName: '이름 확인 불가', undecided: '미정',
  move: (stage: string) => `${stage}로 이동`, projectTitle: (model: string) => `${model} · 개발 건`,
  roundTitle: (model: string, seq?: number) => `${model} · 개발 건 · Round${seq === undefined ? '' : ` ${seq}`}`,
  register: '요청 등록', outside: '시간대 밖', queueInfo: '실행 시간대 안내',
  window: (from: number, to: number) => `실행 시간대 평일 ${String(from).padStart(2, '0')}–${String(to).padStart(2, '0')}`,
  queueDetail: (zone: string, server: string, limit: number) => `시간대 ${zone} · 서버 시각 ${server} KST · 사용자당 즉시 대기 요청 동시 ${limit}건까지`,
  weekend: (allDay: boolean) => `주말 ${allDay ? '종일' : '동일 시간대'}`,
  filters: (count: number) => `추가 필터 (${count}) ▾`,
} as const;
