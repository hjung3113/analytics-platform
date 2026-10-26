# 05. 결정 상태

ADR로 따로 남기지 않은 계약 결정의 목록이다. 실제 대안 중에서 고른 결정은 [ADR 목록](adr/README.md)에 있고, 아직 답이 없는 결정과 질문은 [`.planning/README.md`](../.planning/README.md) "결정 대기"와 [`.planning/inputs.md`](../.planning/inputs.md)가 관리한다. 파일명은 링크 호환을 위해 유지한다.

Decided는 계약의 상태이며 구현 완료를 뜻하지 않는다. 각 행의 세부 규칙은 원본 문서가 소유하고, 이 표는 어디에 무엇이 정해져 있는지만 가리킨다.

## 결정 상태

| 결정 | 날짜 | 원본 |
| --- | --- | --- |
| Platform Kernel을 우선하고 메뉴는 공통 계약을 소비한다 | — | [06 §1·§4·§5](06_platform_ui_contract.md) |
| occurrence와 도메인 객체 식별자를 분리하고, URL을 권한 증명으로 쓰지 않는다 | — | [06 §6](06_platform_ui_contract.md#6-context-capability-contract) |
| Context가 바뀌면 이전 결과를 새 조건의 결과로 보이지 않는다 | — | [06 §11](06_platform_ui_contract.md#11-global-context-bar) |
| URL 직렬화(집합 키·공집합·지표 버전 쌍·초 단위 구간), 시간 경계(half-open, 날짜-only, TZ 미확인 대체, 복수 설비 병합 가드, `defaultRangeTo`), URL 계약(세션 우선순위, 버전 `v`, 잘못된 값, 뒤로 가기 복원), 응답 스키마 2층(`outcome` + `assessments[]`) | 2026-09-18 | [06 §6.1·§6.3·§6.4·§19](06_platform_ui_contract.md), 근거 [grilling 기록](reviews/2026-09-18-url-time-status-contract-grilling.md) |
| 실시간성은 폴링(5분) + 세대 기반 캐시 재검증, 파서 DB는 같은 인스턴스·read-only·플랫폼 스키마, 지연 완료는 진행 경계 `R`/창 `H`(=1시간), 창 밖은 정정 후보로 보존. 폴링 중단 조건·워커 감지 주기는 Open, 공개 필드명은 Candidate | 2026-09-22 | [01 데이터 운영 정책](01_architecture_and_data_contract.md#데이터-운영-정책) |
| Scope는 Site → room_name → StGroup → Equipment, 권한·조회는 room_name 기준, Line은 독립 축(Factory 없음). EquipmentID는 전 Site 유일, Site는 DB 연결 경계라 ID 사용 전 확립. Lot과 Job은 다르고 Recipe는 PRC 단계 값 | 2026-09-24 | [GLOSSARY](../GLOSSARY.md), [ADR-0004](adr/0004-site-is-db-partition-not-column.md), [ADR-0005](adr/0005-scope-room-name-line-independent.md) |
| 조직·운영 요구값: 백엔드 FastAPI, on-prem, 동시 사용자 ~100명, 데이터 보존 무제한, 1개 Site/Line으로 시작하되 확장 가능, v1 Scope 단일 선택, TZ Asia/Seoul 단일값으로 시작 | 2026-09-22 | [03](03_backend_stack.md) |
| 프론트엔드 라이브러리 구성. 코드와 다른 곳 중 Router·Zustand 미도입은 결정 대기, 차트 렌더러는 Canvas([ADR-0021](adr/0021-echarts-canvas-renderer.md)) | 2026-09-25 | [04 기술 스택](04_frontend_ui_ux.md) |
| 목록에서 상세·표 밖으로 갔다 돌아올 때 넓은 표의 가로 스크롤 위치는 복원하지 않는다(AB-5). 결정자: 사용자. 다시 볼 조건: 사내 메뉴 2–3곳에서 넓은 표 가로 위치 복원 요구 | 2026-10-17 | 이 행 |
| 원본 근거(Evidence/Lineage)·원문 로그/설정 파일 drill-through는 defer — 파서 view/mart 조회로 충분, 내부 개발자 메뉴가 필요해질 때 재검토 | 2026-09-22 | 이 행 |
| 딥링크 키 확장(Recipe·PPID·room_name, Equipment Group Condition/Selection 두 층), 기간 프리셋 1일/7일/사용자 지정, 집계 단위 `granularity`(page 소유), 시각화 경계(donut은 분모 있는 비율만, gauge/3D/그라디언트는 근거 있을 때만 예외), 아이콘 Lucide, 폰트 Inter + Pretendard | 2026-09-22·24 | [06 §6.1](06_platform_ui_contract.md#61-식별자와-url-소유-상태-decided), [06 시간 계약](06_platform_ui_contract.md#ctx-time), [06 Decorative Visualization](06_platform_ui_contract.md#decorative-visualization), [ADR-0002](adr/0002-stgroup-materializes-to-equipment-ids.md), [ADR-0011](adr/0011-design-direction-feedbackops-shell.md) |
| 워크스페이스 3개(분석 / 운영 콘솔 / 피드백) — 공간 구성은 2026-10-08 업무 시스템 단위로 개정(ADR-0026), 전환기는 진입 가능한 공간이 2개 이상일 때만, 공간 전환 시 전역 Context 보존. 관리·감사는 운영 콘솔, 분석 공간의 공지·VOC는 사용자용 화면만. 피드백 공간은 두지 않는다 — FeedbackOps는 전역 기능 + `피드백 운영` 업무 시스템으로 합친다([ADR-0066](adr/0066-feedbackops-merges-into-platform.md)) | 2026-09-26, 2026-10-21 | [06 §9.1](06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26) |
| 가공 상태 원천은 적재 워커의 단계별 처리 결과 보고. 가공 실패는 별도 상태 없이 `Processing delayed` + 원인 분류, 보존 기간 밖은 `unknown`. 보고 스키마는 초안, 파서 담당 합의 대기(#37) | 2026-09-26·28 | [06 §19](06_platform_ui_contract.md#19-loading--empty--error-taxonomy), [01 가공 상태 보고](01_architecture_and_data_contract.md#processing-status-report), [상태 기록 스키마 초안](integration/ingest-status-schema.md) |
| FeedbackOps는 단계적으로 통합한다: 1단계 딥링크·사용자용 VOC·설문 읽기(쓰기는 원본 화면 딥링크), 2단계는 화면 이전 없이 공간별 진입 링크 + FeedbackOps 자체 허브 링크(ADR-0027, ADR-0018 대체). 2026-10-21 ADR-0066이 ADR-0027을 대체: FeedbackOps를 플랫폼에 합치고(모두가 쓰는 기능은 전역, 관리자·개발자 화면은 `피드백 운영` 업무 시스템, 독립 앱 은퇴) 진입 링크는 합류 단계 4까지 유지 | 2026-09-26·27, 2026-10-09, 2026-10-21 | [저장소 연결](integration/repository-layout.md#feedbackops-통합-방식-decided-2026-09-26), [ADR-0027](adr/0027-feedbackops-stays-standalone-entry-links.md), [ADR-0066](adr/0066-feedbackops-merges-into-platform.md) |
| 모노레포 패키지 경계: contracts/ui/kernel/components/shell/mock-server + 그룹 단위 `menus/*/*` + `apps/platform-web`, lint는 ESLint, 접두사 `@ap/`(임시). 타입·필드 이름은 Candidate | 2026-09-26 | [패키지 경계](integration/platform-packages.md) |
| 인증은 FeedbackOps 방식(AuthProvider: 개발 Mock + 운영 OIDC 계열, 서버 세션, 권한은 백엔드가 매 요청 재검증) — 실제 IdP 사양은 #150. 운영 콘솔은 '운영 콘솔 접근' 한 역할로 시작. 공간 필드명 `space`(그룹 수 상한 없음, 권장 7개 이하). 시각 회귀는 빌드 CSS selector 비교만 CI | 2026-09-27 | [03](03_backend_stack.md), [06 §9.1](06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26), [tooling](../tooling/AGENTS.md) |
| 실제 시점(epoch·timestamptz)은 wall-clock이 아니다 — `formatInstant`로 보는 사람의 시간대에 맞춰 표시, `formatDateTime`은 naive wall-clock 전용 | 2026-09-28 | [06 §6.3](06_platform_ui_contract.md#ctx-time) |
| 분석 보드 1차 동작: 사용자당 보드 하나·브라우저 저장(`/board?sheet=`), 칸 안 링크는 지원 메뉴면 칸 교체·아니면 본 화면 이동, 상세 슬롯 하나 공유, 보이는 시트만 조회, 열 수 없게 된 칸은 자동 삭제 없음, `features.board` 선언. 서버 저장·공유는 Deferred | 2026-10-19 | [16](16_analysis_board.md), [ADR-0049](adr/0049-analysis-context-belongs-to-a-pane.md) |
| 권한 부여·회수의 원천: room_name 부여·활용률 열람 개별 부여는 플랫폼 메타 DB 소유. 역할 소속 원천은 IdP 그룹 claim 사양까지 결정 대기(#98). 쓰기 포트·화면은 아직 만들지 않는다 | 2026-09-29 | [06 §9.1](06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26) |
| 전역 감사 조회(`auditTrail`)에도 room 권한을 적용한다 — 권한 없는 room 설비의 변경 내용은 보이지 않는다(06 §17 서버 재검증과 같은 원칙). 지금은 콘솔 역할이 하나(모든 room)라 필터를 두지 않고, 일부 room만 가진 콘솔 역할이 생길 때 서버에서 구현한다(#91). 결정자: 사용자 — 에이전트 추천을 따름 | 2026-10-05 | [06 §17](06_platform_ui_contract.md#17-permission-aware-ux-contract) |
| 표 열 너비 조절은 마우스 사용을 가정한다 — 키보드만으로 너비를 바꾸는 대체 수단은 지금 요구하지 않는다(#239). 결정자: 사용자 — "마우스는 다쓰니까 일단 마우스도쓴다가정하고해" | 2026-10-08 | [ADR-0024](adr/0024-table-column-controls-drag-width-pin-in-list.md), [DESIGN 표 규칙](../DESIGN.md) |
| 입력 기준 — Windows 사용자, 키보드와 마우스 함께, 단축키는 잦은 일의 편의로만(키보드 하한은 유지). FeedbackOps와 같은 기준(FeedbackOps 2026-10-11 결정을 #289에서 가져옴). 결정자: 사용자 | 2026-10-12 | [06 §26](06_platform_ui_contract.md#26-accessibility-baseline) |
| 공간 진입 목적지는 마지막 화면 → 열 수 있는 공간 홈 → 그 공간에서 열 수 있는 첫 메뉴(사이드바 순서) | 2026-10-09 | [06 §9.1](06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26) |
| 상세 복귀는 출발 Context를 복원하고 되돌린 Context 항목을 알린다. 현재 Context를 유지하는 이동은 breadcrumb·사이드바다. 결정자: 사용자 — Opus 5.5 high 결정 리뷰에 위임 | 2026-10-13 | [06 §6.4](06_platform_ui_contract.md#64-url-계약-decided-필드명enum-문자열은-candidate) |
| 열 수 없는 returnTo·parent는 다음 열 수 있는 후보(parent → 플랫폼 홈 → 공간 홈 → 비상 `/`)로 넘어가며 숨긴 메뉴 이름을 보이지 않는다. 결정자: 사용자 — Opus 5.5 high 결정 리뷰에 위임 | 2026-10-13 | [06 §22](06_platform_ui_contract.md#22-cross-menu-context-link) |
| 숫자를 보이지 않는 절(지표 상세 정의 등)에는 버전 상태(게시·초안·폐기)와 관계없이 Data Trust를 그리지 않는다. 응답 봉투의 trust는 조회의 신뢰이지 그 절이 말하는 대상의 상태가 아니다. 결정자: 사용자(#299 UX 리뷰) | 2026-10-13 | [06 §18](06_platform_ui_contract.md#18-data-trust-contract) |
| 메뉴 사이 이동(사이드바·레일 링크, 명령 팔레트 선택, 공간 전환, 메뉴 사이 뒤로/앞으로) 뒤 포커스는 새 화면 제목(h1)으로 간다(`arrivalTarget`을 등록한 화면은 예외, 06 §26). 같은 화면 안 상태 변경(필터·정렬·쪽·드릴·상세)과 그 사이의 뒤로/앞으로는 포커스를 옮기지 않는다(#339, 메뉴 사이 뒤로/앞으로는 #356). 결정자: 사용자 — 에이전트 추천을 따름 | 2026-10-14 | [06 §26](06_platform_ui_contract.md#26-accessibility-baseline) |
| 범위 밖 표 페이지는 성공 응답에서 마지막 페이지로 맞추고 URL page는 replace한다. 0건이면 첫 페이지, 실패 응답은 맞추지 않는다(#314). 결정자: 사용자 | 2026-10-15 | [06 §15](06_platform_ui_contract.md#15-platform-data-table-contract) |
| Scope의 단위는 Site다(데이터가 Site별로 나뉘고 사용 권한도 보통 Site 단위). Site 안에서는 부여된 room_name만 보인다. room_name의 화면 이름은 `공정`. 결정자: 사용자 | 2026-10-23 | [GLOSSARY](../GLOSSARY.md), 06 §6.2 정리는 [#714](https://github.com/hjung3113/analytics-platform/issues/714) |
| 드릴 단계 변경 시 page 키 초기화 — `drill.resetKeys`(필드명 Candidate): 단계 키 값을 바꾸는 `setPage`가 선언된 키를 같은 쓰기에서 지운다(#751). 결정자: 에이전트(콘덕터) — 이슈 제안을 따름, 사용자는 진행만 승인 | 2026-10-24 | [06 §6.4](06_platform_ui_contract.md#64-url-계약-decided-필드명enum-문자열은-candidate) |
| 라벨–값 행은 `@ap/ui` `FieldList`+`FieldRow` 한 벌로 둔다. 상세 패널 속성 목록은 `FieldRow layout="detail"`(9rem 라벨 칸·행 구분선·camelCase 접기·`mono`)이고, `@ap/components` `Field`는 한 릴리스 폐기 예고 뒤 지운다. 대안(`Field`를 남기고 `FieldRow`를 줄이기)은 FO·EV가 이미 `FieldList`를 써서 버렸다(#891). 결정자: 에이전트(sdk 흐름) — 팀장 배정 코멘트를 따름 | 2026-10-26 | [변경 기록](integration/sdk-git-tag-consumption.md#변경-기록) |
| 그 밖의 결정(메뉴 조회 포트, 그리드·표·디자인, 활용률 이벤트, 차트 렌더러 등) | 2026-10-01~05 | [ADR 목록](adr/README.md) |

## MVP 지원 환경 — 데스크톱 웹만 (Decided, 2026-09-27)

MVP는 데스크톱 웹 브라우저만 지원한다. 1024px 미만 화면과 터치(coarse pointer) 환경은 MVP 범위 밖이다 — 깨지지 않게 최소 동작만 두고, 전용 레이아웃·모바일 검증은 하지 않는다(표 셀의 44px coarse-pointer 대상은 예외로 이미 있다). 디자인 프로토타입과 시각 검증은 데스크톱 폭(1280px 이상, 기준 1440px)으로 한다. 06 §25와 `DESIGN.md` 레이아웃 규칙의 1024px 미만 항목은 MVP 이후 과제다.

## 메뉴 활용률 계측 (Decided — v1 범위 포함, 2026-09-22 grilling Round 2)

이 계측은 메뉴가 쌓이면 붙이는 부가기능이 아니라 **Platform Kernel 자체의 관측 범위**(Menu Registry가 실제로 어떻게 쓰이는지)다. 06 §24의 반복 확인 기준은 여기 적용되지 않는다.

- **수집 필드**: 식별 필드만 보낸다(menuId·spaceId·경로 패턴·시각·탭 sessionId·dwellMs). 조회조건·필터 **값**은 넣지 않는다 — 필터 사용 신호가 필요해지면 page 키 이름만 더한다([ADR-0020](adr/0020-usage-events-identity-fields-only.md), 2026-09-22의 "조회조건 포함"을 대체).
- **화면 이동 경로(#605)**: 본 화면 `entry`에만 선택 필드 두 개를 더한다. `via`는 닫힌 집합(`sidebar`·`switcher`·`palette`·`board`·`return`·`crossLink`·`drill`·`history`·`direct`·`link`)으로, 이동을 일으킨 쪽(사이드바·레일·전환기·팔레트·보드·복귀 링크)이 `navigate`·`PlatformLink`의 선택 `via`로 표시하고 표시 없는 앱 안 이동은 `link`, 뒤로·앞으로는 `history`다. 이 탭의 첫 entry는 표시가 없으면 `direct`이고 명시한 표시가 있으면 그 표시가 이긴다. `fromMenuId`는 이 탭의 JS 실행 범위에서 바로 앞 본 화면의 메뉴 id이고(플랫폼 홈은 메뉴 `home`), 앞 화면이 메뉴가 아니면(보드·계약 오류 화면) 이 탭의 첫 entry와 같이 `null`이다. 저장하지 않아 새로고침하면 처음부터다. `dwell`과 `source: 'board'` 이벤트에는 두 필드가 없다(서버는 있으면 배치 전체를 거부한다). 경로·Context 값은 보내지 않는다([ADR-0020](adr/0020-usage-events-identity-fields-only.md) 결과 보충). 운영 콘솔의 "다음으로 간 화면" 보기와 메뉴 쪽 `crossLink` 표시는 2부(시안 컨펌 뒤)다.
- **분석 보드 칸 출처**: 보드 칸의 진입·체류는 같은 필드에 선택 필드 `source: 'board'`와 불투명 `stayId`(칸이 열려 있는 한 번의 체류마다 하나, 그 체류의 진입·모든 dwell에 같고 다시 들어오면 새로 만든다)를 더한다(ADR-0049, #496). `source`가 없거나 `'main'`이면 본 화면이고 기존 이벤트와 바이트가 같다. `stayId`는 `source: 'board'`일 때만 허용하며, 그 dwell은 `enteredAt` 대신 (사용자, 세션, 메뉴, source, stayId)로 하나로 합친다 — 같은 시각에 열린 두 칸이 서로를 덮어쓰지 않게 하려는 것이다. 칸 id·Context 값은 보내지 않는다.
- **보존 기간**: 무제한(자동 삭제 없음). 개발자가 필요할 때 수동으로 지울 경로는 둔다.
- **열람 권한**: 개발자·운영자 기본 열람. 그 밖의 계정은 운영자가 개별로 부여할 때만. 서버 재검증 원칙(06 §17)을 따르고 별도 권한 모델을 만들지 않는다.

## Open Questions

미결 질문은 [`.planning/inputs.md`](../.planning/inputs.md)로 옮겼다. 사람이 골라야 하는 결정은 [`.planning/README.md`](../.planning/README.md) "결정 대기"에 있다.

## Deferred

- 다크모드는 설계 범위 밖이다. 도입하면 별도 요구·설계·검증으로 다루고 light token을 단순 반전하지 않는다.
