// The platform 권한 요청 page (`features/home/permission-requests`). Its own module: `home.ts` is reached by the
// eager bridge entry (`global-screens/core`), and this page's copy belongs to its lazy chunk.
// The platform 권한 요청 page (#657): strings `HOME_PERMISSION_COPY` lacks.
export const PERMISSION_REQUESTS_PAGE_COPY = {
  notice:
    '업무 시스템 접근 권한은 플랫폼 관리자가 줍니다. 여기서는 FeedbackOps 기능 권한을 요청합니다.',
  newRequest: '새 권한 요청',
  capability: '기능',
  capabilityPlaceholder: '기능 선택',
  managedSystem: 'Managed System',
  managedSystemPlaceholder: 'Managed System 선택',
  managedSystemLoading: 'Managed System을 불러오는 중입니다.',
  workspaceWide: '전체 (워크스페이스)',
  noManagedSystems: '선택할 수 있는 Managed System이 없습니다',
  reasonRequired: '사유 · 필수',
  submit: '요청 보내기',
  sent: '권한 요청을 보냈습니다',
  empty: '보낸 권한 요청이 없습니다.',
  scopeAll: '전체',
  unknownManagedSystem: '알 수 없는 Managed System',
  moreInfoHint: '관리자가 추가 정보를 요청했습니다. 철회한 뒤 다시 요청할 수 있습니다.',
  staleWrite: '요청이 바뀌었습니다. 목록을 새로 고쳤습니다.',
  confirmWithdraw: '철회',
} as const;
