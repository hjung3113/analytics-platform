# equipment-visualization은 플랫폼 탑재가 기본이고, 플랫폼이 `@ap/contracts`로 호스트 → 모듈 계약을 낸다

상태: **Proposed (2026-10-17)** — 선행 조사, 구현 안 함. 방향(플랫폼 탑재 기본, 호스트 계약은 `@ap/contracts`, `@ap/*` 의존은 EV `platform-adapter` 안에서만)은 사용자가 2026-10-17 [#396](https://github.com/hjung3113/analytics-platform/issues/396)·[#332](https://github.com/hjung3113/analytics-platform/issues/332) 코멘트로 정했다. 이 ADR은 그 방향을 플랫폼 쪽 계약 언어로 옮긴 초안이고, 아래 세부(계약 위치·이름·버전 규칙·EV 쪽 CI)는 아직 결정되지 않았다.
- 결정자: 사용자 (미정)

equipment-visualization(EV) [ADR-0001](https://github.com/hjung3113/equipment-visualization/blob/main/docs/adr/0001-standalone-packages-thin-platform-consumer.md)은 "독립 패키지가 정본, analytics-platform은 얇은 소비자"로, 플랫폼 `menus/equipment`에 페이지 조립·`menuQuery` 선언·`platform-adapter`만 두기로 했다. 2026-10-17 사용자 정정은 무게중심을 바꾼다: EV의 기본 실행 환경은 플랫폼 셸이고, 독립 Studio는 같은 모듈의 두 번째 호스트(부가 기능)다. 그러면 "플랫폼이 모듈에 무엇을 주는가"를 EV가 아니라 플랫폼이 정의해야 한다. 설계 전체는 [플랫폼 탑재 설계](../integration/platform-hosting-design.md), 호스트 계약의 일반형은 [ADR-0038](0038-host-module-contract-and-feedbackops-mounting.md)이다.

## 결정 (제안)

- **EV의 기본 호스트는 플랫폼 셸이다.** EV 화면(Top View 뷰어·재생·온보딩)은 플랫폼 Registry에 등록되는 모듈 화면으로 먼저 설계하고, Studio는 같은 `@eqv/*` 패키지를 직접 조립하는 독립 호스트로 남긴다.
- **호스트 → 모듈 계약은 `@ap/contracts`가 소유한다.** React·DOM 무의존 규칙(패키지 경계 §3 규칙 5)을 그대로 지키는 타입·함수 시그니처만 둔다. EV가 자기 입력 타입을 내고 플랫폼이 맞추는 안(통합 계획 Q4 (b))은 쓰지 않는다.
- **EV에서 `@ap/*`를 import하는 곳은 `packages/platform-adapter` 하나다.** `@eqv/core`·`renderer`·`editor`·`replay`는 계속 플랫폼을 모른다(EV의 기존 ESLint 경계 규칙 유지). 어댑터는 모듈 manifest, 호스트 계약 → renderer/editor props 변환, `--eqv-*` 테마 매핑, `menuQuery` 선언을 가진다.
- **플랫폼 쪽에는 EV 화면 코드를 두지 않는다.** `menus/analytics/equipment`는 EV 모듈 manifest를 Registry에 이어 붙이고 공간·그룹 소속과 상세 화면 연결(탭 vs 새 메뉴, #333)만 정한다. EV 모델·렌더러를 플랫폼에 복제하지 않는다는 기존 원칙(EV ADR-0001)은 그대로다.
- **쓰기(초안 저장·Publish)는 1차 범위 밖이다.** 플랫폼에는 쓰기 포트가 없고, `menuQuery`로 위장하지 않는다(EV INTEGRATION.md). 플랫폼 안 1차 범위는 읽기(뷰어·재생)이고, 쓰기 계약은 별도 ADR로 정한다.

## Considered Options

- **(A) EV ADR-0001 유지 — EV가 입력 타입을 내고 플랫폼 메뉴가 맞춤**: EV가 플랫폼과 완전히 독립된다. 대신 플랫폼에 들어오는 두 번째 모듈(FeedbackOps·사내 메뉴)이 저마다 다른 입력 타입을 내 호스트 쪽 변환 코드가 모듈 수만큼 생긴다. "플랫폼 탑재가 기본"이라는 정정과 무게중심이 반대다.
- **(B, 제안) 플랫폼이 `@ap/contracts`로 호스트 계약을 내고 EV `platform-adapter`만 의존**: 호스트 계약이 하나로 모이고, 다음 모듈도 같은 계약에 붙는다. EV 도메인·렌더러의 플랫폼 무의존은 유지된다. 대신 EV 저장소의 한 패키지가 플랫폼 패키지를 소비하므로 그 패키지의 빌드·버전 공급 경로가 필요하다(아래 결과).
- **(C) EV 화면을 플랫폼 메뉴 패키지에 직접 구현**: EV ADR-0001이 이미 기각했다(독립 실행·검증 불가, 같은 코드 두 소유).

## 결과

- EV ADR-0001을 개정해야 한다(EV 저장소 일, 제안 이슈 [EV#70](https://github.com/hjung3113/equipment-visualization/issues/70)). 개정안: "도메인·렌더러 패키지가 정본, 플랫폼 셸이 기본 호스트, `platform-adapter`가 플랫폼 호스트 계약을 구현, Studio는 두 번째 호스트".
- `@ap/contracts`에 호스트 계약(모듈 manifest의 React 무의존 부분과 호스트 서비스 포트)을 더하는 일이 생긴다. 모양은 [플랫폼 탑재 설계](../integration/platform-hosting-design.md) §2, 추적은 [#402](https://github.com/hjung3113/analytics-platform/issues/402).
- `platform-adapter`가 `@ap/contracts`를 얻는 경로가 필요하다: 플랫폼 workspace 안에서는 `workspace:*`로 풀리지만 EV 단독 CI에서는 풀리지 않는다. 1차는 EV CI가 이 패키지를 제외하고 플랫폼 CI가 검사하며, `@ap/contracts` 배포(통합 계획 단계 4) 뒤 peer 의존으로 바꾼다.
- #332의 편입 방식(서브모듈 고정 + `@eqv/*`만 workspace)과 #333–#335는 그대로 이 결정 위에서 진행한다. 시간 정밀도(EV#44)는 #334 어댑터 전에 정한다.
