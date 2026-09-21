# 05. Design Decisions / Open Questions

현재는 개념 설계 단계다. 이 문서는 결정 상태와 미결 질문을 추적하며 구현 일정·기술 도입 시점·POC 착수를 승인하지 않는다. 기존 파일명은 참조 안정성을 위해 유지한다. 전역 UX 계약의 원본은 `06_platform_ui_contract.md`다.

## 결정 상태

| 상태 | 내용 | 원본 / 다음 판단 |
| --- | --- | --- |
| Decided | Platform Kernel을 우선하고 메뉴가 공통 계약을 소비한다 | `06_platform_ui_contract.md` §1/§4/§5 |
| Decided | occurrence와 도메인 객체 식별자를 분리하고 URL을 권한 증명으로 쓰지 않는다 | 전역 계약 §6 |
| Decided | Context 변경 시 이전 결과를 새 조건의 결과로 표시하지 않는다 | 전역 계약 §11 |
| Decided | URL 직렬화·집합 키/공집합·지표 버전 쌍·초 단위 구간, 시간 경계 메커니즘(half-open, 날짜-only, TZ 미확인 fallback, 복수 설비 병합 가드, `defaultRangeTo`), URL 계약(세션 우선순위, 버전 `v`, 잘못된 값, 뒤로가기/셸 전환 복원), §19 응답 스키마(2층: `outcome`+`assessments[]`) | `06_platform_ui_contract.md` §6.1/§6.3/§6.4/§19, `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` |
| Decided | 실시간성 기본 정책(폴링+세대 기반 캐시 재검증), 파서 DB 접근 기본 정책(같은 인스턴스·read-only·플랫폼 스키마), 지연 완료 허용 시간의 정책 메커니즘(`lateArrivalAutoHorizon`, 진행 경계 `R`/창 길이 `H`, 창 밖은 정정 후보로 보존) — **구체 숫자·필드명은 Open/Candidate로 유지** | 아래 §실시간성/파서 DB 접근/지연 완료, `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §6 |
| Decided | 셸 치수(사이드바 270px·헤더 54px)와 테이블 행 밀도(최소 32px, 25px는 compact 시각 목표)는 `DESIGN.md` canonical 값으로 통일. `docs/06` §7/§15를 `DESIGN.md`에 맞춰 갱신 완료(2026-09-21) | `06_platform_ui_contract.md` §7/§15, `DESIGN.md` `sidebar-shell`/`top-bar`/`table-density`, `PLATFORM_REQUIREMENTS.md` §0 |
| Candidate | 대표 분석 흐름으로 차트·표·드릴다운·딥링크 계약을 검증한다 | 아래 설계 검증 기준; 구현 착수는 별도 결정 |
| Candidate | 프론트엔드 라이브러리 및 백엔드 기술 선택 | `04_frontend_ui_ux.md`, `03_backend_stack.md`; 제품 제약과 검증 결과에 따라 결정 |
| Open | Scope hierarchy(사이트→공장→라인), 복수 Scope, TZ 실제 값, 다중 사업장 같은 날짜 의미, 사용자·운영 요구(백엔드 언어/인증/멀티테넌시/배포 환경/동시 사용자/데이터 볼륨), 지연 완료 허용 시간의 구체 숫자 | 전역 계약 §6.2/§6.3 및 아래 질문 |
| Deferred | 구현 순서·일정·POC·저장된 뷰·범용 위젯/플러그인 확장 | 별도 implementation-planning에서 재평가 |

Decided는 설계 계약의 상태이며 구현 완료를 뜻하지 않는다. Candidate/Open/Deferred를 구현 지시로 해석하지 않는다.

## 대표 분석 시나리오의 설계 검증 기준 (Candidate)

향후 대표 시나리오를 검증할 때 사용할 후보 기준이다. 현재 설계 단계에서 POC 구현이나 통과를 요구하지 않는다:

- 동일 조건의 차트·상세 표·CSV 일치
- 지연 완료 후 일치(재집계가 반영됨)
- 딥링크 왕복(같은 조회조건으로 재방문 가능)
- 권한 변경 후 비노출(캐시가 권한을 무시하지 않음)
- 유효구간 경계 귀속(설비 속성이 변경된 구간의 데이터가 올바른 속성값에 귀속)

대표 시나리오의 검증 질문은 "차트가 잘 나온다"보다 다음 질문에 답할 수 있는지로 잡는다:

> 이 숫자는 어느 데이터까지 반영했고, 어떤 정의로 계산했으며, 무엇을 제외했고, 어떤 설비 실행에서 나온 것인가?

예를 들어 사이클타임 P95에서 느린 실행 목록으로, 다시 해당 실행의 공정 타임라인과 품질 표시로 내려갈 수 있다면, 그 하나의 흐름에서 지표·필터·식별자·권한·리니지·차트 요구를 함께 검증할 수 있다.

## Open Questions

- [ ] 백엔드 언어 (FastAPI 기본 추천이나, 팀이 C#/TypeScript 중심이면 ASP.NET Core/NestJS로 확정될 수 있음 — `03_backend_stack.md`의 기술스택 표는 잠정)
- [ ] 인증 방식 (사내 SSO 연동 여부 — 있다면 처음부터 OIDC로 시작)
- [ ] 멀티테넌시/다중 사업장 지원 여부 (초기엔 행 스코핑으로 충분한지)
- [ ] 배포 환경 (사내 서버 vs 클라우드)
- [ ] 동시 사용자 규모
- [ ] 데이터 볼륨/보존 기간
- [ ] 지연 완료 허용 시간의 **구체 숫자** (`lateArrivalAutoHorizon`/`H`의 값 — 메커니즘은 아래 §지연 완료에서 Decided)
- [ ] 사업장별 원천 시간대 매핑의 **실제 값** — 파서 wall-clock을 소비 계층에서 어떻게 UTC/표시 시간대로 변환할지 (미확인 시 fallback 메커니즘은 `06_platform_ui_contract.md` §6.3에서 Decided)

### 실시간성 (Decided — 메커니즘)

기본은 **폴링 + 서버가 제공하는 완료된 계산 세대/갱신 정보 기반 캐시 재검증**이다. 원천 watermark 이동을 mart 재집계 완료와 같다고 보지 않는다(감지→재계산→정합 결과 제공을 구분). 웹소켓/SSE는 열린 대시보드의 초 단위 갱신, 또는 동시 편집 presence가 **문서화된 제품 요구**로 확인될 때 재평가한다(이 두 조건만이 영구 유일하다고 못박지 않는다). 폴링 주기·중단 조건·워커 감지 주기의 숫자는 Open이다. 근거: `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §6.1.

### 파서 DB 접근 방식 (Decided — 메커니즘)

"직접 연결 vs read replica"를 **mart 소스 인스턴스가 어디에 사는가**의 문제로 재정의한다. **기본 정책은 같은 Postgres 인스턴스, 파서 read-only 역할, 플랫폼 전용 스키마다**(`03_backend_stack.md`가 이미 추천했던 토폴로지를 이 세션에서 기본값으로 확정). API는 파서 원본 테이블을 직접 조회하지 않는다(`01_architecture_and_data_contract.md`). replica/분리 인스턴스는 쓰기 경합 또는 보안 격리 요구가 **실제로 확인될 때만** 평가 대상으로 승격한다(경합 존재만으로 자동 승격하지 않는다). 근거: `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §6.2.

### 지연 완료 허용 시간 (Decided — 정책 메커니즘; 구체 숫자는 Open Questions 유지)

필수 운영 설정 `lateArrivalAutoHorizon`(Candidate 이름) 없이는 자동 재집계를 시작하지 않는다(0이나 무한을 암묵값으로 넣지 않고, 숫자 미정이면 "설정 미충족"으로 보고한다). 창 **안**의 지연완료는 자동 재집계하고, 창 **밖**은 자동 재개방하지도 조용히 버리지도 않으며 식별·조회 가능한 정정/backfill 후보로 남겨 운영자가 명시적으로 실행한다(새 승인 워크플로 UI는 이번에 만들지 않음; 기존 플랫폼 권한·감사를 적용). `autoRefreshClosed`는 자동 창이 닫혔다는 뜻일 뿐 데이터가 완전/불변이라는 뜻이 아니다. 마스터 소급·재분류·지표 정의 변경은 이 창과 다른 트리거다.

창의 기준은 시간역별 **원천 진행 경계 `R`**(데이터 계층 소유, naive 배타 경계, 첫 mart 세대 생성 전에도 공급 가능하며 mart 계산 완료 시각·클라이언트 now·UTC 절단과는 다른 값)과 **명시적 wall-clock 길이 설정 `H`**다. 자동 창은 `[R-H, R)`이고, 원천 진행이 멈추면 창도 멈춘다(현실 경과일로 반드시 닫히는 것이 아니라 데이터 진행 기준의 창이다). `R`이 없으면 자동 재집계만 보류하며 지연완료 식별·후보 보존은 계속한다. 사업장 override·지표별 horizon은 수요·모델이 확인되기 전에는 구현하지 않는다(영구 금지와는 다르다). 근거: `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §6.3.

## Deferred — 과거 Phase roadmap 가설 (non-authoritative)

아래 표는 기존 검토 내용을 보존한 **구현 순서 가설**이다. 확정 계획·일정·기술 도입 승인·현재 완료 기준이 아니다. 다른 문서의 Phase 0~4 참조 역시 이 가설을 가리키며 설계 계약에 우선하지 않는다. 구현 요청이 생기면 미결 결정과 수요를 확인한 뒤 별도 계획으로 다시 작성한다. 표의 POC와 기술명도 검토 후보일 뿐 착수 의무가 아니다.

| 가설 단계 | 검토했던 범위 | 향후 검증 후보 |
| --- | --- | --- |
| Phase 0 | 대표 사용자 시나리오, `docs/23`의 equipment_master/occurrence_directory/module_class_map/조인 규칙 채택, 제공 가능한 지표·데이터 계약·권한 범위 결정, 필드별 마스터 소유권(외부 MES 동기화 vs 플랫폼 직접관리) 결정, 지표 집계 가능성 규칙(비율은 분자·분모 별도 합산) 확정, 대표 그리드 1개·대표 차트 1개 POC | 필요한 입력과 숫자의 의미가 명확함 |
| Phase 1 | 코어 셸(인증 OIDC/메뉴 레지스트리/전역 필터) + 필터 딥링크 쿼리 파라미터 계약 고정(occurrence 전용 equipmentId/entityType/anchor와 목적지 객체 ID 분리, scopeId 및 서버 재검증, savedViewToken 예약, wall-clock 시간 계약 — `06_platform_ui_contract.md` §6) + 설비관리(유효구간) + 기준정보관리 + 공지(배너) | 원천→화면 흐름이 연결되고 필터 계약이 굳음 |
| Phase 2 | mart 파이프라인(지연 완료 watermark 감지 기반 재계산, pg_cron은 스케줄일 뿐 정합성 보장 아님) + 조회/분석 화면 하나를 끝까지(최소형 영역 주석 포함) + 지표 레지스트리 최소형(버전 필드 포함해 레지스트리 조회 관례 강제) + VOC 최소 구현 + 내보내기(CSV) + 동일 조건 차트·표·CSV 일치 검증 | 메뉴 간 숫자·권한·조회조건이 일치함 |
| Phase 3 | 지표 정의를 데이터로 승격 + 버전/발행 이력 + 두 번째 분석 메뉴 + 저장된 뷰 | 운영자가 안전하게 지표를 변경·운영함 |
| Phase 4 | 공통 위젯/대시보드 프레임워크, 메뉴 플러그인 레지스트리(외부 설치형), 자유 필기 고급 주석 편집기(Phase 2 최소형 영역 주석과 구분), 외부 BI 연동, VOC-운영 알림 연계 | 확인된 사용 수요에 맞춰 확장됨 |
