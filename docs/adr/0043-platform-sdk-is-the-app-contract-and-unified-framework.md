# 플랫폼 SDK는 플랫폼에 올릴 앱이 따르는 계약이고, 세 제품의 프레임워크를 모두 덮는 하나의 플랫폼 프레임워크로 제공한다

상태: **Decided (2026-10-19) — 목표.** 구조·패키지 이름·추출 순서는 Candidate, 구현은 착수(사용자 2026-10-19: 각 프로젝트가 따로 프레임워크를 키워 차이가 벌어지기 전에 시작한다 — [#396](https://github.com/hjung3113/analytics-platform/issues/396) §8 착수 증거를 기다리지 않음, 범위는 첫 슬라이스에서 정함). #396의 목표(2026-10-16, "세 제품이 하나의 공유 SDK를 소비하고 각 제품은 독립 실행도 할 수 있어야 한다")를 대체한다.
- 결정자: 사용자 — 2026-10-19. "플랫폼위에 올릴 앱들이 지켜야할 sdk에 가깝지 않나? 같이 쓰는 sdk라기보단", "따로 앱으로 돌리는건 그 프로젝트 책임이지 이 sdk책임이 아님", "지금 세 프로젝트에서 쓴 프레임워크들을 통합(모두 커버되도록) 해서 하나의 프레임워크로 sdk가 제공해야함. 프레임워크 이름은 platform쪽으로 맞추는게 좋을듯", "sdk의 플랫폼 [프레임워크]를 각 프로젝트가 소비하는거야 의존방향은", "이제는 sdk를 만든단건 플랫폼이 결정하는거지 feedbackops에서 플랫폼으로 발전시킨 방향은 맞지만 이제는 플랫폼 소유야"(디자인 시스템 원본).

#396은 SDK를 세 제품(analytics-platform·FeedbackOps·equipment-visualization)이 함께 소비하는 배포 단위로 정의했다. 원본은 기능마다 세 레포의 구현을 비교해 고르고(§3), 각 제품이 독립 실행과 플랫폼 실행을 모두 할 수 있게 하는 것(§5)이 목표에 들어 있었다. 이 정의에서는 SDK의 주인이 분명하지 않고, 독립 실행 호스트까지 SDK가 책임지게 된다. 레포 목적("메뉴들이 얹힐 플랫폼", 루트 AGENTS.md)과 호스트 → 모듈 계약 초안([ADR-0038](0038-host-module-contract-and-feedbackops-mounting.md)·[ADR-0039](0039-equipment-visualization-platform-first-host-contract.md))은 이미 플랫폼을 호스트로 보고 있었다.

## 결정

- **SDK는 플랫폼에 올릴 앱이 지켜야 할 계약이다.** 앱이 선언할 것(화면 manifest·권한·경로·계약 버전·필수 기능), 호스트가 주는 것(세션·Context·내비게이션·알림 등 호스트 포트), 지킬 규칙(URL·수명주기·오류), 적합성 검사가 SDK의 중심이다. 계약 내용의 초안은 [ADR-0038](0038-host-module-contract-and-feedbackops-mounting.md)·[플랫폼 탑재 설계](../integration/platform-hosting-design.md) §2다(Proposed). FeedbackOps·equipment-visualization은 공동 소유자가 아니라 SDK를 소비하는 첫 제품이고, 다음은 사내 팀이 새로 만드는 앱이다. 어느 제품 화면을 플랫폼 셸에 올릴지는 따로 정한다: EV는 플랫폼 탑재가 기본(ADR-0039 방향)이고, FeedbackOps는 ADR-0038(Proposed)이 정할 때까지 [ADR-0027](0027-feedbackops-stays-standalone-entry-links.md)(독립 앱 + 진입 링크)이 유효하다.
- **SDK는 플랫폼이 소유하고, 하나의 프레임워크로 제공한다.** 세 제품이 지금 쓰는 프레임워크가 하는 일을 모두 덮어서, 앱이 자기 프레임워크 없이 SDK만으로 플랫폼에 올라올 수 있어야 한다. 다른 제품에 더 성숙한 조각이 있으면 플랫폼 프레임워크로 흡수한다. 레포끼리 원본을 나눠 갖지 않는다.
- **디자인 시스템 결정도 플랫폼 소유다.** 토큰·primitive 모양·크기·상태 같은 디자인 시스템 결정의 원본은 플랫폼(SDK)이다. FeedbackOps 디자인 시스템은 플랫폼으로 발전시킨 출발점이고, 지금 값이 SDK의 초기값이 된다.
- **의존 방향은 SDK ← 제품 하나뿐이다.** FeedbackOps·equipment-visualization·analytics-platform 앱과 사내 앱이 SDK의 플랫폼 프레임워크를 소비한다. SDK는 어떤 제품 저장소의 패키지도 import하지 않는다. 그래서 지금 있는 `@ap/ui → @fops/ui` 간선(패키지 경계 §3 규칙 8이 허용)은 목표 구조에서 없어지고, 토큰·primitive 코드는 SDK로 옮겨 FeedbackOps가 SDK에서 받아 쓴다.
- **이름은 플랫폼 쪽에 맞춘다.** SDK 패키지는 플랫폼 접두사 아래에 두고, 흡수한 조각의 개념·API 이름도 플랫폼 용어로 맞춘다(세부 이름은 Candidate). 최종 접두사는 [패키지 경계](../integration/platform-packages.md) §8의 일괄 변경 절차로 바꾸며, 시점은 [통합 계획](../integration/framework-unification-plan.md) Q1 권고대로 배포 단계 직전이다. 그때까지는 `@ap/`다.
- **독립 실행은 SDK 책임이 아니다.** 같은 화면을 플랫폼 밖에서 돌릴지, 그 호스트를 어떻게 만들지는 각 제품이 정하고 책임진다. SDK는 독립 호스트를 제공하거나 검증하지 않는다.

## Considered Options

SDK의 뜻:

- **(A) #396 원안 — 세 제품이 함께 소비하는 공유 SDK, 원본은 기능별로 선정, 독립 실행도 SDK 목표**: 원본이 레포마다 흩어져 SDK의 주인이 없고, 독립 호스트까지 SDK가 떠안는다.
- **(B) 호스트 계약만 SDK로 — 프레임워크는 각 제품이 유지**: 앱마다 자기 프레임워크를 계속 들고 와서 플랫폼 안에 프레임워크가 여러 벌 돈다. 사내 새 앱이 무엇을 써야 하는지도 정해지지 않는다.
- **(C, 채택) 플랫폼 소유 계약 + 세 프레임워크를 덮는 하나의 플랫폼 프레임워크**: 주인과 이름이 하나이고, 앱은 SDK만으로 플랫폼에 올라온다. 대신 다른 제품의 조각을 흡수하는 이전 비용을 플랫폼이 진다.

토큰·primitive의 소유와 배포(통합 계획 Q2):

- **(a) FeedbackOps가 `@fops/ui`를 배포하고 `@ap/ui`가 peer로 의존**: 사용자가 2026-10-17에 골랐던 안([탑재 설계](../integration/platform-hosting-design.md) §0). SDK가 제품 패키지에 의존해 의존 방향 결정과 맞지 않는다.
- **(b, 채택) 코드를 플랫폼 SDK로 옮기고 플랫폼이 배포**: 의존이 한 방향이 된다. 비용은 둘이다 — FeedbackOps의 픽셀 게이트가 지금 원본 쪽(FeedbackOps 저장소)에 있어 SDK로 같이 옮겨야 하고, FeedbackOps가 SDK에서 받아 쓰려면 SDK 배포가 먼저라 그 사이 두 벌이 생기지 않게 이전 순서를 짜야 한다.
- **(c) 서브모듈 유지**: SDK 소비자마다 FeedbackOps 서브모듈이 생긴다.

## 결과

- **코드를 옮기기 전까지는 지금 규칙을 그대로 따른다.** 06 §13, [ADR-0010](0010-feedbackops-design-system-shared-on-tailwind-v4.md)·[ADR-0011](0011-design-direction-feedbackops-shell.md)·[ADR-0023](0023-feedbackops-primitive-shapes-and-sizes.md), [`packages/ui/AGENTS.md`](../../packages/sdk/ui/AGENTS.md)대로 `@ap/ui`는 `@fops/ui`를 재수출하고, primitive 변경은 FeedbackOps에 제안한다. 이 문서들의 "원본은 FeedbackOps" 서술은 소유 방향만 바뀌었다는 표시를 달고, 본문은 코드 이전 이슈에서 고친다. 이전 이슈는 SDK 첫 슬라이스에서 연다.
- #396 본문의 제목·목표와 ADR-0043과 어긋나는 절(§2 상위집합 전제, §3 기능별 원본 선정, §5·§6 두 조립 진입점, §7 두 호스트 공통 구현, §8·§10 독립 실행 조건, §9 primitive 소유, §11 대안 판정, §12 Open)을 이 ADR에 맞춘다. §7 안전 조건과 §8 착수 증거는 플랫폼 실행에 대해서만 그대로 둔다.
- [프레임워크 통합 계획](../integration/framework-unification-plan.md)과 [플랫폼 탑재 설계](../integration/platform-hosting-design.md)의 어긋나는 서술은 각 문서 머리말에서 이 ADR이 우선한다고 표시한다. 세 프레임워크가 하는 일을 SDK가 다 덮는지 확인하는 **포괄 목록**(통합 계획 §2·§3 지도에서 출발)이 다음 설계 산출물이다(Open, [보드](../../.planning/README.md)).
- 호스트 → 모듈 계약(ADR-0038·0039, 탑재 설계 §2)은 SDK의 중심으로 남는다. 다만 탑재 설계 §4의 "모듈 패키지는 `@ap/contracts`만 import"와 `@fops/ui` 배포·peer 행은 "앱이 SDK 프레임워크를 소비한다"와 맞지 않으므로 SDK 배포 단위를 설계할 때 다시 정한다(Open).
