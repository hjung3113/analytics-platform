# SDK 외부 확장 계약 — 모듈 엔드포인트 권한(#492)과 새 시스템·메뉴 기여(#428)

상태: **보류 — #428은 구현하지 않는다**(소유자 결정 2026-11-10). 이유: 여러 개발자가 이 저장소에서 개발하는 전제라 저장소 밖 패키지의 시스템 등록과 메뉴 기여가 아직 필요하지 않다. 다시 여는 조건: 저장소 밖 패키지(현재 EV 외의 소비자, 또는 EV가 최신 SDK로 올리는 시점)가 이 확장을 실제로 필요로 할 때. #492는 범위를 줄여 «모듈도 `menuPermission`을 쓴다»는 한 문장만 [kernel §5](../contract/kernel.md)에 명시했다(타입·호출 때 검사 없음). §5의 실서버 모듈 권한 부여 경로(P5)는 [#1087](https://github.com/hjung3113/analytics-platform/issues/1087)로 옮겼고, §9의 질문은 더 남지 않았다. 아래 본문은 다시 열 때의 근거 설계(Candidate)다.

읽은 결정: [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md)(원본은 이 저장소, SDK 따로 릴리스), [ADR-0053](../adr/0053-host-module-contract-v1.md), [ADR-0056](../adr/0056-sdk-release-github-release-tarballs.md)(Release tarball), [ADR-0072](../adr/0072-open-menu-vocabulary-app-declared-branded-ids.md)(열린 어휘), [#1207](https://github.com/hjung3113/analytics-platform/issues/1207) 소유자 결정(다른 저장소의 에이전트는 릴리스 tarball만 쓴다).

용어: «모듈»은 **호스트 모듈**(ADR-0053)이다. «시스템»은 화면 문구상 `업무 시스템`(코드 이름 `Space`/`SpaceDef`; GLOSSARY가 `공간`을 피하라고 하므로 «공간»은 코드 이름을 가리킬 때만 쓴다). 설비의 Module/Slot, 셸 슬롯과 겹치지 않도록 issue의 `targetSlot`은 «기여 지점»(보류된 후보명이라 GLOSSARY에는 넣지 않는다)으로 쓴다.

## 1. 요약

이 문서의 초판은 «타입 확장 + 호출 때 검사», «manifest 필드», «`contributors` 허용 목록»을 권고했다. 독립 리뷰(PR #1602 댓글, Opus high)와 코드 대조 결과 **세 권고가 모두 과했다.** 지금 권고는 훨씬 작다.

| # | 질문 | 권고 |
| --- | --- | --- |
| Q1 | #492: 모듈 엔드포인트·쓰기 권한 | **타입은 그대로.** 모듈은 `menuPermission('<모듈 id>:<이름>')`으로 적는다고 계약에 쓰고, 고정 모듈을 바꾸고, mock 등록 검사를 다듬는다. 호출 때 거부는 하지 않는다 |
| Q2 | #428: 새 시스템 | **패키지가 `SpaceDef`를 함께 export**하고 앱이 `spaces`에 합친다. Registry는 «홈이 모듈 메뉴이고 공간 권한이 그 모듈 접두사»일 때 공간 권한을 받아들인다. manifest 필드는 만들지 않는다 |
| Q3 | #428: 기존 시스템에 기여 | **지금 그대로.** 배치는 앱 조립의 결정이다. 허용 목록(`contributors`)은 만들지 않는다 |
| Q4 | 범위 | **한 PR로 축소**(§7) |
| Q5 | 파일럿 | 새 시스템 시험은 고정 모듈, 권한 확인은 EV(이미 마운트됨, 위치는 소유자가 정한 `tools`) |
| Q6 | 필드 이름 | manifest 필드를 **만들지 않으므로 이름은 보류.** 나중에 만들면 `providesSpace` + `HostFeature` `'moduleSpace'` |
| **P5** | 실서버에 모듈 권한을 주는 경로 | **출시 전 필수 선행 결정**(§5). 정하기 전에는 모듈 권한을 업무 시스템 진입 권한으로 쓰지 않는다 |

## 2. 이슈 주장 점검 (2026-11-10, 코드 기준)

### #492

| 이슈의 주장 | 지금 | 판정 |
| --- | --- | --- |
| `EndpointSpec.permission`이 닫힌 타입 | `Permission = KernelPermission \| MenuPermission`(브랜드 문자열). `menuPermission(id)`는 공개 항등 캐스트이고 모듈도 `@ap/contracts`를 import할 수 있다 | **우회로가 이미 있다.** EV 설치본(`@eqv/platform-adapter/dist/endpoints.js`)이 `menuPermission('eqv:view')`를 쓴다 |
| 고정 모듈이 `platform:view`로 우회 | `module-fixture/ListScreen.tsx`·`ItemScreen.tsx`가 아직 그렇다 | 유효. 고정 모듈만 낡았다 |
| 등록 때 검사 | 엔드포인트 spec은 `host.query` 호출 때 처음 보인다 | 이슈 주장 틀림 |
| 서버가 매 요청 재검사 | 서버 `authorize`가 판정하고 `spec.permission`은 요청에 실리지 않는다. 클라이언트의 어디에서도 `spec.permission`을 판정에 쓰지 않는다(`kernel/src/query`) | 유효 |
| 다시 열 조건: 첫 모듈이 자기 권한으로 조회 | 충족. EV가 이미 `eqv:view`로 선언한다 | 충족 |
| 쓰기도 같은 문제 | `ActionSpec.permission`도 같은 `Permission` | 같은 결정으로 묶는다 |

### #428

| 이슈의 주장 | 지금 | 판정 |
| --- | --- | --- |
| `SpaceId`·`GroupId`·`Permission`이 닫힌 목록 | ADR-0072로 브랜드 문자열, 목록은 앱이 선언 | 낡음 |
| `createRegistry` 검증은 재사용 가능 | `packages/sdk/kernel/src/registry/registry.ts` | 유효(경로만 바뀜) |
| 외부 시스템별 소유권·기여 허가 모델 없음 | 없다 | 유효 |
| `ModuleManifest`·`ModuleHost`와의 관계를 정한다 | 구현됨. `mountModule`이 `MenuEntry`·`GroupDef`를 만든다 | 낡음 |
| 정적 조립 | `apps/platform-web/src/menus.ts`가 앱 배열에 `modules.ts`의 `mountModule` 결과(EV)를 더한다 | 유효. 외부 패키지 조립 사례가 이미 있다 |
| 런타임 설치는 Deferred | 그대로 | 유효 |
| 새 시스템·기여 첫 파일럿 | EV는 앱이 정한 `tools` 업무 시스템에 그룹 하나를 낸다. #332는 2026-10-26 not planned로 닫혀 게이트가 아니다 | 낡음 |
| `defineSystem`·`defineMenuContribution`·`targetSlot` | 없음(후보 이름) | 후보 |

### 지금 되는 것과 진짜 빈 곳

되는 것: 패키지가 manifest+화면을 내고, 앱이 `mountModule`로 마운트하고, 그룹은 앱이 고른 업무 시스템에 들어간다. 패키지는 `const x: SpaceDef`를 export할 수 있고 앱은 `spaces: [...SPACES, x]` 한 줄로 받을 수 있다(`SpaceDef`·`spaceId`는 `@ap/contracts`에 있다). 모듈 권한·그룹은 `<모듈 id>:` 접두사로 격리된다.

진짜 빈 곳은 둘이다.

1. **Registry가 모듈 권한을 업무 시스템 진입 권한으로 받지 않는다.** `registry.ts`: 공간 권한은 Kernel·앱 선언만(`Space … is not a platform permission`), 홈 메뉴 권한은 공간 권한과 같아야 하고(`home permission must be`), 모듈 메뉴 권한이 플랫폼 권한이면 거부한다. 그래서 모듈이 홈인 업무 시스템에는 진입 권한을 걸 수 없다(`workspace-assembly.test.tsx`도 이를 적는다).
2. **실서버가 모듈 권한을 누구에게도 주지 않는다**(§5).

## 3. Q1 — #492 모듈 엔드포인트·쓰기 권한

- **채택(리뷰 수용): 타입을 넓히지 않는다.** 모듈은 `menuPermission('<모듈 id>:<이름>')`으로 적는다. 계약(kernel §)에 한 줄로 쓰고 고정 모듈 두 곳을 바꾼다.
- **넓히기를 기각한 이유(초판의 `Permission | ModuleScopedId`).** `ModuleScopedId`는 `` `${string}:${string}` ``이라 유니온에 넣으면 `'platform:veiw'`도 컴파일되고, 모든 메뉴에서 `Permission` 브랜드가 사실상 사라진다. ADR-0072가 일반 문자열안을 버린 이유(«실수가 모두 런타임까지 간다»)와 어긋나고, 맨 문자열이 퍼진 뒤 다시 좁히면 깨지는 변경이다. 또 스냅샷의 타입 줄이 모두 바뀌어 «기존 줄은 그대로»도 성립하지 않았다.
- **호출 때 거부를 기각한 이유.** `spec.permission`은 요청에 실리지 않고 클라이언트가 판정에 쓰지 않으며, 모듈이 자기 spec을 쓰므로 우회도 된다. 보안도 데이터 무결성도 아닌 «문서 필드 오기 검출»이라 루트 AGENTS의 SDK 제약 기준(보안·무결성·접근성)을 넘지 못한다.
- **실수 검출의 자리.** `mock-server/src/adapter.ts`의 등록 검사(`permissionDeclared`)다. 거기서 두 가지를 고친다: ① 어떤 메뉴의 진입 권한도 아닌 `<모듈>:edit` 같은 쓰기 권한을 거부하는 문제(마운트된 모듈 id의 접두사면 선언된 것으로 본다), ② 다른 모듈의 접두사를 쓰는 spec 거부.
- 적합성 검사는 이미 돈다. `server-conformance`가 EV 엔드포인트를 돌리고 `plan/endpoints.ts`가 `without eqv:view → forbidden`을 검사한다(mock 기준). 초판의 «확인 대상 없음»은 틀렸다. `apps/platform-api`에는 모듈 엔드포인트가 없다.
- `spec.menuId`가 자기 모듈 메뉴인지 확인하는 안은 같은 이유(보안이 아님)로 뺀다.

## 4. Q2·Q3 — #428 새 시스템과 기존 시스템 기여

### 4.1 새 시스템 (채택: `SpaceDef` 함께 export)

- 패키지는 manifest 옆에 `SpaceDef`를 export한다(`feedbackTracking`·`scopePresentation`을 포함한 모든 필드를 그대로 담는다). 앱은 `createRegistry({ spaces: [...SPACES, eqvSpace] })`로 합친다. 합치는 한 줄이 «이 시스템을 받겠다»는 동의다.
- 업무 시스템 id는 **패키지가 정하는 별도 값**이다. 초판의 «공간 id = 모듈 id»는 기각한다: 정규 경로가 `/{공간 id}/{메뉴 슬러그}`(ADR-0093)라 URL 뿌리와 서버가 주는 권한 네임스페이스를 따로 바꿀 수 없게 묶이고, 앱의 공간·예약 루트와 겹치면 패키지가 권한까지 개명해 다시 릴리스해야 한다. 충돌은 `createRegistry`가 이미 거부한다.
- **Registry 변경은 한 곳이다.** 공간 권한 검사를 «메뉴가 만들어진 뒤의 공간 반복»으로 옮겨, 홈이 모듈 메뉴이고 공간 권한이 `<그 모듈 id>:` 접두사이면 허용한다. `SpaceDef.permission` 타입은 그대로이고(`menuPermission` 캐스트), 그 한 줄의 주석(「공간 권한은 Kernel·앱 선언」)을 맞게 고친다. 홈 메뉴 권한 = 공간 권한 검사는 그대로다.
- 약점: 패키지가 `homeMenuId`를 `<모듈 id>:<화면 id>` 문자열로 직접 쓴다. 어긋나면 Registry가 시작 때 `is unknown`/`is not in that space`로 거부하므로 fail closed다.
- **Managed System 자동 등록은 합친 목록을 읽어야 한다.** 지금 `platform-systems.json`은 `buildPlatformSystemsFile(SPACES)`로 앱의 `SPACES`만 읽는다(`apps/platform-web/src/platform-systems.test.ts`). 패키지 공간을 `[...SPACES, x]`로 합치면 여기서 빠진다. 구현에서 생성기·테스트 입력을 합친 목록으로 바꾼다(ADR-0110 결정 5가 대상이며 본문은 이번에 읽지 못했다).

#### 보류한 안: manifest 필드

`ModuleManifest.providesSpace?` + `HostFeature 'moduleSpace'`는 «한 줄 절약, `homeScreen`→`homeMenuId` 변환» 정도를 얻는 대신 공개 필드·호스트 기능·`MountOptions.groupSpace` 부분화·`SpaceDef` 필드 동기화(새 필드가 생길 때마다 manifest에 넣을지 다시 정함)를 낳는다. 방향도 비대칭이다: 지금 안에서 필드로 가는 것은 더하기만으로 되지만 필드를 만든 뒤 없애는 것은 깨지는 변경이다. 다시 여는 조건: 같은 요구(패키지가 업무 시스템을 내놓는 것)가 외부 패키지 둘 이상에서 나올 때. 그때 이름은 `providesSpace`(내놓는다는 뜻이 `requires`와 나란히 읽힌다)이고 기능 이름은 `moduleSpace`(`moduleScreen`·`moduleFeatures`와 같은 꼴)이다. 필드가 있는데 `requires`에 `'moduleSpace'`가 없으면 `mountModule`이 `RegistryError`로 거부하고, 기본 `features`에 더한다. 초판의 `businessSystem`은 코드에 세 번째 이름을 만들고 GLOSSARY(코드 이름 `Space`)와 어긋나므로 쓰지 않는다.

### 4.2 기존 시스템에 메뉴 기여 (채택: 지금 그대로)

초판의 `SpaceDef.contributors`는 기각한다.

- 강제되지 않는 허가다. 정적 조립이라 앱이 `{ ...space, contributors: undefined }`로 지우거나 `SpaceDef`를 다시 쓸 수 있다. 앱이 선언한 공간에서는 자기 자신에게 거는 제약이고, 배치는 호스트(앱) 결정이다(`host.ts`).
- 실제 통제는 조립 파일(`modules.ts`) 리뷰와 서버 `authorize`다.
- 소유 모듈 자신, 모듈이 없는 플랫폼 그룹에 대한 규칙이 비어 있었고, 기여자를 더하려면 대상 패키지를 다시 릴리스해야 해 정확 버전 peer(ADR-0056)와 겹쳐 팀 간 릴리스가 묶인다.
- 다시 여는 조건: 조립자와 대상 업무 시스템 소유자가 다른 조립(런타임 설치·원격 로딩)이 생길 때.

이름 붙은 기여 지점(`targetSlot`)은 기여 메뉴가 대상의 기존 그룹 안에 들어가야 하므로 «그룹 id는 모듈 접두사» 불변식을 건드린다. 범용 조각은 ADR-0052를 따르므로 소비자 수가 아니라 이 불변식 때문에 미룬다. `defineSystem`은 `ModuleManifest`와 개념이 겹쳐 기각한다.

### 4.3 호환성과 외부 배포 (#1207)

- SDK 버전 호환은 ADR-0056의 정확 버전 peer와 `contract` 정수가 맡는다. 새 공개 타입이 없으므로 `sdk:api` 스냅샷이 바뀌는지는 구현 때 `pnpm sdk:api`로 확인한다(**미확인**).
- 저장소 밖 에이전트는 tarball만 쓴다. 이 변경은 Registry 동작(`@ap/kernel`)과 계약 문서뿐이라 tarball 모양은 그대로다. `sdk:consumer-check`에 «패키지가 `SpaceDef`를 export하고 앱이 합쳐 Registry를 만든다» 시험을 더하고, `ap-devkit` Catalog에 이 패턴 항목을 요청한다(devkit 구조는 바꾸지 않는다).

## 5. P5 — 실서버에 모듈 권한을 주는 경로 (출시 전 필수)

코드만 읽은 결과(실제 배포에서 확인하지 않았다):

- `apps/platform-api/src/modules/platform-port/permissions.ts`의 `resolvePlatformPermissions`는 `PLATFORM_PERMISSION_TABLE`만 돌려준다. 머리 주석이 «앱이 선언한 메뉴 권한은 나열하지 않는다, feature는 그중 어느 것도 주지 않는다»고 적는다. 메뉴 권한도 지금까지 행을 하나씩 더해 왔다.
- `apps/platform-api/src`(시험 제외)에서 `eqv`·`ModuleScopedId` 검색 결과가 없다.
- 따라서 실서버에서 `eqv:view`를 받는 사람이 없다. `PlatformProvider`는 진입 불가 업무 시스템을 걸러내므로, 모듈 권한을 건 업무 시스템은 **경고 없이 모두에게 사라진다.** 모듈 메뉴도 같다.
- 고정 모듈과 mock 파일럿은 이를 드러내지 못한다. mock 조립의 `modulePermissions(registry)`가 mock 역할 어휘에만 모듈 권한을 더하기 때문이다.

선택지(이 설계는 고르지 않고 소유자·백엔드 결정으로 올린다):

- **P5-a.** `PLATFORM_PERMISSION_TABLE`에 모듈 권한마다 행을 더한다. 간단하나 외부 패키지가 생길 때마다 플랫폼 코드를 고쳐야 해 «외부 패키지만으로 확장» 목표와 어긋난다.
- **P5-b.** 서버 설정으로 «모듈 권한 → 규칙(예: 특정 workspace 권한 부여 기능 이름)» 표를 둔다. 플랫폼 코드는 한 번만 바꾼다. 어휘 일치 시험(`permissions-vocabulary.test.ts`)이 이 표도 읽어야 하고, 서버가 모듈 권한 어휘(`vocab.json`)를 어떻게 아는지 정해야 한다.
- **P5-c.** 모듈 권한은 `platform:view`처럼 모두에게 허용하고 권한 판정은 서버 `authorize`에만 맡긴다. 화면 표시 권한이 의미 없어진다.

권고: **P5-b를 설계하되 정하기 전에는 모듈 권한을 업무 시스템 진입 권한으로 쓰지 않는다.** 모듈 메뉴 자체는 EV처럼 이미 쓰이고 있으므로 이 제한은 §4.1의 새 Registry 허용에만 걸린다: 허용은 코드로 넣되 사용은 P5가 정해진 뒤다.

## 6. 개발자에게 무엇이 달라지나 (쉬운 설명)

외부 패키지를 만드는 개발자 입장에서, 살아남은 세 가지를 예시로 비교한다.

### Q1 — 모듈이 자기 권한으로 엔드포인트를 적는다

지금: 문서에는 «모듈 권한을 쓰라»는 말이 없어서, 저장소 안 고정 모듈은 타입 때문에 `platform:view`로 돌려 쓰고, EV는 `menuPermission`으로 알아서 우회했다.

```ts
// 전: 고정 모듈 — 모든 사용자에게 열린 권한으로 적어 둠
defineEndpoint({ id: 'fixture.items', menuId: 'fixture:list', permission: 'platform:view', … })

// 후: 모듈 자기 권한. 계약에 이 방법이 적혀 있다 (EV가 이미 이렇게 쓴다)
defineEndpoint({ id: 'fixture.items', menuId: 'fixture:list', permission: menuPermission('fixture:view'), … })
```

달라지는 점: 타입은 그대로고, 문서가 한 줄 늘고, mock이 `fixture:edit` 같은 쓰기 권한을 잘못 거부하지 않는다. 남의 모듈 접두사를 적으면 mock 등록 때 바로 알려 준다.

### Q2 — 패키지가 자기 업무 시스템을 함께 낸다

지금: 앱 담당자가 패키지 설명서를 보고 업무 시스템 정의를 `menus.ts`에 손으로 써야 하고, 모듈 권한을 진입 권한으로 걸면 Registry가 시작 때 거부한다.

```ts
// 전: 앱 menus.ts에서 직접 작성 (패키지가 무엇을 기대하는지 앱이 맞춰야 함)
const SPACES = [ …, { id: spaceId('std-log'), label: …, homeMenuId: 'stdlog:overview', permission: undefined } ];

// 후: 패키지가 export, 앱은 합치기만 함
// 패키지(@acme/std-log): export const stdLogSpace: SpaceDef = { id: spaceId('std-log'), homeMenuId: 'stdlog:overview',
//                                 permission: menuPermission('stdlog:view'), … };
// 앱: createRegistry({ spaces: [...SPACES, stdLogSpace], … })
```

달라지는 점: 패키지가 자기 시스템 정의를 소유하고 앱은 한 줄로 받는다. 단 모듈 권한을 진입 권한으로 거는 것은 §5가 정해진 뒤에만 쓴다. Managed System 자동 등록 파일은 합친 목록으로 만들어진다.

### Q3 — 기존 시스템에 메뉴를 더한다 (바뀌는 것 없음)

```ts
// 전·후 동일: 어느 업무 시스템에 넣을지는 앱 조립자가 정한다
mountModule(eqvManifest, screens, { prefix: '/tools/topview', groupSpace: { 'eqv:equipment': spaceId('tools') }, … })
```

달라지는 점: 없다. 대상 업무 시스템 소유자가 막는 장치는 만들지 않는다. 막는 곳은 앱의 조립 파일 리뷰와 서버 권한 판정이다. 소유자가 다른 조립이 생기면 다시 연다.

## 7. 구현 범위 (컨펌 뒤, 한 PR)

1. `registry.ts`: 모듈이 홈인 업무 시스템의 모듈 접두사 공간 권한 허용(+ 주석 정정, `isModuleScoped` 한 곳으로 모음 — `module.ts`·`registry.ts`를 함께 고치므로 다른 PR과 겹치지 않게 순서를 맞춘다).
2. `mock-server` 등록 검사: `<모듈>:edit` 허용, 남의 접두사 거부.
3. 고정 모듈 두 곳을 `menuPermission('fixture:…')`로 교체(교체 전 실패하는 회귀 시험).
4. 계약 문서(kernel §)에 «모듈 권한은 `menuPermission('<모듈 id>:<이름>')`», 패키지가 `SpaceDef`를 export하는 패턴, `docs/integration/platform-packages.md` §3·kernel/contracts `AGENTS.md` 갱신.
5. `platform-systems` 생성기 입력을 합친 목록으로.
6. `sdk:consumer-check` 시험, devkit Catalog 항목 요청.
7. P5는 별도 결정과 별도 이슈(백엔드). 이 PR에 넣지 않는다.

시험: 모듈 접두사 공간 권한 허용/다른 모듈 접두사·플랫폼 권한과 홈 권한 불일치는 거부, 기존 Registry 시험 그대로 통과, mock의 `<모듈>:edit` 등록 통과·남의 접두사 거부, 외부 소비자에서 합쳐 Registry 구성.

## 8. 하지 않는 것(Deferred, 모두 구현 안 함)

- **`ModuleManifest` 필드(`providesSpace`).** 이유: §4.1. 다시 여는 조건: 같은 요구가 외부 패키지 둘 이상에서 나올 때.
- **`contributors` 허용 목록, 이름 붙은 기여 지점, `defineSystem`.** 이유: §4.2. 다시 여는 조건: 조립자와 대상 소유자가 다른 조립이 생길 때; 지점은 접두사 불변식을 바꾸는 요구가 나올 때.
- **런타임 설치·원격 로딩.** 이유: 06 §5 Deferred.
- **권한 타입 넓히기, `ModulePermission` 브랜드.** 이유: §3. 다시 여는 조건: `menuPermission` 캐스트 오용이 실제로 나올 때.

## 9. 소유자에게 묻는 것 (`질문 #428` 한 묶음)

| # | 질문 | 선택지 | 권고 |
| --- | --- | --- | --- |
| Q1 | #492 | A 타입 그대로 + 계약에 `menuPermission` 명시 + mock 검사 / B 타입 넓히기+호출 때 거부(초판) | A |
| Q2 | 새 시스템 | A `SpaceDef` export + Registry 모듈 접두사 공간 권한 허용 / B manifest 필드 `providesSpace` | A |
| Q3 | 기여 허가 | A 지금 그대로 / B `contributors` 허용 목록 | A |
| Q4 | 범위 | §7 한 PR / 더 작게 | 한 PR |
| Q5 | 파일럿 | 고정 모듈(새 시스템) + EV(권한) | 이대로 |
| Q6 | 필드 이름 | 필드를 만들 때만: `providesSpace`+`moduleSpace` | 보류 |
| P5 | 실서버 모듈 권한 부여 | a 행 추가 / b 서버 설정 표 / c 모두에게 열기 | b, 별도 이슈 |

## 10. ADR 초안 (번호는 컨펌 뒤 `next-adr.sh`로 정해 #598에 예약한다)

> # 외부 패키지는 모듈 권한을 `menuPermission`으로 적고 자기 업무 시스템 정의를 export한다. Registry는 모듈 접두사 진입 권한을 받아들인다
>
> 상태: **Candidate** — 소유자 컨펌 대기. 결정자: 소유자(미정). 관련: [#492](https://github.com/hjung3113/analytics-platform/issues/492), [#428](https://github.com/hjung3113/analytics-platform/issues/428), [ADR-0053](../adr/0053-host-module-contract-v1.md), [ADR-0072](../adr/0072-open-menu-vocabulary-app-declared-branded-ids.md), [ADR-0056](../adr/0056-sdk-release-github-release-tarballs.md).
>
> ## 결정 (권고안)
> 1. 모듈의 엔드포인트·쓰기 권한 타입은 넓히지 않는다. 모듈은 `menuPermission('<모듈 id>:<이름>')`으로 적는다. 판정은 서버 `authorize`이고 클라이언트는 판정하지 않는다. 등록 실수는 mock 등록 검사가 잡는다.
> 2. 패키지는 `SpaceDef`를 export하고 앱이 `spaces`에 합친다. 업무 시스템 id는 패키지가 정하는 별도 값이다. Registry는 홈이 모듈 메뉴이고 공간 권한이 그 모듈의 접두사일 때 공간 권한을 받아들인다.
> 3. 기존 업무 시스템에 메뉴를 더하는 배치는 앱 조립의 결정이다. 허용 목록은 만들지 않는다.
> 4. 모듈 권한을 서버가 누구에게 주는지는 별도 결정이며, 정해지기 전에는 모듈 권한을 업무 시스템 진입 권한으로 쓰지 않는다.
>
> ## Considered Options
> 권한: (A, 권고) 타입 그대로 / (B) `Permission | ModuleScopedId`+호출 때 거부 — 브랜드가 사라지고 보안 이유가 없어 기각. 새 시스템: (A, 권고) `SpaceDef` export / (B) manifest 필드 / (C) `defineSystem`. 기여: (A, 권고) 조립자 결정 / (B) `contributors` — 앱이 지울 수 있어 허가가 아니므로 기각 / (C) 이름 붙은 지점.
>
> ## 결과
> 공개 타입은 늘지 않는다. 대가: 패키지가 `homeMenuId` 문자열을 직접 맞춰야 한다(어긋나면 시작 때 거부). 기여 허가 장치가 없다. 보류한 안은 §8 조건에서 다시 연다.
