# @ap/fo-bridge

FeedbackOps 다리의 런타임(ADR-0071·0081, #759). 소비자 쪽 패키지이며 SDK가 아니다(`SDK_PACKAGES`에 없다). 다리 메뉴(`@ap/menu-my-activity`, 이후 `menus/feedbackops/*`)와 앱 파일이 패키지 root를 import하고, 슬롯·API 서브패스(`./fo-api`, `./*-slot`)는 앱 `main.tsx`만 import한다.

## 파일

- `src/fo-api.ts` — `setFoApi`/`foApi`: 앱이 주입하는 FeedbackOps API 슬롯. FeedbackOps를 import하지 않는다.
- `src/fo/session.ts` — `foQueryClient`(QueryClient는 이 하나, ADR-0071 결정 5)와 `useFoSession`(세션 세대).
- `src/fo/FoBridge.tsx`·`links.tsx`·`survey-links.tsx`·`voc-links.tsx` — 호스트 이음매(`FoBridge`)와 FeedbackOps 경로 → 플랫폼 메뉴 링크 맵.
- `src/notifications-slot.tsx`·`voc-compose-slot.tsx`·`home-todo-slot.tsx` — Kernel 슬롯 값. 앱 `main.tsx`만 import한다. 페이지(`src/pages/`)는 첫 사용 때 lazy로 불러온다.
- `src/scope-control.tsx` — Kernel 슬롯 `scopeControl`(사이드바 `목록 범위`, ADR-0081, #759). 앱 `main.tsx`만 import한다. `For('feedbackops')`는 모듈 수준의 한 컴포넌트를 돌려주고(호출마다 새로 만들면 사이드바가 다시 마운트된다), mock에서는 비활성 `전체` 자리표시를 직접 그리고, 준비된 세션에서만 `src/pages/ScopeControl.tsx`(lazy)를 연다.
- `src/nav-counts.tsx` — Kernel 슬롯 `navCounts`(사이드바 개수 배지, #761 p1b). 앱 `main.tsx`만 import한다. `For('feedbackops')`는 모듈 수준의 한 컴포넌트를 돌려주고, 그 컴포넌트는 mock·로딩·오류·준비 어느 때나 같은 자리에서 `children`을 부른다(사이드바 목록이 다시 마운트되지 않는다). 현재 `managedSystem`으로 FeedbackOps `fetchNavCounts`를 `useQuery`로 읽고(`foQueryClient`의 `['nav-counts', managedSystem]`, 없는 범위는 `undefined` — FeedbackOps 화면의 관찰자와 같은 쿼리를 나눠 쓰므로 `invalidateNavCounts`가 한 번 새로고침하고 범위를 떠나면 취소된다), 생략된 키는 배지 없음, 0은 0이다.
- `src/saved-views.tsx` — Kernel 슬롯 `spaceNavSection`(사이드바 `저장된 보기`, #761 p3). 앱 `main.tsx`만 import한다. `Body`는 모듈 수준 한 컴포넌트이고 mock·세션 준비 전에는 muted 한 줄(`실서버 필요`)만 그리며 요청하지 않는다. 준비된 세션에서만 `src/pages/SavedViews.tsx`(lazy)를 연다: `['saved-views','voc']` 목록·적용·삭제(#972 포커스 복구)와 수신함·Triage의 저장 폼. 적용은 `operatorHostLinks.targetOf`로 저장된 `view`가 가리키는 메뉴를 찾아 담지 않은 키와 `managedSystem`을 지운다. 실패는 Kernel 토스트.
- `src/pages/HomeTodo.tsx`·`VocCompose.tsx`·`ScopeControl.tsx` — 슬롯이 lazy로 여는 FeedbackOps 화면. 전체 진입 `@fops/frontend/global-screens`는 여기서만 import한다.
- `src/fo-entry-graph.test.ts` — 다리가 닿는 FeedbackOps 진입의 import 그래프와 영구 로드 모듈의 `/core` 한정을 고정한다.

## 규칙

- 루트와 슬롯 파일(`src/pages/` 밖)은 `@fops/frontend/global-screens/core`만 import한다. 전체 진입을 영구 로드 코드에 들이면 메인 번들에 FeedbackOps 화면이 실린다(ADR-0071 결정 1, #654).
- 화면은 재export하지 않는다. 다리 메뉴가 정확한 FeedbackOps 진입을 직접 import한다.
- 세션 싱글턴은 이 패키지에만 둔다. 다른 패키지가 `foQueryClient`나 세션을 새로 만들지 않는다.
- 슬롯·페이지 테스트는 메뉴 manifest가 필요해 `@ap/menu-my-activity`가 가진다(`src/fo/test-support.tsx`).
