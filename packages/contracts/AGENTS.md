# @ap/contracts

플랫폼과 서버·메뉴가 공유하는 계약 타입과 순수 함수. 향후 백엔드와 공유할 수 있게 런타임 환경 의존을 두지 않는다.

## 파일

- `query-history.ts` — 적용 이력 저장 포트·항목·키와 결정적 정렬/id. 저장소가 병합·횟수·시각·20건 보존을 소유한다(06 §11).
- `url.ts` — 전역 Context URL codec(`parseQuery`, `buildQuery`, `isAppRelativePath` 등). 06 §6 URL 계약의 구현.
- `feedbackops-link.ts` — FeedbackOps ↔ 플랫폼 딥링크 codec. 원본은 [통합 계약](../../docs/integration/feedbackops-deeplink.md)이며 이 파일은 구현이다.
- `menu.ts` — `MenuMeta`(manifest 선언부), `ContextKey`, `Capability`, `PageType`, 브랜드 id `GroupId`·`SpaceId`·`MenuPermission`(비공개 brand 심볼, 값 목록 없음)과 항등 캐스트 생성자 `groupId`·`spaceId`·`menuPermission`(리터럴을 유지해 앱이 자기 선언에서 좁은 타입을 얻는다. 모양 검사는 생성자가 아니라 `createRegistry`가 한다), Kernel 고유 권한 목록 `KERNEL_PERMISSIONS`와 `Permission = KernelPermission | MenuPermission`(ADR-0072: 그룹·공간·메뉴 권한의 값 목록은 앱이 선언하고 이 패키지는 갖지 않는다. 앱이 조립 파일에서 `createRegistry({ permissions })`로 선언하고 `registry.permissions`가 검증기·선택지가 공유하는 유일한 런타임 목록이다). manifest 기본값 `contextCapabilities(declared?)`(선언하지 않은 키는 모두 `unsupported`, 호출마다 새 객체)와 `NO_FEATURES`(모든 기능 꺼짐)는 메뉴 index와 `gen-menu` 템플릿이 함께 쓴다(#673).
- `menu-query.ts` — 메뉴 조회 엔드포인트 선언 `EndpointSpec`·`AnyEndpointSpec`·`defineEndpoint`, 전송 요청 `MenuQuery`, 선언 기반 Context 투영 `projectContext`. 결정은 [ADR-0019](../../docs/adr/0019-menu-query-endpoint-declaration.md), 서버 판정 순서는 [체크리스트 §3](../../docs/integration/real-server-checklist.md)(필드명은 Candidate).
- `menu.ts`의 `ConditionPreset`·`MenuMeta.conditionPresets`·`conditionPreset`과 `menu-query.ts`의 순수 `narrowCondition(condition, axes)`(남는 축이 없으면 `null`, `{}` 아님) — Condition 프리셋은 메뉴 조회의 투영만 좁히고 전역 Condition·URL은 그대로 둔다([ADR-0083](../../docs/adr/0083-condition-presets.md), 06 §6.4). `projectContext`는 그대로 순수하며 좁힌 `g`를 받는다. 동작 테스트는 `apps/platform-web/src/menu-query-contract.test.ts`.
- `action.ts` — 메뉴 쓰기 동작 선언 `ActionSpec`·`AnyActionSpec`·`defineAction`, 전송 요청 `MenuAction`, 쓰기 전용 답 `ActionResponse`·`ActionOutcome`·`FieldError`(`ApiResponse`를 넓히지 않는다). 결정은 [ADR-0054](../../docs/adr/0054-write-port-declared-actions-idempotency-version.md), 서버 판정 순서는 [체크리스트 §3](../../docs/integration/real-server-checklist.md).
- `paging.ts` — 서버 페이징 모양 `PageQuery`(`page` 0부터)·`PageResult`·`sortRows`(첫 정렬 키로 정렬만, 자르지 않음 — 내보내기 mock 핸들러 3곳, #173)·`sortAndPage`(`sortRows` + 자르기, mock 핸들러가 쓴다). `@ap/components`가 같은 이름으로 재export한다(06 §15, #128).
- `period.ts` — wall-clock 기간 계산 `periodHours`·`bucketStart`·`Grain`(화면과 서버가 함께 쓴다, 06 §6.3, #127). `@ap/mock-server`가 같은 이름으로 재export한다.
- `instant.ts` — 실제 시점(epoch ms·offset 포함 ISO) 표시 `formatInstant`·`instantEpochMs`. wall-clock(`url.ts`의 `formatDateTime`)과 섞지 않는다(06 §6.3).
- `response.ts` — 응답·Trust envelope(`ApiResponse`, `Trust`, `Assessment`, `Outcome`). 06 §18–19.
- `host.ts` — 호스트 → 모듈 계약 1판([ADR-0053](../../docs/adr/0053-host-module-contract-v1.md)): `ModuleManifest`·`ModuleScreenMeta`·`ModuleHost`·`ModuleScreenProps`·`ModuleTarget`·`ModuleStatus`, 열린 어휘 `ModuleScopedId`(`<moduleId>:<name>`), 받아들일 버전 `HOST_CONTRACTS`, 선택 기능 `HostFeature`(`query`·`detailSlot`·`write` — `write`는 `host.act`와 `ActionResult`, ADR-0054). 노드·요소는 `unknown`이다. `SessionUser.permissions`만 `ModuleScopedId`를 함께 받는다(`Permission`·`GroupId`·`SpaceId`는 `menu.ts`의 브랜드 id, ADR-0072).
- `adapter.ts` — `PlatformAdapter` 포트와 입출력 타입. 설계는 [패키지 경계](../../docs/integration/platform-packages.md) §4.
- `correlation.ts` — `clientCorrelationId()`: 클라이언트가 만드는 `client-…` 상관 ID(오류 화면·클라이언트 오류 보고). 형식 제약은 파일 주석.
- `guards.ts` — `isRecord`(null·배열이 아닌 객체, 프로토타입은 보지 않음): 신뢰할 수 없는 값(저장 JSON·서버 응답)의 필드를 읽기 전 모양 검사 한 벌(#673). `@ap/ui`는 `@ap/*`를 import하지 않으므로 sanitizer 사본을 유지하고, mock-server의 `isPlainObject`(프로토타입 검사)는 다른 판정이다.
- `audit.ts`, `i18n.ts` — `AuditEvent`·`AUDIT_ACTIONS`, `Text`.
- `vocab.json` — 생성 산출물(#674): 저장소 밖·다른 도구 체인의 서버가 따라야 하는 닫힌 어휘(`kernelPermissions`·`USAGE_VIAS`·`AUDIT_ACTIONS`·`OUTCOMES`; 앱의 공간·메뉴 권한은 서버가 모른다, ADR-0072). `@ap/contracts/vocab.json`으로 내보낸다. 원본은 각 `as const` 목록이고 `pnpm --filter @ap/contracts gen:vocab`(`scripts/vocab.mjs`)이 만든다. `test`가 최신인지 확인한다. 소비처: FeedbackOps 백엔드 어휘 drift 테스트.
- `globals.d.ts` — DOM lib 없이 쓰는 최소 `URLSearchParams`·`URL`·`AbortSignal`·`crypto` 선언.

## 규칙

- import 금지: React, DOM 타입, Node API, 다른 `@ap/*` 패키지, 외부 런타임 라이브러리.
- 필드 추가·이름 변경은 계약 변경이다. 소비처(kernel, shell, 앱 mock 구현)를 같은 PR에서 맞추고, 06이나 패키지 경계 문서에 반영할 결정인지 먼저 판단한다. 필드 이름 대부분은 Candidate다.
- 이 패키지에는 자체 동작 테스트가 없다(`test`는 `vocab.json`이 최신인지만 본다 — 어휘 목록을 바꾸면 `gen:vocab`을 돌려 함께 커밋한다). 계약 테스트는 앱 통합 테스트 `apps/platform-web/src/{url-contract,feedbackops-link,instant,menu-query-contract,contracts-helpers}.test.ts`이므로 codec·선언을 바꾸면 함께 갱신한다. 배포 산출물과 소비자 환경 규칙은 [패키지 경계 §3](../../docs/integration/platform-packages.md#3-패키지-구성)이 소유하고 `check:pack`이 확인한다. URL은 보정 없이 오류로 거부한다(06 §6).
- `PlatformAdapter`에 메서드를 추가하면 `pnpm typecheck`가 깨뜨리는 어댑터 구현(`@ap/kernel/testing`의 `testAdapter`, mock `packages/mock-server/src/adapter.ts`, `@ap/server-conformance` 테스트의 `referenceAdapter`)과 `@ap/server-conformance` 검사, [체크리스트 §2](../../docs/integration/real-server-checklist.md)·[전송 형식 초안 §1](../../docs/integration/http-adapter-contract.md) 표를 같은 PR에서 고친다.

## 검증

`lint`와 `typecheck`를 실행하고, `build` 뒤 `check:pack`으로 배포 묶음과 저장소 밖 소비자 검사를 확인한다. 배포 계약은 [패키지 경계 §3](../../docs/integration/platform-packages.md#3-패키지-구성)을 따른다. 루트 검사 범위는 루트 `AGENTS.md`를 따른다.
