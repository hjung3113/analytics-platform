# @ap/shell

App Shell(06 §8–9, 화면 설계 [07](../../docs/07_app_shell_wireframe.md)). 메뉴 목록은 주입된 Registry에서, 선택지·세션은 어댑터에서 읽는다.

## 파일

- `AppShell.tsx` — 레일(52px)·밝은 사이드바(240/56px)·스크롤 main 배치. `[` 단축키와 `platform:sidebar-collapsed` 저장 키·1440px 미만 기본 접힘 유지. 상단 바 없음.
- `AppRail.tsx` — 접근 가능한 공간이 2개 이상일 때만 공간 버튼, Kernel `switchSpace`, 명령 팔레트, 레일 아래 `slots.topBarTools`·도움말·언어·사용자 메뉴.
- `AppSidebar.tsx` — 공간 머리(50px)·접기, Scope 선택기, 그룹 섹션과 평평한 메뉴, 권한 기반 노출·즐겨찾기·최근. 메뉴 검색은 팔레트만.
- `ScopeSelector.tsx` — Scope 선택(`session.scopes`)과 검증 상태·room 부여 수, `error`에서 현재 Scope를 다시 고르면 `retryScope()`(다른 상태에서는 Kernel 동작 없음, #183), `error`일 때 'Scope 다시 확인'(목록에 없는 Scope도). 접힌 사이드바에서도 이름과 상태를 접근 가능하게 유지.
- `CommandPalette.tsx` — 메뉴 검색 이동.
- `GlobalContextBar.tsx` — 기간·room_name·Condition·Selection·전달 Context 표시/편집. 선택지는 `useAdapterRequest`로 `contextOptions`·`evaluateSelection` 조회, 실패 시 오류와 재시도.
- `RouteOutlet.tsx` — 현재 경로의 메뉴 화면 또는 미등록·계약 오류·권한 없음·미구현 상태.
- `RouteErrorBoundary.tsx` — 메뉴 화면의 렌더 실패를 콘텐츠 슬롯 안에 가둔다(06 §4). 셸·내비게이션·다른 메뉴는 살고, 오류 화면은 Correlation ID(`usePlatform().reportError`가 보고하고 돌려준 값)와 다시 시도·홈을 보인다. 메뉴·라우트 params·서버 revision(`adapter.subscribe` 알림)이 바뀌면 자동으로 풀린다. lazy 청크 로드 실패는 React가 거부를 lazy 객체에 캐시하므로 "다시 시도"가 페이지를 새로고침한다(URL이 딥링크라 화면 복원, `reload.ts`). 이벤트 핸들러·비동기 오류는 React 경계가 잡지 않으므로 대상이 아니다.

## 규칙

- import 가능: `@ap/contracts`, `@ap/kernel`, `@ap/components`, `@ap/ui`. 앱·mock·메뉴 화면 import 금지. 특정 메뉴 id를 코드에 쓰지 않는다.
- 도메인 선택지(설비·room·조건 목록)를 셸이 계산하지 않는다. 어댑터가 세션 권한으로 거른 결과를 표시만 한다.
- 개발 전용 도구(역할 전환, 응답 시나리오)는 셸에 넣지 않는다. 앱이 `slots.topBarTools`로 주입하고 레일 아래에 렌더한다(ADR-0009 슬롯 이름 유지).
- 레이아웃 치수·IA 변경은 07/06 §9 변경이다. 워크스페이스 층(06 §9.1)도 여기와 Registry에 얹는다.

## 검증

`pnpm --filter @ap/shell test`(경계 단위 테스트)와 루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`)에 더해 `pnpm dev`로 사이드바·레일·Context Bar·역할 전환 후 메뉴 노출을 직접 확인.
