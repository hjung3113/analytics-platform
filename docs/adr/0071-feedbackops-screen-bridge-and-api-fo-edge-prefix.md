# ADR-0071 — FeedbackOps 화면은 `@fops/frontend/global-screens` 다리로 올리고, 그 화면의 API는 `/api/fo`로 부르며 플랫폼 앞단이 접두사를 뗀다

- Status: Decided (2026-10-22) — 코디네이터 결정, 사용자 위임, 되돌릴 수 있음
- Amended (2026-10-23, #652): 결정 1(진입점에 `useUnreadNotificationCount`), 결정 6(알림 종·배지는 Kernel 선택 슬롯), 결정 7(종은 mock에서도 보인다).
- Amended (2026-10-23, #653): 결정 1(설문 화면 내보내기, 호스트 이음매 훅은 아직 불필요), 결정 10(설문 경로 둘만 링크).
- Amended (2026-10-23, #654): 결정 1(내 VOC 화면 내보내기, 운영 화면을 옮기지 않는다), 결정 10(알림 페이지는 `voc.public_update_posted`만 링크).
- Amended (2026-10-23, #654 FIX2): 결정 1·6(영구 로드되는 다리 코드는 `global-screens/core`만 import한다 — 화면 배럴이 메인 청크에 실리지 않게).
- Scope: [#594](https://github.com/hjung3113/analytics-platform/issues/594), 단위 이슈 [#651](https://github.com/hjung3113/analytics-platform/issues/651). [합류 설계](../integration/feedbackops-merge-design.md) §7의 O5(라우팅 이전)·O13(FeedbackOps API 경로)을 #594 범위에서 닫는다.
- 갱신: [ADR-0069](0069-platform-port-in-feedbackops-backend.md) 결정 3(O13)·결정 4(CSRF)의 FeedbackOps 경로 부분.
- 바탕: [ADR-0066](0066-feedbackops-merges-into-platform.md)(화면은 옮기고 다시 쓰지 않는다), [ADR-0070](0070-global-features-platform-menu-and-voc-drawer.md)("여기서 정하지 않는 것"으로 O5·O13을 #594 구현에 넘겼다), [ADR-0046](0046-design-system-source-moves-to-platform-whole-package.md)(플랫폼 패키지는 `@fops/*`를 import하지 않는다).
- 이 문서의 FeedbackOps ADR은 `FO ADR-NNNN`으로 적는다(FO ADR-0071은 `platformReturn`이다).

## 맥락

ADR-0070은 알림·설문·내 VOC·권한 요청 같은 전역 기능을 플랫폼 화면으로 두기로 했고, FeedbackOps 화면을 Kernel 라우팅에 올리는 기술 방식(O5)과 API 경로(O13)는 #594 구현에서 열기로 미뤘다. 첫 화면인 알림(#651)이 그 첫 소비자다.

- FeedbackOps 화면 197개 파일이 TanStack Router를 직접 import한다. 화면마다 다시 쓰면 "화면은 옮기고 다시 쓰지 않는다"(합류 설계 §2 원칙 2)를 어긴다.
- 플랫폼 `PlatformAdapter`에는 알림을 읽을 `menuQuery`가 없고, FeedbackOps 백엔드에도 그 라우트가 없다. 알림 읽기를 `menuQuery`로 옮기면 FeedbackOps의 읽기 로직을 다시 쓰고 소유자가 둘이 된다(합류 설계 §2 원칙 1).
- 패키지 경계 규칙 8은 어떤 플랫폼 패키지도 `@fops/*`를 import하지 못하게 한다.
- FeedbackOps 백엔드의 도메인 경로(`/notifications`, `/vocs` …)는 루트에 붙어 있고, 테스트 약 200파일·1,400줄과 배포 설정이 그 경로를 안다.

## 결정

1. **다리는 FeedbackOps의 `src/global-screens` 진입점 하나와 이를 import하는 플랫폼 패키지 `@ap/menu-my-activity` 하나다.**
   - `@fops/frontend`는 `exports["./global-screens"]`만 연다. 진입점은 `FoScreenRoot`·`createFoQueryClient`·`configureApiClient`·`InboxPanel`·`useUnreadNotificationCount`·`SurveyParticipationScreen`·`RespondSurveyScreen`·`MyVocListScreen`·`ReporterVocDetail`(과 내 VOC 목록 질의 타입·상수)·`VocComposeScreen`(레일 `VOC 등록` 드로어 본문, #656, 과 `VocComposeScreenProps`)·`PermissionRequestsScreen`(권한 요청 페이지, #657)과 타입 `HostSeam`·`HostLinkProps`만 내보낸다. 내 VOC는 운영 화면(InboxRoute·VocDetailPanel)을 옮기지 않고 FeedbackOps 부품으로 신고자 관점 화면을 조립했다 — 운영 패널은 역할에 따라 Triage·Finding·작성기를 그리고 그래프가 다리 규칙을 30파일 넘게 어긴다.
   - `global-screens/core`(`exports["./global-screens/core"]`)는 진입점의 부분집합(`configureApiClient`·`createFoQueryClient`·`FoScreenRoot`·`InboxPanel`·`useUnreadNotificationCount`와 타입 `HostSeam`·`HostLinkProps`)이다. 영구 로드되는 다리 코드(알림 슬롯 `notifications-slot`, `fo/FoBridge`, `fo/session`)는 이것만 import해서 설문·VOC 화면 배럴이 메인 청크에 실리지 않는다(모듈 최상위 호출이 있는 파일은 import한 쪽이 트리 셰이킹돼도 롤업이 남긴다). 화면을 그리는 lazy `pages/*`는 전체 진입점을 쓴다.
   - 패키지 경계 규칙 8의 예외는 한 줄이다: `@ap/menu-my-activity`는 정확히 `@fops/frontend/global-screens`와 `@fops/frontend/global-screens/core` 둘만 import할 수 있다. lint 프리셋 `foBridgeMenu`가 강제하고(다른 `@fops/*`·다른 메뉴·다른 층은 그대로 막힌다), 진입점의 import 그래프에 라우터·`routes/**`·`lib/router/**`·`lib/layout/**`·`lib/auth/**`·`lib/api/auth.ts`·`@/lib/api` 배럴이 없고 `client.ts` 밖에 네트워크 호출이 없다는 것을 그래프 테스트가 고정한다.
   - 옮기는 화면은 FeedbackOps의 **호스트 이음매**(`lib/host`)만 쓴다. 지금은 `HostLink`·`canLink`·`notifyError`·`notifySuccess` 넷이다(`notifySuccess`의 첫 소비자는 #656 VOC 등록 드로어 — `접수 완료: <display_id>` 토스트의 글은 내용만 알고, 독립 앱은 sonner로, 다리는 Kernel `toast`로 구현한다). #653은 이음매 훅이 필요 없었다(설문 ID는 플랫폼 경로 인자를 화면 prop으로 넘기고, 제출 뒤 복귀는 플랫폼 머리의 Kernel `ReturnLink`로 한다). `useHostNavigate`·`useHostSearch`·`useHostParams`는 첫 소비자가 생길 때 그 테스트와 함께 넣는다(쓰는 곳 없는 이음매를 먼저 만들지 않는다). 독립 앱은 이음매를 자기 마운트 지점(HomeScreen)에서 TanStack Router·sonner로 구현한다.
2. **데이터 경로는 FeedbackOps 자체 클라이언트다.** 다리 화면의 FeedbackOps 클라이언트가 기준 경로 `/api/fo`로 FeedbackOps API를 직접 부른다. `@ap/contracts`·`PlatformAdapter`·`menuQuery`는 바꾸지 않는다. 진입점 그래프의 모든 요청은 `lib/api/client.ts`의 `sendRequest` 하나를 지난다. 기준 경로와 401 처리는 `configureApiClient`로 정하고, 설정하지 않은 독립 앱의 동작은 그대로다.
3. **O13: FeedbackOps 백엔드 경로는 옮기지 않는다. 플랫폼 앞단이 `/api/fo` 접두사를 떼어 보낸다.**
   - 개발(`dev:real`)은 `apps/platform-web/scripts/real-dev-proxy.ts`가 `/api/fo/`를 먼저, `/api`·`/auth`를 그 뒤에 둔다(Vite는 처음 맞는 접두사를 쓴다). 운영은 #151 배포 때 같은 규칙을 앞단에 둔다.
   - ADR-0069 결정 3("`/api/fo/**`로 옮긴다")을 이것으로 바꾼다.
   - 이유: 백엔드 경로를 옮기면 테스트와 배포 설정이 크게 바뀌고, 독립 FeedbackOps 앱은 #597에서 은퇴한다.
   - 다시 열 조건: 운영 배포(#151)에서 접두사를 떼는 프록시를 둘 수 없을 때.
4. **CSRF(ADR-0069 결정 4의 열린 메모)는 이 경로에 대해 바뀌지 않는다.** 앞단을 지난 요청은 같은 출처이고, FeedbackOps 경로의 방어는 SameSite=Lax 세션 쿠키(FO ADR-0006), JSON 본문, `Idempotency-Key`(FO ADR-0015)다. 다시 볼 조건: 앱과 FeedbackOps API가 서로 다른 사이트로 배포될 때(#151).
5. **세션 결합.** FeedbackOps QueryClient는 앱에 하나다. 세션 세대 `(adapter, revision, user)`가 바뀌면 이전 세대의 화면을 그 커밋에서 내리고, 새 화면을 그리기 전에 캐시를 비운다(진행 중 요청은 취소되어 늦은 응답이 어디에도 닿지 않는다). 다리 아래 FeedbackOps 트리는 세대마다 새로 마운트된다. FeedbackOps 401은 조립이 준 `onSessionLost`를 부른다(포트의 세션 상실과 같은 처리: 로그인으로 이동). FeedbackOps의 `/me` 가드와 로그인 화면은 플랫폼 안에서 그려지지 않는다.
6. **설정은 메뉴 서브패스로 준다.** 조립(`Assembly.feedbackOpsApi?`)이 `{ basePath, onSessionLost }`를 내고, `main.tsx`가 `@ap/menu-my-activity/fo-api`의 `setFoApi`로 넣는다(#60 `feedbackops-origin` 패턴). 이 서브패스는 FeedbackOps를 import하지 않아 FeedbackOps 코드는 lazy 페이지 청크에만 실린다. API 설정에는 Kernel 슬롯·SDK API 변경이 없다. 셸 UI(레일 알림 종·플랫폼 메뉴 배지, #652)는 다르다: API 설정이 아니라 셸 자리라서 Kernel 선택 슬롯 `notifications`로 받는다(기각된 "FeedbackOps API용 Kernel 슬롯"과 다르다). 앱 `main.tsx`가 `@ap/menu-my-activity/notifications-slot`을 넣고, 그래서 알림 건수·팝오버 경로의 FeedbackOps 코드는 메인 청크에 실린다(종이 모든 화면에 있다).
7. **mock 정책.** mock 미리보기에는 FeedbackOps 서버가 없다. FeedbackOps 데이터를 쓰는 화면은 `실서버 필요` 상태를 보이고 FeedbackOps 화면을 마운트하지 않으며 요청도 하지 않는다. 배지(#652)는 숨긴다. 종은 mock에서도 보이고 배지만 숨긴다. 팝오버 본문은 `실서버 필요`다. 이 화면들의 UX 검토는 `dev:real`과 이슈 DB에서 한다.
8. **CSS와 별칭.** FeedbackOps의 전역 `styles.css`(리셋·`html, body, #root` 높이·본문 글꼴)는 가져오지 않는다. FeedbackOps 컴포넌트의 클래스는 메뉴 `styles.css`의 `@source`로만 Tailwind에 닿는다. FeedbackOps 소스의 `@/` 별칭은 앱 `vite.config.ts`·메뉴 `vitest.config.ts`·두 `tsconfig.json`에 같은 경로로 둔다.
9. **O5 규칙(구현은 첫 URL 상태 화면에서).** 옮기는 화면의 URL 상태는 manifest `pageKeys`가 되고, 잘못된 값은 FeedbackOps의 "버림"이 아니라 플랫폼 규칙("거부하고 보존", 06 §6.4)을 따른다. 알림의 필터는 FeedbackOps처럼 컴포넌트 상태이므로 해당 없다. #595도 같은 규칙을 쓴다.
10. **링크는 플랫폼 목적지가 있는 알림 대상에만 건다.** 이음매 `canLink`는 대상별로 정한다. 알림 페이지는 `voc.public_update_posted`(`/vocs?view=my&selected=<uuid>`)만 `내 VOC 상세`(`/voc/<uuid>`, `returnTo` 포함)로 링크한다(#654). 설문 화면의 이음매는 FeedbackOps 경로 두 개만 링크한다: `/surveys/participate` → `설문`, `/surveys/<uuid>/respond` → `설문 응답`(`returnTo` 포함). 그 밖의 모든 FeedbackOps 대상(운영 대상 포함)과 알림 팝오버는 `canLink`가 `false`이고 목적지 연결은 구현하지 않았다(백로그 "알림 목적지 연결"). 링크하지 않는 행의 읽음·보관 동작은 그대로 두되, 본문은 눌러지는 것처럼 보이지 않게 비대화형으로 그리고(hover·버튼 역할·본문 클릭 읽음 처리 없음) 읽음·보관은 명시 버튼으로만 한다.

## Considered Options

- **FeedbackOps 백엔드 경로를 `/api/fo/**`로 옮긴다**(ADR-0069의 원래 결정): 기각. 테스트 약 200파일·1,400줄과 배포 설정이 바뀌고, 독립 앱은 #597에서 은퇴한다. 앞단 접두사 제거로 같은 URL 계약을 더 싸게 얻는다.
- **FeedbackOps 읽기를 `menuQuery` 엔드포인트로 다시 낸다**: 기각. FeedbackOps 백엔드에 그 라우트가 없고, 읽기 로직을 다시 쓰면 소유자가 둘이 된다(합류 설계 §2 원칙 1).
- **Kernel 슬롯으로 FeedbackOps API를 준다**: 기각. 메뉴 하나를 위해 Kernel·SDK를 바꾼다. #60의 메뉴 서브패스 패턴이 이미 있다.
- **독립 FeedbackOps 앱을 iframe으로 올린다**: 기각. 세션과 라우터가 둘이 되고, ADR-0066의 "앱 하나"에 어긋난다.

## 결과

- 소유 문서 갱신: [패키지 경계](../integration/platform-packages.md) 규칙 8, [합류 설계](../integration/feedbackops-merge-design.md) §4.1·O5·O13, ADR-0069 갱신 메모.
- 루트 turbo 작업은 FeedbackOps 작업을 돌리지 않는다(`.github/scripts/check-platform-turbo-scope.mjs`, #659). 그래서 `menus/_global/my-activity/turbo.json`이 `transit`·`build`의 의존을 `@ap/*` 패키지로 좁히고, FeedbackOps 소스(`apps/frontend`·`packages/shared`·`packages/ui`의 `src`)를 `transit` 입력으로 넣어 캐시가 FO 변경을 따라가게 한다.
- 알림 페이지(`/notifications`)가 첫 소비자다. 설문(#653)·내 VOC(#654)·권한 요청(#657)이 같은 진입점에 화면을 더한다.
- 구현하지 않음: FeedbackOps의 나머지 raw `fetch` API 모듈(`permissions.ts`의 확인·범위·관리자 목록 호출, `auth.ts`·`actors.ts`·`nav.ts` 등)의 `/api/fo` 기준 경로. `managed-systems`·`analytics-areas`의 **목록 읽기**는 #656이 `lib/api/registry-reads.ts`로 옮겨 `client.ts`(`apiRequest`)를 지난다 — 쓰기(등록·수정·보관)는 raw `fetch`로 남고 두 모듈이 읽기를 다시 내보낸다(그래프 테스트가 같은 모듈 안 raw `fetch`를 막기 때문). `permissions.ts`의 요청자 호출(요청·내 요청 목록·철회·수정·소유자 상세)은 #657이 `lib/api/permission-requests.ts`로 옮겼고 `permissions.ts`가 다시 내보낸다. 다시 볼 조건: 남은 호출을 쓰는 첫 옮기는 화면. 그래프 테스트가 그때까지 막는다([백로그](../../.planning/backlog.md)).
