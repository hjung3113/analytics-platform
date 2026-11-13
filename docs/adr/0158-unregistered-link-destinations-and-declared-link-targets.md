# 등록되지 않은 링크 목적지는 «없음», 메뉴는 링크 목적지를 선언한다

상태: **Decided (2026-11-13)**
- 결정자: 소유자 위임 advisor — 2026-11-13 [#1903](https://github.com/hjung3113/analytics-platform/issues/1903), 소유자가 되돌릴 수 있다.
- Scope: Kernel `resolveLink`·`canOpen`·`linkTo`, 메뉴 manifest `linkTargets`, `createRegistry`의 `linkTargetCheck`·`missingLinkTargets`. 계약 원천은 [§22](../contract/cross-menu-links.md#22-cross-menu-context-link)이고 메뉴 선언 표는 [kernel.md §5](../contract/kernel.md#5-menu-extension-contract)다. 관련: [ADR-0053](0053-host-module-contract-v1.md)(모듈 메뉴), [ADR-0156](0156-core-server-checks-the-bundle-against-a-built-menu-snapshot.md)(선언 스냅샷).

## 맥락

- 다른 메뉴로 가는 링크는 목적지 메뉴 id 문자열 하나로 만든다. 그 문자열은 아무도 검사하지 않았다. 목적지가 이 조립에 없으면 `resolveLink`·`canOpen`·`linkTo`가 렌더 중에 `Unknown menu …`를 던져 출발 화면이 오류 경계로 떨어졌다.
- 조립마다 메뉴 묶음이 다르다. 사내 조립에는 견본 메뉴가 없고, 저장된 기록·서버 응답의 메뉴 id는 지금 없는 메뉴를 가리킬 수 있다.
- 그래서 메뉴 두 곳(`EquipmentDetail`, log-knowledge `TopViewSection`)과 SDK 두 곳(`HierarchyNav`, 모듈 호스트)이 `registry.menus.some(...)`이나 `try/catch`로 손 가드를 두었다. 가드가 없는 `platform/admin` 감사 화면은 견본 메뉴 id로 `linkTo`를 불러 사내 조립에서 던질 수 있었다.

## 결정

1. **등록되지 않은 목적지는 «없음».** `resolveLink`는 `{ kind: 'none', href: null, allowed: false, droppedPageKeys: [] }`를 돌려주고 던지지 않는다. 등록된 목적지는 `kind: 'link'`가 더해질 뿐 결과가 같다. `canOpen(없는 id)`는 `false`다. 호출자는 `kind`를 먼저 보고, `none`이면 고정 진입점을 그리지 않으며 권한 사유로 표시하지 않는다.
2. **`linkTo`·`menuById`는 그대로 던진다.** `linkTo`는 반환형 `string`을 지키는 줄임이고 등록이 보증된 목적지(같은 패키지의 메뉴, `linkTargets.required`)에만 쓴다.
3. **메뉴는 목적지를 선언할 수 있다.** 선택 필드 `linkTargets: { required?, optional? }`(메뉴 id만). `createRegistry`는 모양(배열, id 모양 — `:` 허용, 한 목록 안 중복, 두 목록에 같은 id)과 모듈 메뉴의 선언을 거부하고, 등록되지 않은 `required`를 `RegistryError`로 거부한다. 선언됐지만 없는 목적지는 `registry.missingLinkTargets`(`{ menuId, target, level }`)에 나온다.
4. **부분 Registry는 `linkTargetCheck: 'report'`.** 자기 메뉴만 올리는 패키지 시험·시작 키트는 `required` 거부를 끄고 목록으로만 받는다. 기본은 `'enforce'`다: 놓치면 위험한 쪽(배포 조립에 필수 목적지가 빠짐)이 설정 없이 잡히고, 끄는 쪽이 조립 파일에 글자로 남는다. 시작 키트 템플릿에는 넣지 않는다.
5. **`required`는 좁게.** 없으면 메뉴의 주 흐름이 끊길 때만 적는다. `platform/*`는 견본 메뉴 id를 `required`로 적지 않는다.
6. **선언은 권한도 Context도 아니다.** Context·page 값·경로 값을 싣지 않고, 키를 이어받게 하지 않으며(이어받기는 carry set뿐), 권한을 주지 않고, 들어오는 주소를 제한하지 않는다. 서버는 `linkTargets`를 모르고 선언 스냅샷(ADR-0156)에도 들어가지 않는다.
7. **손 가드를 걷어낸다.** 메뉴의 `registry.menus.some(...)` 두 곳과 SDK의 `resolveLink` 가드 두 곳은 새 결과로 가른다. 감사 화면은 `resolveLink`를 받아 `none`·권한 없음에 `{ ok: false }`를 돌려준다. 계약을 검증하는 세 Consumer(`equipment-detail`, `log-knowledge-model`, `admin-audit`)는 목적지를 `optional`로 선언한다.

## Considered Options

- **(A, 채택) «없음» + 선언 검사.** 이슈가 요구한 «등록 때 보고»와 «없음으로 돌아옴»을 함께 채운다. Kernel의 다른 선언(없는 parent, 선언 안 된 그룹, 모듈 `requires`)과 같은 조립 시점 거부다.
- **(B) 들어오는 연결 선언.** 목적지 메뉴가 «이 대상 종류로 나를 열 수 있다»를 선언하고 출발 화면이 그 목록을 그린다. 새 메뉴를 붙일 때 출발 화면을 고치지 않아도 되지만, 정할 것이 넷(선언 위치, 경로 param, 종류 이름과 ID 공간, 그리는 자리)이고 사용자에게 보이는 새 진입점이라 프로토타입 대상이다. A가 먼저 있어야 한다. 후속 이슈 [#1930](https://github.com/hjung3113/analytics-platform/issues/1930)으로 옮겼다(설계부터).
- **(C) 던지지 않기만.** 가장 작지만 아무것도 검사하지 않아 «등록 때 보고»를 채우지 못한다.
- **`required` 없이 목록 하나만.** `linkTargetCheck`가 필요 없어 더 작지만 검사가 조립자가 목록을 읽을 때만 일어나고, `linkTo`를 패키지 밖 목적지에 쓸 근거가 없어진다. `linkTargetCheck`의 비용이 크다고 드러나면 이 안으로 줄일 수 있다(선언한 `required`가 없는 동안은 되돌리기 쉽다).

## 결과

- 저장소 밖 메뉴는 `allowed`로 좁히지 않고 `resolveLink(...).href`를 읽으면 `string | null` 타입 오류가 난다. `kind`로 좁히거나 등록이 보증된 목적지면 `linkTo`를 쓴다. 남아 있는 `try/catch`·`registry.menus.some` 가드는 그대로 두어도 동작한다.
- 미룬 것(호출부↔선언 lint, 목적지별 page key 선언, 세 갈래 링크 부품, 모듈 manifest의 `linkTargets`, `missingLinkTargets` 화면, 견본 메뉴 사이의 `linkTo`)은 [backlog](../../.planning/backlog.md)에 이유와 다시 여는 조건과 함께 있다.
