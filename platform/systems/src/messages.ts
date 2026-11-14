import type { Text } from '@ap/contracts';

export const SYSTEMS_MESSAGES = {

  // Systems
  systemsBusinessSystem: { ko: '업무 시스템', en: 'Business system' },
  systemsTrackedSystem: { ko: '추적 시스템', en: 'Tracked system' },
  systemsLink: { ko: '연결 상태', en: 'Link' },
  systemsPlatformDefault: { ko: '플랫폼 기본', en: 'Platform default' },
  systemsOutsideThePlatform: { ko: '플랫폼 밖', en: 'Outside the platform' },
  systemsLinked: { ko: '연결됨', en: 'Linked' },
  systemsDisconnected: { ko: '연결 끊김', en: 'Disconnected' },
  systemsNotInTheRegistry: { ko: '등록되지 않은 업무 시스템', en: 'Not in the Registry' },
  systemsCouldNotLoadTheSystems: { ko: '시스템을 불러오지 못했습니다', en: 'Could not load the systems' },
  systemsTheLinkListCouldNotBeRead: { ko: '서버에서 연결 목록을 읽지 못했습니다. 잠시 뒤 다시 시도하세요.', en: 'The link list could not be read from the server. Try again in a moment.' },
  systemsRetry: { ko: '다시 시도', en: 'Retry' },
  systemsNoSystemsAreRegistered: { ko: '등록된 시스템이 없습니다', en: 'No systems are registered' },
  systemsBusinessSystemsAppearHereOnceTheServer: { ko: '업무 시스템이 서버 시작 때 등록되면 여기에 보입니다.', en: 'Business systems appear here once the server registers them at startup.' },
  systemsBusinessSystemsAndTheirTrackedSystems: { ko: '업무 시스템과 추적 시스템의 연결', en: 'Business systems and their tracked systems' },
  systemsNotInTheList: { ko: '(목록에 없음)', en: '(not in the list)' },
  systemsDefaultForScreensWithoutASpace: { ko: '공간이 없는 화면의 VOC 기본', en: 'Default for screens without a space' },
  systemsArchived: { ko: '보관됨', en: 'Archived' },
  systemsNotInTheList2: { ko: '(목록에 없음)', en: '(not in the list)' },
} satisfies Record<string, Text>;
