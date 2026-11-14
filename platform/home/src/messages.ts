import type { Text } from '@ap/contracts';

export const HOME_MESSAGES = {

  // launcher-groups
  launcherGroupsOther: { ko: '기타', en: 'Other' },

  // OperationsHome
  operationsHomeJustNow: { ko: '방금', en: 'just now' },
  operationsHomeMAgo: { ko: '{mins}분 전', en: '{mins}m ago' },
  operationsHomeHAgo: { ko: '{mins60}시간 전', en: '{mins60}h ago' },
  operationsHomePlatform: { ko: '플랫폼', en: 'Platform' },
  operationsHomeContinue: { ko: '이어서: {label}', en: 'Continue: {label}' },
  operationsHomeVOC: { ko: 'VOC', en: 'VOC' },
  operationsHomeReturnsWithTheFiltersYouUsedAccess: { ko: '방문했던 조회 조건으로 돌아갑니다. 권한은 다시 확인합니다.', en: 'Returns with the filters you used. Access is checked again.' },
  operationsHomeOpensTheScreenSDefaultViewWithYour: { ko: '지금 조회 조건을 유지하고 그 화면의 기본 보기로 이동합니다.', en: 'Opens the screen\'s default view with your current filters.' },
  operationsHomeWorkSystems: { ko: '업무 시스템', en: 'Work systems' },
  operationsHomeNoWorkSystemsAreAvailable: { ko: '접근 가능한 업무 시스템이 없습니다', en: 'No work systems are available' },
  operationsHomeWorkSystemAccessIsGrantedByA: { ko: '업무 시스템 접근 권한은 플랫폼 관리자가 줍니다. 기능 권한이 필요하면 요청하세요.', en: 'Work system access is granted by a platform administrator. Request the feature access you need.' },
  operationsHomeRequestAccess: { ko: '권한 요청', en: 'Request access' },
  operationsHomeAskAPlatformAdministratorForAccessTo: { ko: '필요한 업무 시스템의 접근 권한을 플랫폼 관리자에게 요청하세요.', en: 'Ask a platform administrator for access to the work system you need.' },
  operationsHomeNotices: { ko: '공지', en: 'Notices' },
  operationsHomeNoticeList: { ko: '공지 목록', en: 'Notice list' },
  operationsHomeDismissForThisVisit: { ko: '이번 방문 동안 닫기', en: 'Dismiss for this visit' },
  operationsHomeNotices2: { ko: '공지', en: 'Notices' },
} satisfies Record<string, Text>;
