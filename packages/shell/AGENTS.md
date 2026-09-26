# @ap/shell

App Shell(06 §8–9, 화면 설계 [07](../../docs/07_app_shell_wireframe.md)). 메뉴 목록은 주입된 Registry에서, 선택지·세션은 어댑터에서 읽는다.

## 파일

- `AppShell.tsx` — 사이드바(270px)/아이콘 레일(64px)/탑바(54px) 배치, `[` 단축키.
- `Sidebar.tsx` — 그룹 아코디언, 권한 기반 노출, 즐겨찾기·최근, 메뉴 필터.
- `TopBar.tsx` — Scope 선택(`session.scopes`)과 검증 상태, ⌘K, 한/EN, `slots.topBarTools`.
- `CommandPalette.tsx` — 메뉴 검색 이동.
- `GlobalContextBar.tsx` — 기간·room_name·Condition·Selection·전달 Context 표시/편집. 선택지는 `useAdapterRequest`로 `contextOptions`·`evaluateSelection` 조회, 실패 시 오류와 재시도.
- `RouteOutlet.tsx` — 현재 경로의 메뉴 화면 또는 미등록·계약 오류·권한 없음·미구현 상태.

## 규칙

- import 가능: `@ap/contracts`, `@ap/kernel`, `@ap/components`, `@ap/ui`. 앱·mock·메뉴 화면 import 금지. 특정 메뉴 id를 코드에 쓰지 않는다.
- 도메인 선택지(설비·room·조건 목록)를 셸이 계산하지 않는다. 어댑터가 세션 권한으로 거른 결과를 표시만 한다.
- 개발 전용 도구(역할 전환, 응답 시나리오)는 셸에 넣지 않는다. 앱이 `slots.topBarTools`로 주입한다.
- 레이아웃 치수·IA 변경은 07/06 §9 변경이다. 워크스페이스 층(06 §9.1)도 여기와 Registry에 얹는다.

## 검증

루트 `pnpm typecheck && pnpm test && pnpm build`, `pnpm dev`로 사이드바·레일·Context Bar·역할 전환 후 메뉴 노출을 직접 확인.
