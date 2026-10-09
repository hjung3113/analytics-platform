# @ap/shell

App Shell(06 §8–9, 화면 설계 [07](../../docs/07_app_shell_wireframe.md)). 메뉴 목록은 주입된 Registry에서, 선택지·세션은 어댑터에서 읽는다.

## 파일

- `AppShell.tsx` — 레일(52px)·밝은 사이드바(240/56px)·스크롤 main·전체 높이 오른쪽 상세 aside 배치(06 §13, ADR-0013). `[` 단축키와 `platform:sidebar-collapsed` 저장 키·1440px 미만 기본 접힘 유지. 상단 바 없음.
- `AppRail.tsx` — 로고 자리의 플랫폼 홈 링크(`/` 메뉴가 있을 때), 접근 가능한 공간이 2개 이상일 때만 공간 버튼(활성 표식은 `currentSpace`), Kernel `switchSpace`, 명령 팔레트, `feedbackOps.overall`이 있을 때만 새 탭 링크, 레일 아래 `slots.topBarTools`·도움말·언어·사용자 메뉴.
- `AppSidebar.tsx` — 전역 화면과 접근 가능한 공간이 0개일 때는 그리지 않는다. 공간 머리(50px)·접기, Scope 선택기, 그룹 섹션과 권한 기반 메뉴, 즐겨찾기·최근(펼친 모드만), 그 아래 스크롤 밖 FeedbackOps 블록(`entriesFor(현재 공간)`이 비어 있지 않을 때만, 접힘이면 아이콘만). 그룹 표시는 Registry `GroupDef`(`hideLabelWhenSingle`)만 따른다 — 그룹·메뉴 id를 코드에 쓰지 않는다(lint `ap/no-shell-id-literal-comparison`, `no-group-id-literals.test.ts`). 접근성 이름·landmark 구조는 `AppShell.test.tsx`가 고정한다. 메뉴 검색은 팔레트만.
- `ScopeSelector.tsx` — Scope 선택(`session.scopes`)과 검증 상태·room 부여 수, `error`에서 현재 Scope를 다시 고르면 `retryScope()`(다른 상태에서는 Kernel 동작 없음, #183), `error`일 때 'Scope 다시 확인'(목록에 없는 Scope도). 접힌 사이드바에서도 이름과 상태·room 설명(aria-describedby) 및 Tooltip을 유지. status만 polite live region으로 알린다.
- `CommandPalette.tsx` — 메뉴 검색 이동.
- `GlobalContextBar.tsx` — 기간·room_name·Condition·Selection·전달 Context 표시/편집. 선택지는 `useAdapterRequest`로 조회하고 실패 시 오류와 재시도를 제공한다. Selection 평가(`evaluateSelection`)는 바 수준의 한 조회 소유자가 실제·측정·인라인/넘침 편집기에 결과를 공유한다.
- `ContextBarLayout.tsx` — 06 §7·ADR-0015의 한 줄 우선순위 넘침. 바 자체·intrinsic probe의 ResizeObserver, 요청 없는 inert 측정 레이어(`MeasuringContext`), 고정 키 우선순위와 인라인/넘침 위의 편집 초안·포커스 복귀를 소유한다.
- `RouteOutlet.tsx` — 현재 경로의 메뉴 화면 또는 미등록·계약 오류·권한 없음·미구현 상태.
- `RouteErrorBoundary.tsx` — 메뉴 화면의 렌더 실패를 콘텐츠 슬롯 안에 가두고 Correlation ID(`usePlatform().reportError`)와 다시 시도·홈을 보인다(06 §4). 메뉴·params·서버 revision이 바뀌면 풀리고, lazy 청크 로드 실패의 다시 시도는 페이지 새로고침이다. 이벤트 핸들러·비동기 오류는 대상이 아니다.

## 규칙

- import 가능: `@ap/contracts`, `@ap/kernel`, `@ap/components`, `@ap/ui`. 앱·mock·메뉴 화면 import 금지. 특정 메뉴 id를 코드에 쓰지 않는다.
- 도메인 선택지(설비·room·조건 목록)를 셸이 계산하지 않는다. 어댑터가 세션 권한으로 거른 결과를 표시만 한다.
- 개발 전용 도구(역할 전환, 응답 시나리오)는 셸에 넣지 않는다. 앱이 `slots.topBarTools`로 주입하고 레일 아래에 렌더한다(ADR-0009 슬롯 이름 유지).
- 레이아웃 치수·IA 변경은 07/06 §9 변경이다. 워크스페이스 층(06 §9.1)도 여기와 Registry에 얹는다.

- 상세 슬롯 aside는 셸이 소유한다. 상세가 없으면 폭 0, 열리면 공유 폭 토큰을 06 §7 범위로 clamp하며 본문을 overlay·scrim·inert로 막지 않는다(ADR-0013, 06 §13).

## 검증

`pnpm --filter @ap/shell test`(경계 단위 테스트)로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`)에 더해 `pnpm dev`로 사이드바·레일·Context Bar·역할 전환 후 메뉴 노출을 직접 확인.
