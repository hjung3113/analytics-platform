# 호스트 → 모듈 계약 1판을 `@ap/contracts`에 내고, Kernel이 모듈을 등록해 화면에 호스트 포트를 준다

상태: **Decided (2026-10-19, 결정자: 코디네이터 — 사용자 "sdk 아직 완성 아니잖아, 이어서 하자"에 따른 SDK 다음 슬라이스. 되돌릴 수 있음)** — [탑재 설계](../integration/platform-hosting-design.md) §2의 Candidate 모양을 1판으로 확정한다. [ADR-0039](0039-equipment-visualization-platform-first-host-contract.md)의 "플랫폼이 `@ap/contracts`로 호스트 → 모듈 계약을 낸다"를 구현 범위로 받는다. [ADR-0038](0038-host-module-contract-and-feedbackops-mounting.md)의 FeedbackOps 탑재 여부와 EV 편입 게이트(#332)는 이 결정에 들어 있지 않다. 구현은 [#403](https://github.com/hjung3113/analytics-platform/issues/403)(계약·등록)과 그 후속(호스트 포트 실행).

[ADR-0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md)은 SDK를 "플랫폼에 올릴 앱이 따르는 계약"으로 정했다. 디자인 시스템 이전(ADR-0046)과 FeedbackOps 소비 전환으로 UI 층은 SDK에 모였지만, 다른 저장소의 앱이 플랫폼에 올라오는 **계약 자체**는 아직 없다. 지금 메뉴는 앱 절대 경로·닫힌 권한·그룹 목록·`usePlatform()` 훅에 묶여 있어, 다른 저장소 모듈이 올라오려면 플랫폼 계약 파일을 고치고 `@ap/kernel`을 import해야 한다(탑재 설계 §2.4 G1–G11).

## 결정

- **계약 1판(`contract: 1`)은 탑재 설계 §2.3 최소 집합이다.** 모듈이 내는 것: `ModuleManifest`(모듈 id·라벨·`contract`·지원 언어, `requires`/`optional` 호스트 기능, 필요한 `config` 키, 모듈 안 그룹, 화면 `ModuleScreenMeta`). 호스트가 주는 것: 화면마다 `ModuleHost` 하나(세션 스냅샷·세대·구독, 표시용 `can`, params·page 읽기·`setPage`, 모듈 안 `href`/`navigate`와 다른 메뉴로 가는 `ModuleTarget`, `returnTarget`, Context 읽기, `config`, `lang`, `notify`, `status`, `reportError`, `focusTarget`, 해제 `signal`). 이름과 모양은 탑재 설계 §2.5 스케치를 따른다.
- **선택 기능은 `query`(플랫폼 서버 조회)와 `detailSlot`(상세 패널 슬롯) 둘이다.** 화면이 `requires`에 넣은 기능을 호스트가 주지 못하면 등록에서 실패한다.
- **타입은 `@ap/contracts`(React·DOM 무의존)에 둔다.** 노드처럼 React에 묶이는 값은 계약에서 `unknown`이다.
- **등록은 Kernel이 한다:** `mountModule(manifest, screens, { prefix, groupSpace, config, icons })`(이름 Candidate)가 `MenuEntry[]`·`GroupDef[]`를 만든다. 모르는 `contract`, 빠진 필수 기능, 빠진 `config` 키, 모듈 접두사가 없는 권한·그룹 id, 접두사 밖 경로는 `RegistryError`로 거부한다(fail closed). 경로 충돌 검사는 지금 Registry 규칙 그대로다.
- **열린 어휘(G1):** 모듈 권한과 그룹 id는 `<moduleId>:` 접두사 문자열이다. 플랫폼 고유 `PERMISSIONS`·`GroupId`·`SpaceId` 목록은 그대로 둔다. **개정(2026-10-23, [ADR-0072](0072-open-menu-vocabulary-app-declared-branded-ids.md), 구현 전):** 이 목록은 contracts에서 빠지고 앱이 선언한다. contracts에는 Kernel 고유 권한만 남는다.
- **모듈 상태(G4) 화면은 새 모양을 만들지 않는다:** `auth_required`·`identity_mismatch`·`unavailable`은 기존 `StateView` 계열 표현으로 호스트가 그린다. 새 시각 표현이 필요해지면 프로토타입 컨펌을 거친다.
- **개정(2026-10-25, #804): 호스트가 모듈 화면에 제목 줄·Context 바·Scope 게이트와 상세 패널을 그린다.** `ModuleScreen`이 `PlatformPage`로, `detail`을 `DetailDrawer`로 감싼다. 계약 1과 모듈의 import 범위는 그대로다.
- **포트는 다른 저장소 모듈 전용 경계다.** 이 저장소의 견본 메뉴는 `usePlatform()`을 계속 쓰고 옮기지 않는다.
- **모듈 패키지의 의존 범위:** `@ap/contracts`와 SDK UI(`@ap/ui`)만 import한다. `@ap/kernel`·`@ap/shell`·`@ap/components`는 import하지 않는다(탑재 설계 §4의 Open을 이렇게 닫는다). 경계 lint 프리셋으로 강제한다.
- **첫 소비자는 저장소 안 고정 모듈(fixture)이다.** EV `platform-adapter`는 #332 게이트가 풀릴 때까지 기다린다. 고정 모듈은 견본 메뉴가 아니라 계약 검사용이고 플랫폼 앱 메뉴에 노출하지 않는다. **개정(2026-10-25, #801):** EV `eqv`(Top View·Focus)가 EV 릴리스 tarball(EV ADR-0014)로 설치되어 앱 mock 조립에 마운트됐다. #332의 비공개 저장소 게이트는 EV 공개(2026-10-15)로 해소됐고, 첫 외부 소비자는 EV다. 고정 모듈은 계약 검사용으로 남고 앱 메뉴에 올리지 않는다는 부분은 그대로다.

## Considered Options

- **(a, 채택) 계약 타입은 contracts, 등록과 포트 구현은 Kernel:** 모듈이 React 런타임 구현을 import하지 않아 두 호스트에서 같은 manifest를 쓸 수 있고, 지금 Registry 검증을 그대로 쓴다.
- **(b) 모듈도 `usePlatform()`을 쓰게 한다:** 새 계약이 필요 없지만 모듈이 `@ap/kernel` 내부 모양과 앱 절대 경로·닫힌 어휘에 묶여, 다른 저장소가 올라올 때마다 플랫폼 파일을 고쳐야 한다.
- **(c) 외부 설치형 플러그인(런타임 발견·원격 로딩):** 06 §14가 보류했고 지금 소비자가 없다.

## 결과

- 화면 하나를 올리는 데 필요한 것이 manifest + 화면 컴포넌트 + 연결 한 줄로 줄어든다.
- 계약 1판은 소비자가 없는 기능을 넣지 않는다. 저장된 뷰·Context 바 쓰기는 2판 이후다. 쓰기 포트는 [ADR-0054](0054-write-port-declared-actions-idempotency-version.md)가 1판의 선택 기능 `write`로 더한다(기능 검사가 fail closed라 `contract` 정수는 그대로).
- 1판 이후 바꾸면 `contract` 정수를 올리고, 호스트는 받아들일 버전을 명시한다.
- **개정(2026-11-01, #1217): 선택 능력 규칙.** 1판의 `ModuleHost`에 더하는 멤버가 "호스트에 있을 수도 없을 수도 있는 능력"이면 `contract` 정수는 그대로 두고 그 멤버를 **선택(optional)** 으로 낸다. 모듈 코드는 멤버가 있는지 먼저 확인하고 없으면 이전 동작으로 물러선다. 첫 사례는 반복 page key를 읽는 `ModuleHost.pages?`다(없는 호스트에서는 `page`가 첫 값만 준다). 필수 멤버를 더하거나 기존 멤버의 뜻을 바꾸는 변경만 `contract` 정수를 올린다.
