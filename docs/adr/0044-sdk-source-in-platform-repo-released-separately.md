# SDK 원본은 이 저장소에 두고, 플랫폼 앱과 따로 묶음 버전으로 릴리스하며, 모노레포 밖 소비자 검사를 게이트로 둔다

상태: **Decided (2026-10-19)** — 구현은 이슈로 이어진다([#396](https://github.com/hjung3113/analytics-platform/issues/396)). registry 공급자와 접두사 치환 시점만 Open이다.
- 결정자: 사용자 — 2026-10-19. 권고안("니추천대로")을 그대로 골랐다. 권고는 플랫폼(에이전트)이 §4.4와 [포괄 목록](../integration/sdk-coverage-inventory.md)에서 끌어냈다.

[ADR-0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md)이 SDK를 플랫폼 소유의 단일 프레임워크로 정했다. 이 ADR은 그것을 어디에 두고 어떻게 내보낼지를 다룬다. 지금 모든 `@ap/*` 패키지는 `private: true`·`0.0.0`·TS 소스 export·`workspace:*`라 저장소 밖에서 설치할 수 없다. 첫 외부 소비자는 equipment-visualization(`platform-adapter`)이고, 같은 저장소에 FeedbackOps가 `@fops/ui`를 서브모듈로 내주던 방향(ADR-0043이 뒤집음)을 SDK 배포로 바꾸려면 배포 구조가 먼저 정해져야 한다.

## 결정

- **원본 위치:** SDK 패키지(`packages/*`)와 개발 도구(`tooling/*`)의 원본은 이 저장소에 둔다. 별도 SDK 저장소를 만들지 않는다. `apps/platform-web`은 SDK를 배포하지 않으며 공개 진입점만 쓰는 소비자다. 플랫폼 전용 내부 경로 예외를 두지 않는다(공개 진입점 lint가 이미 강제).
- **릴리스 분리:** SDK 버전과 플랫폼 앱 버전(`v0.x` 태그)은 따로 간다. SDK 릴리스가 플랫폼 앱 릴리스를 요구하지 않고, 그 반대도 같다.
- **버전은 묶음(고정 그룹)으로 시작한다.** `contracts`·`kernel`·`ui`·`components`·`shell`은 서로의 내부 타입을 공유하고 `peerDependencies` 폭을 따로 관리할 소비자가 아직 없으므로 한 SemVer를 함께 올린다. 패키지 독립 버전은 소비 증거가 생긴 패키지부터 푼다. 호스트 계약 번호(`contract`)는 SemVer와 별개의 정수로 둔다. 릴리스 도구(예: Changesets의 고정 그룹)는 후보다.
- **첫 배포 대상은 `@ap/contracts`다.** React·DOM·외부 런타임 의존이 없어 위험이 가장 낮고 EV `platform-adapter`가 가장 먼저 필요로 한다. 디자인 시스템 코드는 이전이 끝난 뒤 다음 배포 대상으로 연다. 모든 패키지를 한 번에 공개로 바꾸지 않는다.
- **산출물:** ESM + 타입 선언 + CSS·자산, 명시적 `exports`, `react`·`react-dom`은 `peerDependencies`(Provider 두 벌 방지). 다른 저장소는 `workspace:*`가 아니라 고정 릴리스 범위와 lockfile로 소비한다. `src/` 경로 노출, 사내 소스·데이터 포함, 풀리지 않는 의존, 빠진 CSS는 pack 검사에서 막는다.
- **공개 계약과 내부 전용:** `exports`에 적힌 진입점(`.`, `./testing`, `./styles.css`)만 공개다. 공개 API 스냅샷 검사를 두고 깨지는 변경은 폐기 예고 한 릴리스 이상과 이전 안내를 남긴다.
- **게이트(단계 도입):** ① lint·typecheck·test·경계 검사 ② build + pack ③ 모노레포 밖 깨끗한 소비자에서 install·typecheck·build — 이 셋을 첫 배포 전 필수로 한다. ④ 호스트 계약·등록 적합성은 manifest가 생길 때, ⑤ 지원 제품 통합 E2E는 제품이 소비를 시작할 때 더한다.
- **업그레이드·되돌리기:** 제품은 자동으로 올라가지 않는다. 각 제품이 자기 일정에 올리고 자기 CI로 검증하고 되돌린다. SDK를 바꾸는 쪽은 ②③④(깨끗한 소비자와 적합성)를 책임지고, 제품 통합 검증은 소비하는 제품이 책임진다. 빌드 시 조립 구조라 탑재된 모듈을 바꾸려면 플랫폼 호스트를 다시 빌드·배포한다.

열어 둔 것(사용자·사내 답 필요): registry 공급자와 사내 망·권한 경로(#151), 접두사 `@ap/` 치환 시점([통합 계획 Q1](../integration/framework-unification-plan.md) — 배포 직전), 폐기 예고 기간의 길이.

## Considered Options

- **(A, 채택) 이 저장소에 두고 따로 릴리스**: 원본이 하나라 ADR-0043의 "레포끼리 원본을 나눠 갖지 않는다"와 맞고, 계약·Kernel·UI를 한 PR에서 바꾼다. 대신 SDK와 앱이 한 저장소라 앱 변경이 SDK에 새어 들 위험이 있어 모노레포 밖 소비자 검사(게이트 ③)로 막는다.
- **(B) 별도 SDK 저장소로 분리**: 소비자 CI와 릴리스 주기가 깨끗하게 갈린다. 그러나 계약 한 줄을 바꾸려면 두 저장소 PR과 동기화가 필요하고, 플랫폼 앱이 SDK의 첫 소비자인데 그 검증을 저장소 사이로 옮기게 된다. 외부 소비자가 SDK 릴리스 주기 때문에 앱 변경에 막히는 일이 확인되면 다시 연다.
- **(C) 제품별 저장소가 각자 조각을 배포**: 원본이 흩어지고 ADR-0043 이전의 구조로 돌아간다. 기각.
- 버전: **(a, 채택) 묶음 버전으로 시작** / (b) 처음부터 패키지별 독립 버전 — 소비 증거 없이 호환표만 커진다.

## 결과

- [통합 계획 §4.4](../integration/framework-unification-plan.md#44-sdk-저장소릴리즈-구조-candidate-2026-10-19)의 "정할 것" 중 원본 위치·독립 릴리스 원칙·버전 정책·첫 배포 대상·공개/내부 경계·CI 게이트 수용·검증 책임이 Decided이고, registry와 접두사 시점만 Open으로 남는다.
- 구현 이슈는 이 ADR에서 이어 연다: ① `@ap/contracts` 빌드·`exports`·pack 검사, ② 모노레포 밖 소비자 CI, ③ 릴리스 도구 도입, ④ 디자인 시스템 코드 이전([포괄 목록](../integration/sdk-coverage-inventory.md) §7).
