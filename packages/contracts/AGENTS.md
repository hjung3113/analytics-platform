# @ap/contracts

플랫폼과 서버·메뉴가 공유하는 계약 타입과 순수 함수. 향후 백엔드와 공유할 수 있게 런타임 환경 의존을 두지 않는다.

## 파일

- `url.ts` — 전역 Context URL codec(`parseQuery`, `buildQuery`, `isAppRelativePath` 등). 06 §6 URL 계약의 구현.
- `feedbackops-link.ts` — FeedbackOps ↔ 플랫폼 딥링크 codec. 원본은 [통합 계약](../../docs/integration/feedbackops-deeplink.md)이며 이 파일은 구현이다.
- `menu.ts` — `MenuMeta`(manifest 선언부), `ContextKey`, `Capability`, `PageType`, `Permission`과 그 런타임 목록 `PERMISSIONS`(검증기·선택지가 공유하는 유일한 값 목록, #49).
- `menu-query.ts` — 메뉴 조회 엔드포인트 선언 `EndpointSpec`·`AnyEndpointSpec`·`defineEndpoint`, 전송 요청 `MenuQuery`, 선언 기반 Context 투영 `projectContext`. 결정은 [ADR-0019](../../docs/adr/0019-menu-query-endpoint-declaration.md), 서버 판정 순서는 [체크리스트 §3](../../docs/integration/real-server-checklist.md)(필드명은 Candidate).
- `paging.ts` — 서버 페이징 모양 `PageQuery`(`page` 0부터)·`PageResult`·`sortRows`(첫 정렬 키로 정렬만, 자르지 않음 — 내보내기 mock 핸들러 3곳, #173)·`sortAndPage`(`sortRows` + 자르기, mock 핸들러가 쓴다). `@ap/components`가 같은 이름으로 재export한다(06 §15, #128).
- `period.ts` — wall-clock 기간 계산 `periodHours`·`bucketStart`·`Grain`(화면과 서버가 함께 쓴다, 06 §6.3, #127). `@ap/mock-server`가 같은 이름으로 재export한다.
- `instant.ts` — 실제 시점(epoch ms·offset 포함 ISO) 표시 `formatInstant`·`instantEpochMs`. wall-clock(`url.ts`의 `formatDateTime`)과 섞지 않는다(06 §6.3).
- `response.ts` — 응답·Trust envelope(`ApiResponse`, `Trust`, `Assessment`, `Outcome`). 06 §18–19.
- `adapter.ts` — `PlatformAdapter` 포트와 입출력 타입. 설계는 [패키지 경계](../../docs/integration/platform-packages.md) §4.
- `audit.ts`, `i18n.ts` — `AuditEvent`, `Text`.
- `globals.d.ts` — DOM lib 없이 쓰는 최소 `URLSearchParams`·`AbortSignal` 선언.

## 규칙

- import 금지: React, DOM 타입, Node API, 다른 `@ap/*` 패키지, 외부 런타임 라이브러리.
- 필드 추가·이름 변경은 계약 변경이다. 소비처(kernel, shell, 앱 mock 구현)를 같은 PR에서 맞추고, 06이나 패키지 경계 문서에 반영할 결정인지 먼저 판단한다. 필드 이름 대부분은 Candidate다.
- 이 패키지는 자체 테스트가 없다. 계약 테스트는 앱 통합 테스트 `apps/platform-web/src/{url-contract,feedbackops-link,instant,menu-query-contract}.test.ts`이므로 codec·선언을 바꾸면 함께 갱신한다. URL은 보정 없이 오류로 거부한다(06 §6).
- `PlatformAdapter`에 메서드를 추가하면 `pnpm typecheck`가 깨뜨리는 모든 어댑터 fixture(mock `packages/mock-server/src/adapter.ts`와 각 패키지 테스트의 fixture)와 `@ap/server-conformance` 검사, [체크리스트 §2](../../docs/integration/real-server-checklist.md)·[전송 형식 초안 §1](../../docs/integration/http-adapter-contract.md) 표를 같은 PR에서 고친다.

## 검증

`pnpm --filter @ap/contracts typecheck`로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`).
