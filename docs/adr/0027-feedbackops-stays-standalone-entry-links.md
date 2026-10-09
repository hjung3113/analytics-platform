# FeedbackOps 화면은 옮기지 않고, 업무 공간에는 그 시스템으로 좁힌 진입 링크만 둔다

상태: **Decided (2026-10-09)**. [ADR-0018](0018-feedbackops-stage2-screens-into-platform-menus.md)의 통합 깊이(화면을 플랫폼 메뉴로 이전)를 대체하고, [ADR-0026](0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)의 협업 진입·전체 허브를 링크로 좁힌다. 진입이 사이드바의 어디에 놓이는지는 #250 시안 컨펌으로 정한다.
- 결정자: 사용자 — #250 셸 시안을 보다가 정했다. VOC → Evidence → Finding → Task로 이어지는 흐름을 업무 시스템마다 구현하는 대신 FeedbackOps가 전담하고, 나머지 시스템은 거기에 연결되는 진입점만 갖는다.

ADR-0018은 FeedbackOps 화면을 플랫폼 메뉴 패키지로 옮기고 백엔드만 도메인 API로 남기기로 했다. ADR-0026은 그 화면이 놓일 자리를 업무 공간마다의 협업 진입과 권한자용 전체 허브로 정했다. 업무 시스템이 넷(생산성 분석, 지표관리, 표준 로그 개발, 개선 실행)으로 늘면서, VOC → Evidence → Finding → Task Request/Task로 이어지는 FeedbackOps 흐름과 그 권한·상태 규칙을 플랫폼 화면으로 다시 만들어 시스템마다 붙이는 비용이 커졌다. 같은 흐름이 FeedbackOps 저장소에서 계속 개발되고 있어, 옮기면 화면이 두 벌이 된다.

## 결정

- **FeedbackOps 화면을 플랫폼으로 옮기지 않는다.** FeedbackOps는 독립 앱으로 남아 VOC·Evidence·Finding·Task Request/Task·Milestone·설문 흐름과 그 권한·상태 규칙을 전담한다. `menus/feedback-*` 이전 계획은 없앤다.
- **업무 공간의 협업 진입은 FeedbackOps 링크다.** 각 공간 사이드바에 그 시스템의 Managed System으로 좁힌 진입(VOC 등록, VOC, Task, 설문)을 두고, FeedbackOps를 새 탭으로 연다. 공간에 대응하는 Managed System 매핑이 없으면 진입을 그리지 않는다 — 시스템 범위 없이 열면 다른 시스템의 요청이 보이기 때문이다.
- **전체 협업 허브는 FeedbackOps 자체 화면이다.** 플랫폼은 허브 화면을 만들지 않고, 시스템 범위 없는 FeedbackOps 진입 링크 하나를 둔다. 링크를 누구에게 보일지는 플랫폼 권한(Candidate)이고, 실제로 무엇을 볼 수 있는지는 FeedbackOps가 판정한다.
- **1단계 연결은 그대로다.** 플랫폼 안의 사용자용 읽기 화면(내 VOC, 설문 응답 이력)과 분석 화면의 딥링크는 [저장소 연결](../integration/repository-layout.md#feedbackops-통합-방식-decided-2026-09-26)의 규칙을 따른다.

## Considered Options

- **(채택) FeedbackOps 유지 + 시스템별 진입 링크**: 화면 이전이 없고, 협업 흐름의 원본이 하나로 남는다. 대신 앱을 넘나든다(새 탭). FeedbackOps 화면에는 플랫폼의 전역 Context·Audit·메뉴 계측이 적용되지 않고, 플랫폼으로 돌아오는 복귀는 FeedbackOps 쪽 파라미터가 생겨야 매끄럽다.
- **ADR-0018 A안(화면 이전 + 백엔드 유지)**: 같은 셸 안에서 이동하고 플랫폼 계약이 모두 적용된다. 협업 흐름을 메뉴별로 단계적으로 다시 만들어야 하고(2026-09-26 추정 4~8주), 원본 화면과 갈라진다.
- **앱 통째로 셸 안에 마운트(ADR-0018 B안)**: 셸이 이중이 되고 URL·Context가 플랫폼 계약과 충돌한다. ADR-0018에서 이미 기각했다.

## 결과

- 링크 계약을 넓힌다: 지금 `buildFeedbackOpsLink`(`packages/contracts/src/feedbackops-link.ts`)는 VOC 등록·VOC 상세·설문 상세만 만든다. 시스템별 목록 진입(VOC 목록·Task·설문 목록 + `managedSystem`)과 범위 없는 허브 진입을 [딥링크 계약](../integration/feedbackops-deeplink.md)에 더한다. FeedbackOps 프런트엔드는 범위를 지원하는 화면에서 URL의 `managedSystem`을 읽는다(설문 응답 화면과 관리 화면 일부는 제외).
- 공간 → Managed System 매핑 표(#81)가 진입의 선행 조건이다. 세션 공유(#150)가 정해지기 전에는 FeedbackOps에서 로그인을 한 번 더 거칠 수 있다.
- FeedbackOps 2단계(#213)는 화면 이전에서 "매핑·링크 계약·진입점"으로 줄어든다. ADR-0018이 남긴 결정 중 독립 앱 존속은 이 결정으로 정해졌고(존속), 권한 매핑·알림·감사 통합·메뉴 조회 포트 쓰기 계약·Workflow 레이아웃은 FeedbackOps 때문에는 필요 없어진다. 다른 소비자가 생기면 그때 다시 본다.
- 계약 원본: [06 §9.1](../06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26), 화면 설계 [15 §6](../15_multi_workspace_ui.md#6-feedbackops-ux-통합), 단계 계획 [저장소 연결](../integration/repository-layout.md#feedbackops-통합-방식-decided-2026-09-26).
