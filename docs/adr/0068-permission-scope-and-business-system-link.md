# ADR-0068 — 권한은 FeedbackOps 부여 체계 하나로 업무 시스템까지 넓히고, Managed System은 공간에 연결만 한다

- Status: Decided (2026-10-22) — 코디네이터 결정, 사용자가 위임("opus high에게 한번 리뷰받고 결정해", 2026-10-21). 되돌릴 수 있다.
- Scope: [#596](https://github.com/hjung3113/analytics-platform/issues/596), 지도 [#598](https://github.com/hjung3113/analytics-platform/issues/598), [ADR-0066](0066-feedbackops-merges-into-platform.md) 결정 7. 선택지 정리와 근거: [#596 코멘트](https://github.com/hjung3113/analytics-platform/issues/596)와 그 [아티팩트](https://claude.ai/artifact/VX761Mk5ogrCDfPjZbGFgZ). 독립 검토(Opus high, 2026-10-22): 세 질문 모두 "조건부 동의". 아래 조건은 그 검토에서 나왔다.
- Amends: [ADR-0045](0045-feedbackops-entry-link-mapping-and-scope.md) 결정 1(매핑 원천을 앱 정적 표에서 서버 연결 표로 바꾼다. 서버가 생기기 전까지는 정적 표 그대로).

## 맥락

ADR-0066은 권한 관리를 플랫폼 업무 시스템 단위까지 넓히기로 했다. 남은 질문은 셋이었다. ① Managed System과 업무 시스템(공간)의 관계, ② 역할·부여 모델, ③ 관리 화면을 어디에 둘지. 플랫폼에는 아직 실서버가 없고, 실서버는 FeedbackOps 백엔드에서 출발한다(ADR-0066 결정 6). FeedbackOps에는 이미 부여·거부·요청·승인·만료·회수 흐름이 있다(FeedbackOps ADR-0044·0061·0066).

## 결정

1. **Managed System과 업무 시스템은 레지스트리를 둘로 두고 연결만 한다(1-C).**
   - 데이터 이전은 없다. 두 용어집 모두 둘을 1:1로 가정하지 말라고 적어 두었다.
   - 연결 방향은 공간 → Managed System이다. ADR-0045의 정적 표와 같은 방향이다.
   - 서버에서는 `(workspace_id, space_id)`를 키로 하는 연결 표(→ `managed_system_id`)로 두고, managed-systems 모듈이 소유한다.
   - 공간 둘이 같은 Managed System을 가리키는 것은 허용한다.
   - **불변식: 연결은 기본값과 이동에만 쓰이고 권한을 주지 않는다.** 공간에 들어갈 권한과 Managed System 범위 권한은 서로를 내포하지 않는다.
2. **역할·부여는 FeedbackOps 부여 체계 하나로 합친다(2-B).**
   - FeedbackOps Role Level은 유지한다.
   - 플랫폼 권한은 FeedbackOps Capability 어휘로 합친다. 어휘 원천은 하나다: FeedbackOps capability 목록과 `@ap/contracts` `PERMISSIONS`를 계약 테스트로 묶는다.
   - 부여 범위에 업무 시스템을 더한다. **출시 조건:**
     - 범위는 구분자 `scope_kind`와 kind별 열 CHECK로 표현한다.
     - 범위 종류는 지금 `managed_system | space | site | site_room`으로 정하고, 구현은 `managed_system`·`space`만 한다. site·room 부여는 별도 저장소를 만들지 않고 이 체계에 들어온다(#98).
     - 판정, 유효 권한 계산, 부여 목록, 활성 unique 인덱스를 한 변경으로 고친다.
     - kind마다 "다른 범위로 새지 않음"을 증명하는 경로 수준 테스트를 넣는다.
     - 이유: 지금 판정은 `managed_system_id IS NULL`을 workspace 전체로 읽는다. 범위 열 하나만 더하면 공간 범위 부여가 workspace 전체 부여로 판정된다.
   - 부여·거부·역할 쓰기는 모두 세션 세대(`sessionVersion`)를 바꾼다.
   - 역할 변경 경로를 새로 만들 때는 sensitive 감사를 붙인다. IdP 그룹 대응은 #150 뒤 새 ADR에서 정한다.
   - Admin 승인은 workspace 수준을 유지하고, 시스템별 승인자는 두지 않는다.
   - Line은 부여 축이 아니다(ADR-0005).
3. **관리 화면은 최종적으로 3-B로 두되, 합류 단계 1–4 동안은 지금 화면을 그대로 옮긴다.**
   - 권한 요청 승인과 부여·거부 목록은 운영 콘솔로 간다. 이 이전은 결정 2의 스키마가 들어간 뒤 따로 한다.
   - Managed System Registry, Managed System 기본값, 공간 연결, Analytics Area는 `피드백 운영` 시스템 설정에 둔다.
   - Analytics Area는 메뉴 Registry에서 자동 생성하지 않는다. 메뉴 id는 선택해서 연결하는 메타데이터다. FeedbackOps 카탈로그가 원본이라는 불변식을 그대로 따른다.
   - **누출 조건:** 콘솔에 들어갈 수 있다(`console:access`)고 승인 권한이 생기지 않는다. 승인 동작은 서버가 트랜잭션 안에서 `workspace.admin`을 다시 확인한다. `console:access`를 사람별로 부여할 수 있게 하기 전에, 전역 감사 범위 필터(#91)와 FeedbackOps 감사 상세의 노출 범위(합류 설계 O16)를 먼저 닫는다.

## Considered Options

- **1-A 레지스트리 하나(1:1):** 두 용어집이 금지한 가정이고, 데이터를 옮겨야 한다.
- **1-B 업무 시스템 아래 Managed System 여럿:** 지금 쓰는 사례가 없다. 1-C 연결 표의 키를 `(space_id, ms_id)`로 넓히면 나중에 갈 수 있다.
- **2-A 역할만 맞춘다:** 사람별 부여를 할 수 없어 ADR-0066 결정 7을 채우지 못한다.
- **2-C 플랫폼 새 권한 모델로 다시 만든다:** FeedbackOps 판정 10여 곳을 다시 써야 하고, 화면을 옮기기만 하고 다시 쓰지 않는다는 ADR-0066 결정 4와 부딪힌다.
- **3-A 모두 운영 콘솔 / 3-C 모두 피드백 운영:** 3-A는 FeedbackOps 도메인 설정까지 콘솔로 끌어온다. 3-C는 부여가 하나로 합쳐진 뒤에도 승인이 두 곳에 남는다. 3-C는 전환 기간의 모양으로만 쓴다.

## 결과

- [합류 설계](../integration/feedbackops-merge-design.md) §3.3·§5가 이 결정을 반영한다. 출시 조건은 #593(실서버)과 권한 스키마 이슈의 브리프에 그대로 옮긴다.
- 실서버 체크리스트의 "#98 전 부여·회수 쓰기 없음"(합류 설계 O18)은 결정 2를 구현할 때 함께 고친다.
- ADR-0045 결정 1은 서버 연결 표가 생길 때 대체된다. 그 전까지 정적 표가 원천이다.
