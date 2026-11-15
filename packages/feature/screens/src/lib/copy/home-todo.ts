// The platform home `내 할 일` panel (`features/home/todo`). Its own module: `home.ts` is reached by the eager bridge
// entry (`global-screens/core`), and this panel's copy belongs to its lazy chunk.
// The platform home `내 할 일` section (platform ADR-0070 decision 8): bridge-only, no feature route.
export const HOME_TODO_COPY = {
  title: '내 할 일',
  surveys: '응답할 설문',
  vocs: '내 VOC',
  permissionRequests: '권한 요청',
  viewAll: '모두 보기',
  loadError: '불러오지 못했습니다',
} as const;
