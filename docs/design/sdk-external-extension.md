# SDK 외부 확장 계약 — 모듈 엔드포인트 권한(#492)과 새 시스템 등록·메뉴 기여(#428)

상태: **Candidate** (2026-11-09, 설계 단계; 소유자 컨펌 전에는 구현하지 않는다). 구현 이슈는 컨펌 뒤에 연다. 결정이 나면 아래 「ADR 초안」이 ADR이 되고, 계약은 [kernel §4–6](../contract/kernel.md)·[ADR-0053](../adr/0053-host-module-contract-v1.md)의 소유 문서를 고친다.

이 문서는 두 이슈의 본문을 현재 코드와 대조한 결과, 옵션, 권고, 소유자에게 물을 선택지를 담는다. 읽은 결정: [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md)(원본은 이 저장소, SDK 따로 릴리스), [ADR-0053](../adr/0053-host-module-contract-v1.md)(호스트 모듈 계약 1판), [ADR-0056](../adr/0056-sdk-release-github-release-tarballs.md)(Release tarball), [ADR-0072](../adr/0072-open-menu-vocabulary-app-declared-branded-ids.md)(열린 어휘), [#1207](https://github.com/hjung3113/analytics-platform/issues/1207) 소유자 결정(다른 저장소의 에이전트는 릴리스 tarball만 쓴다).

용어: 이 문서에서 «모듈»은 **호스트 모듈**(ADR-0053), «시스템»은 공간(`SpaceDef`)이다. 설비의 Module/Slot([GLOSSARY](../../GLOSSARY.md))과 셸 슬롯과 겹치지 않도록 issue의 `targetSlot`은 «기여 지점»으로 쓴다.

## 1. 요약과 권고

| # | 질문 | 권고 |
| --- | --- | --- |
| 1 | #492: 모듈 화면이 부르는 엔드포인트·쓰기가 모듈 권한(`<모듈 id>:*`)을 선언하게 할까 | **A.** `EndpointSpec`·`ActionSpec`의 `permission` 타입만 `Permission \| ModuleScopedId`로 열고, `host.query`·`host.act` 호출 때 «Kernel·앱 선언·내 접두사» 밖의 권한이면 거부한다 |
| 2 | #428: 외부 패키지가 새 시스템(공간)을 내놓는 방법 | **B.** `ModuleManifest`에 선택 필드 `system`을 더하고 `mountModule`이 `SpaceDef`를 함께 돌려준다. 앱이 쓰겠다고 켠 때만 공간이 생긴다 |
| 3 | #428: 외부 패키지가 기존 시스템에 메뉴를 기여하는 방법 | **B.** 대상 공간이 `contributors`(허용 모듈 id 목록)를 선언하면 Registry가 그 밖의 기여를 거부한다. 목록이 없으면 지금처럼 앱 조립자가 정한다 |
| 4 | 기여 지점(extension point) 세분 | **공간 단위만.** 이름 붙인 지점(issue의 `targetSlot`)은 소비자가 둘 이상 생길 때 연다(06 §24) |
| 5 | 배포 | 새 런타임 설치 없음. 정적 조립을 유지하고, 새 API는 기존 `@ap/contracts`·`@ap/kernel` tarball로 나가며 `ap-devkit` Catalog에 항목을 더한다(#1207) |

세 변경은 모두 **옵션만 더한다.** 새 필드를 쓰지 않는 기존 앱·모듈은 동작도 공개 API 스냅샷의 기존 줄도 그대로다. `contract` 정수는 올리지 않는다(ADR-0053 개정 #1217의 선택 능력 규칙).

## 2. 이슈 주장 점검 (2026-11-09 코드 기준)

### #492

| 이슈의 주장 | 지금 | 판정 |
| --- | --- | --- |
| `EndpointSpec.permission`이 닫힌 `Permission` | `Permission = KernelPermission \| MenuPermission`이다(`packages/sdk/contracts/src/menu/menu.ts`). 브랜드 문자열이라 «모듈 접두사 문자열»은 앱이 `menuPermission(...)`으로 선언하지 않으면 타입에 들어가지 않는다 | **부분만 유효.** 닫힌 목록은 아니지만 모듈 권한 문자열은 여전히 못 쓴다 |
| 경로 `packages/contracts/src/menu-query.ts` | `packages/sdk/contracts/src/menu/menu-query.ts` | 경로만 낡음 |
| 고정 모듈이 `platform:view`로 우회 | `packages/sdk/shell/src/__fixtures__/module-fixture/ListScreen.tsx`·`ItemScreen.tsx`가 `platform:view`를 쓰고 «#492까지»라 적는다 | **유효** |
| 같은 문제가 쓰기에도 있다 | `ActionSpec.permission`도 `Permission`이다(`contracts/src/adapter/action.ts:13`) | 이슈에 없던 것. 같은 결정으로 묶는다 |
| 등록 때 검사 | 엔드포인트 spec은 `host.query(spec, …)` 호출 때 처음 보인다. 등록 시점(`mountModule`)에는 spec이 없다 | **틀림.** 검사 자리는 호출 때다 |
| 서버가 매 요청 재검사 | `apps/platform-api/src/modules/menu-dispatch/query.ts`가 `declaration.authorize(actor)`로 판정한다. `spec.permission`은 요청에 실리지 않는다(주석 «not sent in the request») | **유효.** 권한의 최종 판정은 서버 선언이고 클라이언트 spec은 문서 역할이다 |
| 다시 열 조건: 첫 실제 모듈이 자기 권한으로 플랫폼 조회 | EV `eqv`가 tarball로 마운트됐다(#801). EV가 `host.query`를 자기 권한으로 쓰는지는 이 설계에서 **확인하지 못했다**(소비자 코드는 저장소 밖) | 조건 충족 여부 미확인 |

### #428

| 이슈의 주장 | 지금 | 판정 |
| --- | --- | --- |
| `SpaceId`·`GroupId`·`Permission`이 닫힌 목록 | ADR-0072로 브랜드 문자열이고 목록은 앱이 선언한다 | **낡음** |
| `packages/kernel/src/registry.ts`의 `createRegistry` 검증은 재사용 가능 | `packages/sdk/kernel/src/registry/registry.ts`. 중복 id·경로·그룹/홈·parent·page key·예약 네임스페이스를 fail closed로 검증한다 | 유효(경로만 바뀜) |
| 외부 시스템별 소유권·기여 허가 모델 없음 | 없다 | **유효** |
| `ModuleManifest`·`ModuleHost`(#403)와의 관계를 먼저 정한다 | 둘 다 구현됐다. `ModuleManifest`는 «모듈 id, 그룹, 화면»을 담고 `mountModule`이 `MenuEntry`·`GroupDef`를 만든다(ADR-0053) | **낡음.** 질문의 답은 «`ModuleManifest`를 확장한다»가 이미 정해져 있다 |
| 정적 `SPACES`·`GROUPS`·`MENUS` 수동 연결 | `apps/platform-web/src/menus.ts`가 앱 소유 배열에 `modules.ts`의 `mountModule` 결과(EV)를 더한다 | 유효. 단 외부 패키지를 실제로 조립한 사례가 이미 있다 |
| 06 §5: 런타임 설치·원격 로딩은 Deferred | 그대로 | 유효 |
| 첫 수직 파일럿 = 새 시스템 1건 + 기존 시스템 기여 1건 | EV는 «기존 `tools` 공간에 그룹 하나를 기여»하는 모양으로 이미 마운트돼 있다. 그 공간은 앱이 선언했고 EV는 허가를 받은 것이 아니라 앱이 직접 연결했다 | 부분 충족. 새 시스템 쪽과 «대상 소유자 허가»는 없다 |
| `defineSystem`·`defineMenuContribution`·`targetSlot` | 없다. issue가 이름 모두 Candidate라 적었다 | 후보 |

### 지금 이미 되는 것과 빈 곳

되는 것: 외부 패키지가 manifest+화면을 내고, 앱이 `mountModule`로 마운트하며, 그룹은 앱이 고른 공간(`groupSpace`)에 들어간다. 권한·그룹은 `<모듈 id>:` 접두사로 격리되고 다른 모듈·Kernel 네임스페이스는 쓸 수 없다(`RegistryError`).

빈 곳:

1. **공간 자체**를 패키지가 담아 오지 못한다. `SpaceDef`(라벨·설명·홈 메뉴·진입 권한)는 앱이 손으로 쓴다. 외부 패키지를 «새 시스템»으로 받으려면 앱 코드에 공간을 한 벌 더 써야 한다.
2. **대상 소유자의 허가**가 없다. 어느 앱 조립자든 `groupSpace`로 아무 모듈 그룹을 아무 공간에 넣을 수 있다.
3. **엔드포인트·쓰기 권한**이 모듈 어휘를 못 쓴다(#492).

## 3. #492 — 모듈 엔드포인트 권한

### 옵션

- **A (권고). 타입을 열고 호출 때 검사.**
  - `EndpointSpec.permission`·`ActionSpec.permission`: `Permission | ModuleScopedId`. `defineEndpoint`의 입력만 넓어지고 읽는 쪽(`menuPermissions` 등)이 쓰는 `Permission`은 그대로다.
  - `host.query`·`host.act`는 spec을 받은 순간 `spec.permission`이 «`registry.permissions`(Kernel+앱 선언)에 있음» 또는 «`<내 모듈 id>:` 접두사»인지 본다. 아니면 요청을 보내지 않고 거부한다(다른 모듈의 접두사, 선언 안 된 어휘). 거부는 프로그래밍 오류이므로 `forbidden` 응답이 아니라 거부된 Promise(`Error`)로 알린다.
  - 플랫폼 메뉴의 엔드포인트는 지금과 같다. 앱 코드에는 이 검사가 닿지 않는다(호스트 포트에만 있다).
  - mock 서버·서버 구현은 권한을 불투명 문자열로 다룬다. mock 조립은 이미 `modulePermissions(registry)`로 모듈 권한을 역할 어휘에 더하므로 따로 바꾸지 않는다. `@ap/server-conformance`는 타입 확장(포트의 `permission: Permission`을 `Permission | ModuleScopedId`)만 한다.
  - 이유: 서버 판정이 최종이고 spec 권한은 요청에 실리지 않는다. 클라이언트 검사의 몫은 «모듈이 남의 어휘를 문서에 적는 실수»를 막는 것뿐이므로 호출 자리에서 한 줄이면 충분하다.
- **B. A + 적합성 검사.** 서버가 모듈 접두사 권한 엔드포인트를 해당 권한이 없는 호출자에게 거절하는지 `@ap/server-conformance`가 확인한다. 서버 구현자가 모듈 엔드포인트를 실제로 낼 때까지 확인 대상이 없다. 그때 연다.
- **C. 하지 않는다.** 고정 모듈은 `platform:view`를 계속 쓴다. 해로운 점: 모듈 화면이 «보이는 권한»과 «부르는 엔드포인트 권한»이 다르게 읽히고, 모듈 권한만 가진 사용자는 같은 모듈의 조회를 못 한다.

### 변경 표면과 영향

- `packages/sdk/contracts/src/menu/menu-query.ts`, `…/adapter/action.ts`: 타입 한 줄씩. `sdk:api` 스냅샷이 «넓어짐»으로 바뀐다(소비자가 읽는 `Permission`은 그대로라 깨지는 변경이 아니다. `AnyEndpointSpec`을 읽어 `permission`을 `Permission`으로 좁혀 쓰는 소비자가 있는지 `rg`로 확인한다 — 구현 이슈의 Impact).
- `packages/sdk/kernel/src/registry/module-host.ts`의 `host.query`·`host.act`: 호출 시 검사 한 곳. 검사에 `registry.permissions`가 필요하다. `registry.permissions`는 `module-host`가 이미 쓰는 `useHostPlatform()`의 `registry`로 닿는다(새 포트 불필요, plan 리뷰 확인). 같은 자리에서 `spec.menuId`가 자기 모듈의 메뉴인지도 확인한다(남의 메뉴 id로 부르는 실수 방지).
- 접두사 판정(`<모듈 id>:`)은 지금 여러 곳에 있으므로 `isModuleScoped` 한 곳으로 모은다.
- **expand → migrate 순서.** 타입을 넓히면 `spec.permission`을 `Permission`으로 읽는 코드가 컴파일 오류가 난다: `mock-server/src/actions/actions.ts`, `mock-server/src/query/endpoints.ts`, `server-conformance` 여러 줄. 구현은 읽는 쪽을 `Permission | ModuleScopedId`로 같이 고치는 한 PR이고, 저장소 밖 서버 구현체의 영향은 CHANGELOG 한 줄로 알린다.
- mock의 `permissionDeclared`는 어떤 메뉴의 진입 권한도 아닌 `<모듈>:edit` 같은 쓰기 권한을 거부하므로, 모듈 접두사 권한은 «모듈 id가 마운트된 모듈 중 하나»이면 선언된 것으로 본다. 서버가 모듈 권한 어휘를 아는 방식(`vocab.json`)은 구현 때 확인한다(**미확인**).
- 타입을 템플릿 `${string}:${string}`로 열면 `platform:veiw` 같은 오타도 컴파일된다. 호출 때 검사가 잡지만 컴파일 시점은 아니다. `ModulePermission` 브랜드는 대안이며 follow-up으로 둔다.
- `packages/sdk/shell/src/__fixtures__/module-fixture/`: `platform:view`를 모듈 권한으로 바꿔 회귀 시험으로 쓴다(바꾸기 전 실패, 바꾼 뒤 통과).
- 서버: `apps/platform-api`의 `menu-dispatch`는 권한을 `authorize` 선언으로 판정하므로 코드 변경이 없다.

시험: (1) 모듈이 자기 접두사 권한 spec으로 `host.query`를 부르면 통과, (2) 다른 모듈의 접두사 spec은 거부되고 전송되지 않음, (3) 선언 안 된 어휘는 거부, (4) Kernel·앱 권한 spec은 지금처럼 통과, (5) `host.act`도 같은 규칙.

## 4. #428 — 새 시스템 등록과 기존 시스템 메뉴 기여

### 4.1 새 시스템(System Extension)

«시스템» = 독립 Workspace/Sidebar/홈을 가진 공간(`SpaceDef`, ADR-0026). 두 번째 App Shell·전역 Provider·로그인은 만들지 않는다.

- **A. 지금 그대로.** 앱 조립자가 `SpaceDef`를 직접 쓰고 `groupSpace`로 모듈 그룹을 넣는다. 추가 코드 없음. 대가: 외부 패키지 하나가 시스템 하나를 내놓는 경우에도 공간 선언을 패키지 밖에서 손으로 맞춰야 하고, 홈 메뉴 id(`<모듈>:<화면>`)가 어긋나면 Registry 시작 때 알게 된다.
- **B (권고). 선택 `system` 필드.** `ModuleManifest.system?: { space: { id; label; subtitle?; description; permission?; homeScreen } }`를 더한다. `homeScreen`은 같은 manifest의 화면 id다.
  - `mountModule`은 반환값에 `spaces: SpaceDef[]`(필드가 없으면 빈 배열)를 더한다. 앱은 이를 `createRegistry({ spaces: [...SPACES, ...mod.spaces] })`로 직접 합친다 — 합치는 한 줄이 «이 시스템을 받겠다»는 동의다.
  - 공간 id는 `<모듈 id>`와 같다(규칙 한 가지). Registry의 기존 검사(예약 루트, 홈 메뉴가 그 공간에 속함, 홈 경로에 `:param` 없음)가 그대로 적용된다. 모듈 그룹의 `groupSpace`는 `system`이 있으면 그 공간이 기본값이다.
  - `system.space.permission`은 `<모듈 id>:` 접두사를 요구한다(Kernel·다른 모듈 어휘 금지, 격상 불가). **현재 Registry는 이를 거부한다**(공간 권한은 Kernel·앱 선언만, 홈 메뉴 권한은 공간 권한과 같아야 함; `SpaceDef.permission` 타입도 `Permission`). 그래서 구현에 ① `SpaceDef.permission` 타입 확장 ② 모듈 공간만 «자기 접두사 허용» 분기 ③ 홈 화면 권한 = 공간 권한 검사 유지가 든다.
  - 필드를 모르는 옛 호스트가 `system`을 조용히 무시하지 않도록, `system`을 쓰는 manifest는 새 `HostFeature` `'system'`을 `requires`에 넣어야 한다. 옛 호스트는 `requires` 검사로 fail closed하고 `contract` 정수는 그대로다.
  - `system.space.contributors?`로 시스템 소유 패키지가 허용 목록을 함께 낸다(§4.2).
  - 필드가 없는 기존 manifest(EV 포함)는 변하지 않는다.
- **C. 별도 공개 계약 `defineSystem({ groups, menus, modules })`.** 한 시스템이 여러 모듈을 묶을 때 편하다. 그러나 `ModuleManifest`와 «그룹·화면»이 겹쳐 ADR-0053이 피하려던 중복 개념이 된다. 시스템 하나 = 모듈 하나가 아닌 소비자가 생기면 다시 본다(**소비자 0**).

### 4.2 기존 시스템에 메뉴 기여(Menu Contribution)

- **A. 지금 그대로.** 앱 조립자가 `groupSpace`로 정한다. 대상 시스템 소유자의 허가 수단이 없다.
- **B (권고). 대상 공간이 허용 모듈을 선언한다.** `SpaceDef.contributors?: readonly string[]`(모듈 id). 규칙:
  - 소유자: 앱이 선언한 공간은 앱 조립자 자신이 소유자라 `SpaceDef.contributors`는 자기 정책을 코드에 박는 것이다. 외부 패키지가 소유한 시스템은 §4.1의 `system.space.contributors`로 패키지가 직접 선언한다. 이때 앱이 합쳐도 목록 밖 기여는 거부된다. 기여 쪽에서 `contributesTo`를 선언하는 방식(기여자가 대상을 가리킴)도 비교했으나 목록이 대상에 있어야 «허가»가 되므로 채택하지 않는다.
  - `contributors`가 **없으면 지금과 같다**(앱 조립자 자유). 있으면 그 목록에 없는 모듈의 그룹을 그 공간에 넣는 `createRegistry`가 `RegistryError`다(fail closed).
  - 기여는 모듈 **자신의 그룹**으로만 들어간다(ADR-0053의 접두사 불변식). 대상의 기존 그룹·메뉴를 바꾸거나 순서를 끼워 넣지 못한다. 사이드바에서는 대상 공간의 Sidebar에만 나타난다.
  - 권한: 기여 메뉴의 권한은 `<모듈 id>:*`다. 대상 시스템의 권한을 만들거나 격상하지 못한다. 서버 판정이 최종이다(§3).
  - 기여가 어느 공간으로 갈지는 여전히 앱 조립이 `groupSpace`로 고른다. `contributors`는 «허용 목록 밖은 거부»만 더한다.
- **C. 이름 붙은 기여 지점(`targetSlot`).** 대상이 지점 목록(`slots: [{ id, group }]`)을 공개하고 기여가 지점을 가리키는 형태. 대상의 기존 그룹 안에 메뉴를 끼우려면 «그룹 id는 모듈 접두사»라는 불변식을 깨야 한다. 소비자가 없고(§24 기준: 실소비자 2–3) 불변식을 건드리므로 **미룬다.**

### 4.3 호환성과 소유

- SDK 버전 호환은 이미 ADR-0056의 정확 버전 `peerDependencies`와 `contract` 정수(`HOST_CONTRACTS`)가 맡는다. manifest에 SDK 범위 필드를 더하지 않는다.
- 기여 패키지의 업데이트 책임은 소유 팀에 있고(독립 릴리스), 탑재본 변경은 플랫폼 재빌드·재배포가 필요하다(정적 조립, issue 원칙 5와 같다).
- ID·경로 충돌, 홈·primary, parent, page key는 `createRegistry`가 이미 거부한다. 이 설계가 새로 거부하는 것은 ① `system` 공간의 접두사 위반, ② `contributors` 밖의 기여, ③ 모듈 접두사 밖 권한(§3)이다.

### 4.4 외부 배포 (#1207)

저장소 밖 에이전트는 SDK Release tarball만 설치해 쓴다. 따라서 새 API는 ① `@ap/contracts`·`@ap/kernel`의 공개 진입점에만 두고(`sdk:api` 스냅샷), ② 깨끗한 외부 소비자(`sdk:consumer-check`)에 «새 시스템 모듈 1개 + 기여 모듈 1개를 마운트해 Registry를 만든다»는 시험을 더하고, ③ `ap-devkit` Catalog에 항목(`mountModule`의 `system`, `SpaceDef.contributors`)을 더한다. 외부 `check`가 Registry 구성 오류를 읽어 안내할 수 있도록 `RegistryError` 메시지에 위반한 id를 항상 넣는다(지금도 그렇다).

devkit 쪽 변경은 `ap-devkit` 레인 소유다. 이 설계는 항목 추가만 요청하고 devkit 구조는 바꾸지 않는다.

### 4.5 시험 매트릭스 (구현 단계)

| 시험 | 기대 |
| --- | --- |
| 새 시스템 단독 1개 | 공간·홈·그룹·메뉴가 Registry에 선다. 홈 경로에 `:param`이 있으면 거부 |
| 새 시스템 여러 개 | 공간 id 충돌은 거부, 서로의 접두사 권한 사용은 거부 |
| `contributors` 있는 공간에 허용된 모듈 | 대상 Sidebar에 나타난다 |
| `contributors` 있는 공간에 허용 안 된 모듈 | `RegistryError`(모듈 id 포함) |
| `contributors` 없는 공간(기존 앱) | 지금과 같다 — 기존 시험이 그대로 통과 |
| 중복 id·경로 충돌·없는 공간 | 기존 `RegistryError` |
| 권한 변경·Scope 변경·로그아웃 | 기존 모듈 호스트 시험(세대·요청 취소·잔상)이 그대로 통과 |
| 외부 소비자(tarball) | `sdk:consumer-check`에서 새 시스템+기여 마운트 통과 |
| 공개 API | `sdk:api`는 넓어짐만 보인다. 기존 줄이 바뀌면 실패 |

경계: 브라우저 새로고침·뒤로가기·CSS·Provider 충돌은 모듈 화면이 이미 `ModuleScreen` 안에서 같은 셸을 쓰므로 새로 생기지 않는다. 새 화면 시안이 없고 UI 변경도 없다(공간·그룹은 기존 사이드바가 그린다).

## 5. 하지 않는 것(Deferred, 모두 구현 안 함)

- **런타임 설치·원격 로딩.** 이유: 06 §5 Deferred, 소비자 없음. 다시 여는 조건: 재빌드 없이 모듈을 바꿔야 하는 요구가 확인될 때.
- **이름 붙은 기여 지점(`targetSlot`)과 대상 그룹 안 끼워 넣기.** 이유: 접두사 불변식을 건드리고 소비자 0. 다시 여는 조건: 같은 요구가 외부 소비자 2곳 이상에서 나올 때.
- **`defineSystem`(여러 모듈을 한 시스템으로 묶음).** 이유: `ModuleManifest`와 개념 중복, 소비자 0. 다시 여는 조건: 한 시스템이 두 모듈 이상을 낼 때.
- **엔드포인트 권한 적합성 검사(§3의 B).** 이유: 서버 쪽 모듈 엔드포인트가 아직 없다. 다시 여는 조건: 서버 구현자가 모듈 접두사 권한 엔드포인트를 처음 낼 때.
- **기여자 업데이트·호환 매트릭스 자동화.** 이유: 정확 버전 peer와 `contract` 정수로 충분하다. 다시 여는 조건: 외부 모듈이 둘 이상이고 호환 어긋남이 실제로 나올 때.

## 6. 소유자에게 묻는 것 (`질문 #428` 한 묶음)

| # | 질문 | 선택지 | 권고 |
| --- | --- | --- | --- |
| Q1 | #492를 §3 A로 구현할까 | A(타입 열기+호출 때 검사) / B(+적합성 검사) / C(하지 않음) | A |
| Q2 | 새 시스템 방식 | A(지금 그대로) / B(`system` 선택 필드) / C(`defineSystem`) | B |
| Q3 | 기존 시스템 기여 허가 | A(지금 그대로) / B(`SpaceDef.contributors` 허용 목록) / C(이름 붙은 지점) | B |
| Q4 | 구현 범위 | 모두(#492 → #428 B/B) / #492만 / #428만 | 모두, 두 PR |
| Q5 | 파일럿 | 저장소 안 고정 모듈 둘(새 시스템 1+기여 1)로 시험 / EV를 기여 예시로 연결 | 고정 모듈. EV는 #332 게이트를 건너뛰지 않는다 |

## 7. ADR 초안 (번호는 컨펌 뒤 `next-adr.sh`로 정해 #598에 예약한다)

> # 외부 확장은 `ModuleManifest`를 선택 필드로 넓혀 받고, 대상 공간이 허용 모듈을 선언해야 기여를 거부할 수 있다
>
> 상태: **Candidate** — 소유자 컨펌 대기. 결정자: 소유자(미정). 관련: [#492](https://github.com/hjung3113/analytics-platform/issues/492), [#428](https://github.com/hjung3113/analytics-platform/issues/428), [ADR-0053](../adr/0053-host-module-contract-v1.md), [ADR-0072](../adr/0072-open-menu-vocabulary-app-declared-branded-ids.md), [ADR-0056](../adr/0056-sdk-release-github-release-tarballs.md).
>
> ## 결정 (권고안)
> 1. `EndpointSpec.permission`·`ActionSpec.permission`은 `Permission | ModuleScopedId`다. `host.query`·`host.act`는 Kernel·앱 선언 권한 또는 자기 모듈 접두사 밖이면 요청을 보내지 않고 거부한다. 권한의 최종 판정은 서버다.
> 2. `ModuleManifest`는 선택 필드 `system`으로 공간 하나를 담아 올 수 있고, `mountModule`이 `SpaceDef`를 돌려준다. 앱이 합칠 때만 공간이 생긴다.
> 3. `SpaceDef.contributors`가 있으면 그 목록의 모듈만 이 공간에 그룹을 둘 수 있다. 없으면 지금과 같다. 기여는 자기 접두사 그룹·권한으로만 들어간다.
> 4. 호스트 `contract` 정수는 그대로다(선택 능력 규칙). 배포는 기존 Release tarball이다.
>
> ## Considered Options
> 새 시스템: (A) 앱이 공간을 직접 씀 / **(B, 권고) manifest 선택 필드** / (C) `defineSystem` 별도 계약. 기여: (A) 조립자 자유 / **(B, 권고) 대상 허용 목록** / (C) 이름 붙은 기여 지점. 권한: (A, 권고) 타입 열기+호출 때 검사 / (B) +적합성 검사 / (C) 유지.
>
> ## 결과
> 기존 앱·모듈은 변하지 않는다. 대가: 공간 id가 모듈 id와 같아야 하므로 한 모듈이 여러 시스템을 낼 수 없다. 이름 붙은 지점과 `defineSystem`은 §5 조건에서 다시 연다.

## 8. 구현 노드 (컨펌 뒤)

1. #492(§3 A): contracts 타입 + 읽는 쪽(mock-server·server-conformance) 동시 수정 + `isModuleScoped` + `module-host` 검사 + 고정 모듈 권한 교체 + 시험 5개 + `sdk:api` `--update` 한 줄.
2. #428(§4 B/B): manifest `system` + `mountModule` 반환 `spaces` + `SpaceDef.contributors` + Registry 검사 + 고정 모듈 둘 + `sdk:consumer-check` 시험 + kernel §4–6·`docs/integration/platform-packages.md` §3·kernel/contracts `AGENTS.md`·ADR 정리 + devkit Catalog 항목 요청.

둘 다 `packages/sdk/*`와 Registry를 건드리므로 full 티어 + 리뷰 1회다. 두 PR은 파일이 겹치지 않으나(`menu-query.ts`·`module-host.ts` 대 `registry.ts`·`module.ts`) `sdk:api` 스냅샷과 `CHANGELOG.md`는 순서대로 쓴다.
