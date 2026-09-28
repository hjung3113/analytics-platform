# @ap/kernel

Platform Kernel 런타임(06 §4). 메뉴 목록도, 서버 구현도 모른다. 둘 다 앱이 주입한다.

## 파일

- `registry.ts` — `createRegistry({ groups, menus })`: §5 검증(id·그룹 중복, parent 존재·파라미터 없는 경로, 선언 그룹, 그룹별 primary 1개, `pageKeys`×전역 키, `contextResetKeys`⊆`pageKeys`, 경로 정규형 충돌)과 정적 세그먼트 우선 매칭. 반환 Registry가 `matchRoute`·`safeReturnTo`를 제공하고 `pathFor(menu, params)`가 경로를 만든다. `MenuEntry = MenuMeta & { icon, component? }`.
- `platform.tsx` — `PlatformProvider adapter registry slots`, `usePlatform()`(전역 Context 읽기·`setGlobal`·`pageParam`·`setPage`·`linkTo`·Scope 상태·즐겨찾기/최근), `PlatformLink`. 슬롯은 `contextBar`, `topBarTools`(06 §8). `setGlobal`·`resetContext`는 전역 Context가 실제로 바뀔 때 현재 메뉴 manifest의 `contextResetKeys`를 같은 내비게이션에서 지운다(히스토리 항목 1개, 뒤로 가면 이전 URL 그대로 복원). popstate·`navigate`는 아무것도 지우지 않는다. 메뉴 활용률은 `platform:usage` 카운터가 아니라 `adapter.recordUsage` 이벤트(entry/dwell)로 보낸다 — recent·즐겨찾기·lastScope은 그대로 유지된다.
- `query.ts` — `usePlatformQuery`(페이지 데이터): 식별자 `[revision, user.id, global, pageInputs]`가 바뀌면 이전 결과를 숨긴다. 4번째 인수 `identity: 'session'`은 전역 Context를 식별자에서 뺀다(기간·조건 변경이 재조회·숨김을 유발하지 않음). `useEntityQuery(ref, pageInputs, enabled)`는 이 'session' 식별자로 `adapter.getEntity`(§22 목적지 단건 조회)를 호출한다 — ref·revision·사용자가 바뀔 때만 이전 결과를 숨긴다. `useAdapterRequest(run, key, enabled)`(셸의 어댑터 조회, `retry` 포함): 식별자는 `[revision, user.id, key]`뿐이라 전역 Context를 자동 추적하지 않는다 — 요청이 의존하는 값은 호출자가 전부 `key`에 넣는다.
- `i18n.tsx` — `I18nProvider`, `useI18n()`(`tx`, `lang`). `metric-init.ts` — 지표 쌍 초기화 분류.

## 규칙

- import 가능: `@ap/contracts`와 React·아이콘 라이브러리. `ui`/`components`/`shell`/앱/mock import 금지.
- 서버·세션 접근은 `adapter`로만. 세션은 동기 snapshot + `subscribe`; 변경 알림을 받으면 revision을 올려 이전 결과를 숨긴다. 이 무효화 계약은 `adapter.test.tsx`가 고정하므로 바꾸면 테스트부터 고친다.
- Registry 검증 규칙을 바꾸면 `registry.test.ts`에 실패 사례를 추가한다. 테스트는 fixture Registry만 쓰고 실제 메뉴를 import하지 않는다(실제 메뉴가 필요한 테스트는 앱 통합 테스트).
- 전역 Context 키·URL 규칙은 06 §6 계약이다. 메뉴 요구 때문에 바꾸지 말고 플랫폼 결정으로 올린다.
- 새 슬롯은 06 §8 Shell Slot에 근거가 있을 때만 `PlatformSlots`에 추가한다.

## 검증

`pnpm --filter @ap/kernel test`로 먼저 좁혀 본 뒤 루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`)(앱 통합 테스트가 Registry·URL을 실제 메뉴로 검증).
