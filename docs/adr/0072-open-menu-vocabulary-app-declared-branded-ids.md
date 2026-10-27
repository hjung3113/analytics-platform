# ADR-0072 — `@ap/contracts`는 견본 메뉴 어휘를 닫힌 목록으로 갖지 않는다: 그룹·공간·메뉴 권한은 브랜드 문자열이고 목록은 앱이 선언하며 Registry가 런타임에 검증한다

- Status: Decided (2026-10-23), implemented in [#671](https://github.com/hjung3113/analytics-platform/issues/671) B9.
- Decider: 사용자 — [#670](https://github.com/hjung3113/analytics-platform/issues/670) D1의 추천(브랜드 문자열 + Registry 런타임 검증, 닫힌 목록은 앱이 선언, Kernel 고유 권한만 contracts)을 그대로 채택했다(2026-10-23).
- Scope: 2026-10-22 전체 리뷰(아키텍처) 후속. 관련: [ADR-0053](0053-host-module-contract-v1.md) G1(모듈 어휘는 이미 열린 `<moduleId>:` 문자열), [#428](https://github.com/hjung3113/analytics-platform/issues/428)(외부 확장 계약).
- Amends: ADR-0053 G1의 "플랫폼 고유 `PERMISSIONS`·`GroupId`·`SpaceId` 목록은 그대로 둔다".

## 맥락

`packages/contracts/src/menu/menu.ts`가 이 저장소의 견본 메뉴 목록을 SDK 타입으로 갖고 있다.

- `GroupId`: 16개 닫힌 union(`overview`·`myActivity`·`equipment` … `impReports`)과 그 런타임 사본 `GROUP_ID_SET`/`GROUP_IDS`.
- `SpaceId`: 6개 닫힌 union(`analytics`·`metrics`·`clas`·`operations`·`log-dev`·`improvement`).
- `PERMISSIONS`/`Permission`: 9개. 견본 메뉴 권한(`equipment:view`·`master:view`·`analytics:view`·`metrics:view`)과 플랫폼 자기 기능 권한이 섞여 있다.

그래서 메뉴 그룹이나 업무 시스템을 하나 더할 때마다 SDK 계약 패키지가 바뀐다(#650의 `myActivity`가 그런 변경이다). `tooling/gen-menu`도 새 그룹을 만들 때 contracts `menu.ts`의 union과 `GROUP_ID_SET`을 고친다. 하지만 이 저장소의 메뉴는 견본이고, 실제 메뉴는 사내에서 만든다(루트 AGENTS "이 레포의 목적"). 사내 앱이 그룹 하나를 더하려고 SDK 판을 올려야 하는 구조는 "SDK ← 제품" 방향([ADR-0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md))과 맞지 않는다. 런타임 판정은 이미 `createRegistry`가 한다. 선언된 공간·그룹·권한·모듈 접두사를 검사하고 위반하면 `RegistryError`를 던진다.

## 결정

1. **`GroupId`·`SpaceId`·메뉴 `Permission`은 브랜드 문자열이다.** contracts는 모양(브랜드 타입, 비어 있지 않은 문자열)만 정하고 값 목록을 갖지 않는다. `GROUP_ID_SET`·`GROUP_IDS`는 없앤다.
2. **닫힌 목록은 앱이 선언한다.** 공간·그룹은 지금처럼 `apps/platform-web/src/menus.ts`(`SPACES`·`GROUPS`)가, 메뉴 권한은 각 메뉴 manifest와 앱 조립이 선언한다. 앱은 자기 선언에서 좁은 타입을 유도하는 typed helper(이름 Candidate)를 SDK에서 받아, 자기 코드에서 오타를 컴파일 시점에 잡을 수 있다.
3. **Registry가 런타임에 검증한다.** `createRegistry`는 앱이 넘긴 선언을 닫힌 목록으로 보고 지금과 같이 fail closed로 거부한다. 선언되지 않은 공간·그룹, 선언되지 않은 권한, 플랫폼 권한 네임스페이스를 쓰는 모듈 id 모두 `RegistryError`다. 예약 네임스페이스는 Kernel 고유 권한과 앱이 선언한 권한의 `:` 앞부분이다.
4. **contracts에는 Kernel 고유 권한만 남는다.** 기준: 어떤 앱을 조립하든 플랫폼 자기 기능이 판정에 쓰는 권한. 지금 목록으로는 `platform:view`(로그인 사용자 기본·전역 화면), `console:access`(운영 콘솔, `@ap/server-conformance`의 콘솔 조회 검사가 쓴다), 그리고 ADR-0066 결정 2가 플랫폼 전역 기능으로 둔 `notice:view`·`voc:view`, FeedbackOps 진입의 `feedbackops:access`다. 견본 메뉴 권한 `equipment:view`·`master:view`·`analytics:view`·`metrics:view`는 앱으로 간다. 구현 때 이 기준으로 목록을 다시 확인한다.
5. **`FeedbackOpsEntryId`(`packages/kernel/src/platform.tsx`, `'voc-create' | 'voc' | 'task' | 'survey'`)는 슬롯 데이터로 옮긴다.** 셸이 id로 아이콘을 고르는 대신, 앱이 `FeedbackOpsSlot` 항목에 아이콘을 함께 넘긴다.
6. `ContextKey`·`Capability`·`PageType`처럼 Kernel이 의미를 소유하는 어휘는 닫힌 목록으로 둔다. 이 결정의 대상이 아니다.

## Considered Options

- **(A) 닫힌 union 유지**: 오타를 컴파일 시점에 SDK가 잡는다. 대신 사내 앱이 그룹·공간·권한 하나를 더할 때마다 SDK를 고쳐 다시 내야 한다. 견본 메뉴 목록이 SDK 공개 API(`sdk-api` 스냅샷)에 남는다.
- **(B, 채택) 브랜드 문자열 + Registry 런타임 검증**: SDK는 모양만 정하고 목록은 앱 것이 된다. ADR-0053이 모듈 어휘에 이미 쓴 방식(열린 문자열 + Registry 판정)과 같다. 오타 검출은 Registry 검증과 앱이 자기 선언에서 유도한 타입으로 옮긴다. 브랜드라서 아무 `string`이나 그대로 넣을 수는 없다.
- **(C) 브랜드 없는 일반 `string`**: 가장 단순하다. 하지만 그룹 id 자리에 공간 id나 권한 문자열을 넣어도 타입 검사가 통과하고, 앱이 자기 타입을 유도할 손잡이도 없다. 실수가 모두 런타임까지 간다.

## 결과

- SDK 깨지는 변경이다. `GroupId`·`SpaceId`·`Permission`의 값 목록과 `GROUP_IDS`가 공개 API에서 빠지고, `sdk-api` 스냅샷과 다음 `sdk-v*` 릴리스 노트가 이를 적는다(ADR-0044: 깨지는 변경은 폐기 예고 한 릴리스 이상).
- `tooling/gen-menu`는 contracts `menu.ts`를 더 이상 고치지 않는다. 그룹 존재 확인은 앱 선언(`menus.ts`의 `GROUPS`)을 읽는다. `probe-support`·`repo-invariants`의 contracts 편집도 함께 바뀐다.
- 오타 안전은 컴파일 시점(SDK union)에서 Registry 검증 + 앱이 자기 선언에서 유도한 타입으로 옮긴다. Registry 단위 테스트가 선언되지 않은 그룹·공간·권한 거부를 고정한다.
- mock 서버의 권한 목록(`world.ts`·`access.ts`의 `PERMISSIONS` 사용)과 콘솔 필터는 앱 조립이 넘긴 목록을 쓴다. FeedbackOps Capability 대응표의 계약 테스트([합류 설계](../integration/feedbackops-merge-design.md) §5)는 contracts 고정 목록 대신 Kernel 고유 권한 + 앱 선언 목록과 묶는다.
- 소유 문서 갱신은 구현 PR에서 한다: [패키지 경계](../integration/platform-packages.md) §3의 `@ap/contracts` 행과 규칙 7, [06](../contract/kernel.md) §5.
