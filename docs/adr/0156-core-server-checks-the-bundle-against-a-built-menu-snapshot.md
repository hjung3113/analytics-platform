# 코어 서버는 선언 묶음을 앱 빌드가 낸 메뉴 선언 스냅샷과 대조한다

상태: **Decided (2026-11-13)**
- 결정자: 소유자 위임 advisor — 2026-11-13 [#1900](https://github.com/hjung3113/analytics-platform/issues/1900) 판단(«변경해서 승인»). 소유자가 되돌릴 수 있다.
- Scope: [#1900](https://github.com/hjung3113/analytics-platform/issues/1900) 노드 1900a(대조와 기동 거부). 관련: [ADR-0146](0146-core-server-loads-in-house-declarations-from-deployment-config.md), [ADR-0096](0096-contract-schemas-zod-source-and-reference-implementations.md), [실서버 체크리스트](../integration/real-server-checklist.md) §3 «등록 검증».

## 맥락

- 사내 엔드포인트·동작 선언은 배포 설정의 선언 묶음(`MENU_DECLARATIONS_FILE`, ADR-0146)으로 코어 서버에 들어간다. 묶음의 엔드포인트 행은 메뉴의 `endpoints.ts` 선언을 손으로 옮긴 사본이다.
- mock 서버는 등록 때 메뉴 Registry를 보고 `menuId` 등록, 권한 선언, Scope 요구, 적용 Context를 검사한다(`createMockAdapter`). 코어 서버는 메뉴 Registry를 모르므로 이 검사를 할 수 없었다. 그래서 손 사본이 권한을 약하게 바꾸거나(H5), Scope 요구를 빠뜨리거나(H3), 없는 메뉴를 가리켜도(H1) 기동이 통과했다.
- 서버는 `@ap/*` SDK 런타임을 import하지 않는다(경계 규칙 11). 메뉴 선언은 파일로 넘겨야 한다.

## 결정

1. **앱 조립 빌드가 메뉴 선언 스냅샷을 낸다.** 실서버용 웹을 만드는 빌드(키트 `build:real`, `apps/platform-web`의 비-mock 빌드)가 같은 Registry 입력과 메뉴 `endpoints.ts`에서 `menu-declarations.snapshot.json`을 빌드 출력에 쓴다. 따로 돌리는 수동 명령이나 손 편집 경로는 없다. 만드는 코드는 `@ap/contracts`의 순수 방출기 `menuDeclarationSnapshot`과 Vite 플러그인 `menuDeclarationSnapshotPlugin` 하나이고 키트와 견본 앱이 같이 쓴다. 파일 모양은 `@ap/contract-schemas`의 `menuDeclarationSnapshotSchema`(JSON Schema `schemas/menuDeclarationSnapshot.json`)가 원천이다.
2. **스냅샷이 담는 것:** `schemaVersion`(1), SDK 버전, 메뉴(id·권한·`requiresScope`·적용/참조 Context), 앱 권한 어휘, 엔드포인트(`endpointDeclarationSchema` 그대로), 동작(id·`menuId`·`inputKeys`·권한·`requiresScope`·`concurrency`·`invalidates`), 나머지 전체의 정규 JSON에 대한 `sha256` digest. 행은 id 순, id는 유일하다.
3. **서버 규칙:** `MENU_DECLARATIONS_FILE`이 있으면 `MENU_DECLARATIONS_SNAPSHOT_FILE`이 필수이고 끄는 설정은 없다. 파일이 없거나, 못 읽거나, JSON이 아니거나, 스키마에 맞지 않거나, 모르는 `schemaVersion`이거나, digest가 내용과 다르면 기동을 거부한다. 프로그램 조립(`declaredContribution`)도 스냅샷을 받아 같은 규칙을 지킨다.
4. **대조:** 묶음의 엔드포인트·동작은 스냅샷에 있어야 한다(묶음 ⊆ 스냅샷, 스냅샷에만 있는 행은 괜찮다). 메뉴 소유 필드는 **완전 일치**여야 한다. 엔드포인트는 `menuId`·`paramKeys`·`permission`·`requiresScope`·`context`·`requiredContext`·`kinds`·`mergeTimeDomain`, 동작은 `menuId`·`inputKeys`·`permission`·`requiresScope`·`concurrency`·`invalidates`. 목록 필드는 순서를 보지 않는다. 권한에는 강약 순서가 없어 «더 약하지 않음»은 판정할 수 없으므로 같아야 한다. 여기에 mock 등록 규칙을 더한다: `menuId`가 스냅샷 메뉴에 있음, 권한이 스냅샷 어휘·메뉴 권한·커널 권한 중 하나, 메뉴가 Scope를 요구하면 엔드포인트·동작도 요구, 메뉴가 적용하지 않는 Context를 적용하지 않음, 동작의 `invalidates`는 같은 메뉴의 엔드포인트. 어긋남 하나가 문제 한 줄이고, 그 줄은 엔드포인트·동작 id, 필드, 묶음 값, 메뉴 선언 값을 적는다. 묶음 자체의 문제와 한 번에 보고한다.
5. **대조하지 않는 것(배포 소유):** `paramTypes`·`limits`·소유자 표(`endpointOwners`)·`targets`·`scopeCatalog`·권한→capability 행. 메뉴 선언에 없다.
6. **서버의 스키마는 로컬 사본이다.** 서버 menu-dispatch 모듈은 로컬 zod 사본을 쓰고, 시험(`menu-snapshot.test.ts`)이 필드·중첩·필수 집합과 판정 결과를 `@ap/contract-schemas` 원천에 고정한다(`SITE_BOUND_KEYS`와 같은 방식).
7. **공개 시험은 합성 스냅샷만 쓴다**(ADR-0146 결정 6).

## 신뢰 한계

서버는 두 파일의 출처를 증명하지 못한다. 묶음과 스냅샷 모두 운영자가 놓는 파일이다. 이 검사가 막는 것은 손 사본의 실수와 어긋남이고, 악의적인 운영자는 막지 못한다. digest는 빌드 뒤 스냅샷을 손으로 고친 것을 잡지만, 다시 계산한 digest까지 맞춘 편집은 잡지 못한다.

## Considered Options

- **(A, 채택) 빌드가 낸 스냅샷과 대조.** 메뉴 선언의 원천이 한 곳(메뉴 코드)이고, 서버는 `@ap/*`를 import하지 않는다.
- **(B) 묶음을 통째로 빌드에서 생성.** 기각: 소유자 표·대상·Scope 카탈로그·capability 대응은 배포 소유라 메뉴 선언에서 나오지 않고, 생성된 파일을 나중에 손으로 고쳐도 서버가 알 수 없다.
- **(C) 서버가 메뉴 코드를 직접 읽음.** 기각: 경계 규칙 11과 ADR-0146 결정 1(코드가 아니라 선언).
- **방출기 위치:** 과제는 `@ap/contract-schemas`를 권했지만, 시작 키트는 릴리스 tarball 아홉 개만 설치하고 플랫폼 소스 사본을 가질 수 없다(`sdk-kit.mjs`). contract-schemas는 그 아홉에 없다(#531 Deferred). 그래서 순수 방출기와 플러그인은 두 조립이 모두 설치하는 `@ap/contracts`에 두고, zod 스키마·JSON Schema는 contract-schemas에 둔다. contract-schemas 시험이 방출기 출력을 스키마로 검증한다.

## Deferred (구현 안 함)

- **묶음 행을 스냅샷에서 채움(노드 1900b).** 묶음 엔드포인트 행은 `{ id }`(+`paramTypes`)만 써도 되고 메뉴 소유 필드는 스냅샷에서 채운다. 적혀 있으면 완전 일치해야 한다. 이유: 이 노드는 대조와 기동 거부만 맡는다. 다시 여는 조건: 같은 릴리스의 다음 노드(1900b). 그래도 밀리면 «첫 사내 실서버 파일럿 묶음을 쓰기 전». 서버의 `menuOwnedEndpoint`가 «엔드포인트 X의 메뉴 소유 필드»를 답하는 한 곳이다. 지금 묶음에서 빠진 선택 필드(`requiredContext`·`kinds`)는 오늘의 런타임 의미(빈 목록)로 대조한다.
- **배포된 웹과 스냅샷의 일치(`X-Platform-Declarations`).** ADR-0146 Deferred 그대로다. 스냅샷 digest가 있어 나중에 켤 수 있다. 다시 여는 조건: 헤더를 켜는 계약 결정.

## 결과

- 사내 배포 절차에 스냅샷 파일 1개와 설정 1개(`MENU_DECLARATIONS_SNAPSHOT_FILE`)가 늘어난다([사내 도입 절차](../integration/in-house-rollout.md)).
- 손 사본이 메뉴 선언과 어긋난 묶음은 기동하지 않는다. 문제 줄이 어느 행의 어느 필드인지 알려 준다.
