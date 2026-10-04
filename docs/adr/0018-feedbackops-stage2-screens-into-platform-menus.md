# FeedbackOps 2단계 편입은 화면을 플랫폼 메뉴로 옮기고 백엔드는 도메인 API로 유지한다 (A안)

상태: **Decided (2026-10-04)**.
- 결정자: 사용자 — FeedbackOps를 피드백 공간으로 완전 편입하는 깊이를 A(화면 이전 + 백엔드 유지) / B(앱 통째로 셸 안에 마운트) / C(백엔드까지 플랫폼 백엔드로 재작성) 중 A로 정했다(#213). 착수는 M2 마무리·main 릴리스 뒤다.

단계 계획(1단계 연결 → 2단계 셸 편입)과 피드백 공간의 범위는 [저장소 연결 — 통합 방식](../integration/repository-layout.md#feedbackops-통합-방식-decided-2026-09-26)과 [06 §9.1](../06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26)이 소유한다. 진행 계획과 남은 결정은 [#213](https://github.com/hjung3113/analytics-platform/issues/213)에 있다. 이 ADR은 결정과 이유만 둔다.

1단계(딥링크, 내 VOC·설문 읽기, 디자인 공유)는 대부분 끝났다. M2에서 플랫폼이 FeedbackOps 토큰·컴포넌트·셸 구조를 직접 쓰게 되어(ADR-0010·0011·0013) 화면을 옮기는 비용이 크게 줄었다. 남은 질문은 FeedbackOps를 어느 깊이로 합치느냐였다. FeedbackOps는 Fastify + Drizzle + Postgres 백엔드에 VOC·Finding·Task Request/Task·Milestone·설문·알림 모듈과 모듈별 권한 확인, 보고자 상태와 내부 상태를 자동 연결하지 않는 규칙(FeedbackOps ADR-0005)을 이미 갖고 있다.

## 결정

- **FeedbackOps 화면은 플랫폼 메뉴 패키지(`menus/feedback-*`)로 옮긴다.** 피드백 공간의 그룹·메뉴는 Registry로 선언하고, 전역 Context·딥링크·권한 노출·Audit 같은 플랫폼 계약 위에 올린다.
- **FeedbackOps 백엔드는 도메인 API 서비스로 유지한다.** 도메인 규칙(상태 분리, entity link, 모듈별 권한 확인)은 그쪽이 계속 소유한다. 플랫폼은 메뉴 조회·변경 포트로 그 API를 부른다.
- 이 결정 전에 정해 둔 원칙은 그대로다: 인증 방식과 Scope↔Managed System 관계가 정해지기 전에는 FeedbackOps 코드를 플랫폼 계약에 맞춰 소급 수정하지 않는다.

## Considered Options

- **(A, 채택) 화면 이전 + 백엔드 유지**: 검증된 도메인 로직과 테스트를 살리면서 화면은 플랫폼 계약(Registry·Context·권한) 위에 올린다. 메뉴 조회 포트에 쓰기 계약이 필요하고, 화면을 메뉴별로 단계적으로 옮겨야 한다.
- **(B) 앱 통째로 마운트**: 가장 빠르다. 셸이 이중이 되고 FeedbackOps 라우터의 URL·Context가 플랫폼 계약과 충돌해, 메뉴 간 연결·권한 노출을 플랫폼이 보장할 수 없다.
- **(C) 백엔드까지 재작성**: 백엔드가 하나가 되지만 사실상 재작성이다. Fastify 도메인 모듈과 테스트를 플랫폼 백엔드(FastAPI 예정)로 다시 만들어야 하고 그동안 원본 개발과 갈라진다.

## 결과

- 착수 때 남은 결정(Scope↔Managed System 관계, 세션 공유 방식 — 사내 SSO #150 의존, 권한 매핑, 피드백 공간 메뉴 구성, 독립 FeedbackOps 앱 존속, 알림·감사 통합)을 `ready-for-human` 이슈로 나눈다.
- 결정 없이 가능한 플랫폼 선행은 메뉴 조회 포트의 쓰기(변경) 계약, 작업 보드용 Workflow 레이아웃(06 §12), 셸 알림 슬롯이다.
- 메뉴 화면을 여러 개 연속으로 옮기므로 착수 때 범위를 다시 확인한다(루트 AGENTS.md). 프로토타입(피드백 공간 셸 + 대표 화면)을 먼저 컨펌받는다.
