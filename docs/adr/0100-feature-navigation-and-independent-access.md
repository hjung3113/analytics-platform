# 기능 내비게이션: 운영 콘솔 하나와 내 활동, 독립 접근 권한

상태: **Decided (2026-10-29)** — 구현은 #1099 노드 c([#1099](https://github.com/hjung3113/analytics-platform/issues/1099))가 이행한다. [ADR-0097](0097-platform-features-and-role-based-names.md)을 보충한다(식별자·권한 이름·별칭 없음 원칙은 그대로).
- 결정자: 사용자 — 실제 앱 프로토타입 [Artifact](https://claude.ai/artifact/EsmZqGJNyhWq1UiL3LYJVf)에서 **B안**을 골랐고([#1099 결정 댓글](https://github.com/hjung3113/analytics-platform/issues/1099#issuecomment-6472960513)), F/C 분리 유지와 Astra 검토의 필수 변경(B-01·02·03·04·07·08)·채택 항목(이름·순서 B-05/06, 카드 설명 B-09, 복귀 수명 Q4)을 받아들였다.
- 코디네이터(사용자 위임, 되돌릴 수 있음): 아래 「세부 선택」 — 메뉴 id 충돌 처리, 슬롯이 현재 메뉴로 고르는 방식, 내 Task 범위 선택의 자리. 이유는 새 grant·새 저장소·새 provider 없이 이미 병합된 carry set·AND 권한을 그대로 쓰기 위해서다.

ADR-0097이 FeedbackOps 제품 이름을 걷어낸 뒤에도 사이드바에는 FeedbackOps 업무 시스템 행이 남아 있었고, 사용자 기능(내 Task)과 운영 화면이 한 곳에 섞여 있었다. 운영자는 업무 시스템마다 같은 기능으로 들어가고, 일반 사용자는 자기 일을 한곳에서 본다.

## 결정

**B안:** 개인 업무는 전역 `내 활동`, 운영 화면은 하나뿐인 `운영 콘솔`로 둔다.

1. **FeedbackOps 업무 시스템 행을 없앤다.** 공간 id `feedbackops`와 그 옛 주소·권한·export 별칭을 두지 않는다. 사라진 공간의 저장 상태(마지막 화면·즐겨찾기·최근)는 다른 기능으로 옮기지 않고 기존 유효성 검사가 걸러낸다. 모든 업무 시스템은 사이드바 아래에 직접 기능 항목(VOC·Task·설문)과 검증된 출발지 복귀 줄을 그대로 둔다.
2. **운영 콘솔 하나, 공통 F/C 권한 없음.** 공간 `operations`는 권한이 없고, 열 수 있는 멤버 메뉴가 하나라도 있는 사람에게만 보인다. 진입은 마지막 화면 → 열 수 있는 대시보드 홈(`dashboard`) → 첫 열 수 있는 메뉴다. 접근 판정은 서버가 요청마다 한다.
3. **F와 C는 독립이다.** F=`features:access`, C=`console:access`. 새 grant·역할 배정·합성 권한을 만들지 않는다(ADR-0097).

| 대상 | 필요 권한 |
| --- | --- |
| VOC · Finding · Task 관리 · 설문 관리 · 대시보드 · 연동 | F |
| 기능 관리 (Managed System·Analytics Area·권한 요청 검토·부여 목록·설정) | F **그리고** C (`additionalPermissions`, #1099a) |
| 플랫폼 관리 (권한·감사·활용률·레지스트리) | C |
| 내 Task (전역) | F — C 불필요 |
| 내 VOC | 기존 `voc:view` |
| 응답 설문 | 기존 `platform:view` |

F만, C만, 둘 다, 둘 다 아님, 개인 메뉴만 가진 경우가 모두 성립한다. C만 가진 사람의 진입은 첫 열 수 있는 `플랫폼 관리` 메뉴다.

4. **이름과 순서.** 운영 콘솔 섹션은 `VOC → Finding → Task 관리 → 설문 관리 → 대시보드 → 연동 → 기능 관리 → 플랫폼 관리`다(그룹 id `voc`·`findings`·`tasks`·`surveys`·`dashboard`·`integration`·`featureAdmin`·`admin`). `내 활동`은 정확히 `알림 → 내 VOC → 내 Task → 응답 설문 → 권한 요청` 다섯이고 홈·사이드바·전환기가 같은 이름과 순서를 쓴다. 여섯째 개인 항목도, 새 그룹도 두지 않는다.
5. **내 Task는 전역 `/my-tasks`로 옮긴다.** 화면 구현은 Task Consumer(`@ap/menu-tasks`)에 두고, 앱 조립이 전역 그룹 배치와 순서를 정한다(Consumer끼리 import하지 않는다). `my-tasks`는 앱 예약 루트다. 기능 메뉴 id는 ADR-0097대로 `fo-`를 뗀 값이고 정규 경로는 `/operations/<메뉴 id>`다. 옛 경로·별칭은 없다.
6. **목록 범위(managedSystem)는 기능이 선언한 자리에서만 보인다.** 사이드바 `목록 범위`·카운트·저장된 보기 슬롯은 공간이 아니라 **현재 메뉴**(공간 id + 현재 route의 메뉴)로 소비자가 고른다. 플랫폼 관리(C만)는 운영 기능 세션·provider·질의를 마운트하지 않는다. 기능 관리는 비활성 설명과 자기 필터(Analytics Area의 `system`)를 유지한다. 내 Task는 사이드바 없이 **자기 페이지 필터 영역**에 기존 Managed System 선택기를 `목록 범위`로 두고 현재 값과 `전체` 해제를 보인다(새 상태·저장소 없음, 같은 `managedSystem` 페이지 키).

### 맥락·진입·복귀 경계

`managedSystem`은 기능 페이지 키이며 업무 시스템 id·분석 Context·데이터 Scope와 다르다. carry set `features`(`['managedSystem','returnTo']`, #1099b)의 멤버는 모든 운영 기능 메뉴, 기능 관리 메뉴, 전역 내 Task이고 플랫폼 관리는 멤버가 아니다. 사이드바·레일·팔레트·화면 링크·직접 슬롯은 같은 리졸버 정책을 쓴다: 같은 세트 안에서 키를 이어받고, 명시적 page 값은 이기며 `null`은 지운다. 첫 번째로 채택한 출발지(`returnTo`)는 내부 링크로 보존하고, 홈·다른 업무 시스템·범위 없는 콘솔 진입은 흐름을 끝낸다. 개인 메뉴의 일반 진입은 다른 곳의 선택을 빌리지 않는다. 규칙 본문은 [06 §6.4·§9.1·§22](../contract/kernel.md)와 [cross-menu-links](../contract/cross-menu-links.md)에 있다.

### 상태 구분

화면은 접근 불가(`no access`), 허용되었지만 비어 있음(`allowed empty`), 필터로 비어 있음(`filtered empty`), 요청 실패(`request failed`)를 구분한다. 요청 오류를 0행으로 바꾸거나 개수를 지어내지 않고, 접근 가능한 개인 메뉴는 접근 가능한 업무 시스템이 없어도 남는다. mock의 `실서버 필요`는 빈 상태나 권한의 증거가 아니다.

## 대안

실제 앱 프로토타입으로 비교한 세 안이다(비교와 선택 기록은 [#1099](https://github.com/hjung3113/analytics-platform/issues/1099), 실제 앱 B Artifact는 위 결정자 줄).

- **A — 플랫폼 공통 업무 시스템:** 기능 화면을 어느 업무 시스템에도 속하지 않는 공통 공간 하나에 둔다. kernel §9.1이 지금 플랫폼 업무 시스템을 제외하므로 그 규칙을 먼저 바꾸는 결정이 필요하다. 사용자가 고르지 않았다.
- **B — 내 활동 / 운영 콘솔 분리(선택):** 위 결정. 개인 업무와 운영 화면을 갈라 이름·순서를 하나로 맞춘다. 내 Task의 범위 선택기를 페이지가 따로 그려야 하고, 프로토타입의 결함(콘솔 전체 단일 권한, 플랫폼 관리에도 기능 컨트롤, 직접 기능 항목 제거, 내 Task 범위 없음, 잘못된 순서)은 가져오지 않는다.
- **C — 상단 셸 기능 진입:** 기능 진입을 상단 셸로 올린다. 기능별 목록 범위·내비게이션 카운트·저장된 보기·이어받는 page key·팔레트 항목·안전한 복귀 경로를 모두 보존해야 하는데 임시 전역 배선에는 없었다. 사용자가 고르지 않았다.

속도 이점은 측정하지 않았고 주장하지 않는다.

## 세부 선택 (되돌릴 수 있음)

- 메뉴 id 충돌: 단순히 `fo-`를 떼면 개인 메뉴 `surveys`·`permission-requests`와 겹치는 둘은 `survey-management`(운영 `Survey 관리`)와 `permission-request-review`(권한 요청 검토)로 한다. 하위 `parent`·링크 표·테스트도 같은 값이다.
- 기존 `ScopeControl`·`NavCounts`·`SpaceNavSection` 슬롯의 `For`는 `(spaceId, 현재 메뉴 | null)`을 받는다. 이 타입에 기능 이름은 들어가지 않는다.
- generic 그룹 불변식: 패키지 하나는 공간 그룹 하나만 소유하지만 전역 그룹에 화면을 선언할 수 있고(내 Task), 전역 그룹은 여러 패키지가 받을 수 있다.

## 이전 결정과의 관계 (부분 대체)

본문은 원문 그대로 둔다. 이 ADR이 아래 규칙만 대체한다.

| 이전 | 대체되는 부분 |
| --- | --- |
| [ADR-0028](0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md) | FeedbackOps를 별도 업무 시스템 행·`features:access` 입장 공간으로 두는 배치 |
| [ADR-0070](0070-global-features-platform-menu-and-voc-drawer.md) | 내 Task가 FeedbackOps 공간에 있다는 배치와 `내 활동` 구성(다섯 항목·이름·순서) |
| [ADR-0081](0081-feedbackops-operator-screens-platform-frame.md) | 운영 화면이 FeedbackOps 공간의 그룹이라는 배치, 결정 4의 사이드바 `목록 범위`를 공간 단위로 켜는 규칙(이미 #1099b가 carry 선언을 대체) |
| [kernel §9.1](../contract/kernel.md#91-업무-시스템-decided-2026-09-26) | FeedbackOps 업무 시스템 항목과 공간이 슬롯을 켠다는 서술 |

추가 근거: 사용자 결정 [#1099](https://github.com/hjung3113/analytics-platform/issues/1099), 실제 앱 B Artifact `EsmZqGJNyhWq1UiL3LYJVf`. 건드리지 않는 것: 인프라·API 프록시·환경·DB(#1100), 문서 트리 이동(#1101), lint 엔진(#1102).
