# @ap/kernel

Platform Kernel 런타임(06 §4). 메뉴 목록도, 서버 구현도 모른다. 둘 다 앱이 주입한다.

## 파일

- `registry.ts` — `createRegistry({ spaces, groups, menus })`: §5 검증(id·그룹 중복, parent 존재·파라미터 없는 경로, 선언 그룹, 그룹별 primary 1개, `pageKeys`×전역 키, `contextResetKeys`⊆`pageKeys`, `drill` 1–4단계·키 중복·`pageKeys`·`contextResetKeys`·`returnTo` 금지 — 06 §6.4, 경로 정규형 충돌, 공간 `space`·`homeMenuId`·비어 있지 않은 `description` — 06 §9.1)과 정적 세그먼트 우선 매칭. `GroupDef`는 `id`·`label`·`icon`·`space`(`space: null`이면 전역 유틸리티)와 선택적 사이드바 표시 선언 `hideLabelWhenSingle`을 가진다. 반환 Registry가 `matchRoute`·`safeReturnTo`를 제공하고 `pathFor(menu, params)`가 경로를 만든다. `MenuEntry = MenuMeta & { icon, component? }`.
- `platform.tsx` — `PlatformProvider adapter registry slots`(슬롯 `contextBar`·`topBarTools`·`feedbackOps`, 06 §8)와 `usePlatform()`: 전역 Context(`setGlobal`·`resetContext` — 실제로 바뀌면 현재 메뉴의 `contextResetKeys`를 같은 내비게이션에서 지운다, 06 §6.4)·`pageParam`/`setPage`·`linkTo`/`resolveLink`(06 §22)·`spaceResume`/`switchSpace`(공간별 마지막 화면, `sessionStorage` `platform:space-last:${userId}`, 06 §9.1. 복원 경로에 디코딩 뒤 `.`·`..` 세그먼트가 있으면 버리고, 재구성 href를 정규화해 다시 매칭한 메뉴·params가 같을 때만 쓴다)·`returnTarget`/`returnOrigin`(채택된 `returnTo`의 메뉴 이름과 연속 드릴 값, 없으면 parent 아니면 home)·Scope 상태(`scope`·`retryScope`, 세션이 바뀐 프레임은 Provider가 가린다)·즐겨찾기/최근·`reportError`. `reportError`는 식별 필드만 어댑터로 보낸다 — `Error.message`·URL·Context 값은 금지. 활용률은 `adapter.recordUsage`(entry/dwell). 동작은 `adapter.test.tsx`·`platform.*.test.tsx`가 고정하므로 바꾸면 테스트부터 고친다.
- `drill.ts` — `useDrill()`: 현재 메뉴 `drill.levels`의 page 값을 `depth`·`trail`·`invalid`로 읽고, `enter`/`goTo`는 `setPage` 한 번(push)으로 그 단계 뒤 키를 지운다(06 §6.4, ADR-0025). 단계 이동은 활용률 계측에 넣지 않는다.
- `query.ts` — `usePlatformQuery`(식별자 `[revision, user.id, global, pageInputs]`, `identity: 'session'`이면 전역 Context 제외), `useEntityQuery`(§22 목적지 `adapter.getEntity`), `useMenuQuery`/`useMenuFetch`(메뉴 `EndpointSpec` → `adapter.menuQuery`; Scope·기간 게이트와 assessments kind 검사 포함, `ready` 전 호출은 `not_ready` error), `useAdapterRequest`(셸 조회, 식별자 `[revision, user.id, key]` — 의존 값은 호출자가 `key`에 전부 넣는다). 취소는 Kernel 자신의 `signal.aborted`로만 판정하고 어댑터 타임아웃 `AbortError`는 오류다. 판정 규칙의 원본은 06 §19·[체크리스트 §3](../../docs/integration/real-server-checklist.md)이고 `menu-query.test.tsx`가 고정한다.
- `i18n.tsx` — `I18nProvider`, `useI18n()`(`tx`, `lang`). `metric-init.ts` — 지표 쌍 초기화 분류.

## 규칙

- import 가능: `@ap/contracts`와 React·아이콘 라이브러리. `ui`/`components`/`shell`/앱/mock import 금지.
- 서버·세션 접근은 `adapter`로만. 세션은 동기 snapshot + `subscribe`; 변경 알림을 받으면 revision을 올려 이전 결과를 숨긴다. 이 무효화 계약은 `adapter.test.tsx`가 고정하므로 바꾸면 테스트부터 고친다.
- Registry 검증 규칙을 바꾸면 `registry.test.ts`에 실패 사례를 추가한다. 테스트는 fixture Registry만 쓰고 실제 메뉴를 import하지 않는다(실제 메뉴가 필요한 테스트는 앱 통합 테스트).
- 전역 Context 키·URL 규칙은 06 §6 계약이다. 메뉴 요구 때문에 바꾸지 말고 플랫폼 결정으로 올린다.
- 새 슬롯은 06 §8 Shell Slot에 근거가 있을 때만 `PlatformSlots`에 추가한다.

## 검증

`pnpm --filter @ap/kernel test`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`)(앱 통합 테스트가 Registry·URL을 실제 메뉴로 검증).
