# 05. Design Decisions / Open Questions

현재는 개념 설계 단계다. 이 문서는 결정 상태와 미결 질문을 추적하며 구현 일정·기술 도입 시점·POC 착수를 승인하지 않는다. 기존 파일명은 참조 안정성을 위해 유지한다. 전역 UX 계약의 원본은 `06_platform_ui_contract.md`다.

## 결정 상태

| 상태 | 내용 | 원본 / 다음 판단 |
| --- | --- | --- |
| Decided | Platform Kernel을 우선하고 메뉴가 공통 계약을 소비한다 | `06_platform_ui_contract.md` §1/§4/§5 |
| Decided | occurrence와 도메인 객체 식별자를 분리하고 URL을 권한 증명으로 쓰지 않는다 | 전역 계약 §6 |
| Decided | Context 변경 시 이전 결과를 새 조건의 결과로 표시하지 않는다 | 전역 계약 §11 |
| Decided | URL 직렬화·집합 키/공집합·지표 버전 쌍·초 단위 구간, 시간 경계 메커니즘(half-open, 날짜-only, TZ 미확인 fallback, 복수 설비 병합 가드, `defaultRangeTo`), URL 계약(세션 우선순위, 버전 `v`, 잘못된 값, 뒤로가기/셸 전환 복원), §19 응답 스키마(2층: `outcome`+`assessments[]`) | `06_platform_ui_contract.md` §6.1/§6.3/§6.4/§19, `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` |
| Decided | 실시간성 기본 정책(폴링+세대 기반 캐시 재검증), 파서 DB 접근 기본 정책(같은 인스턴스·read-only·플랫폼 스키마), 지연 완료 허용 시간의 정책 메커니즘(`lateArrivalAutoHorizon`, 진행 경계 `R`/창 길이 `H`, 창 밖은 정정 후보로 보존) — **`H`=1시간 확정, 그 외 구체 숫자·필드명은 Open/Candidate로 유지** | [01 데이터 운영 정책](01_architecture_and_data_contract.md#데이터-운영-정책), `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §6 |
| Decided | 셸 치수(사이드바 270px·헤더 54px)와 테이블 행 밀도(최소 32px, 25px는 compact 시각 목표)는 `DESIGN.md` canonical 값으로 통일. `docs/06` §7/§15를 `DESIGN.md`에 맞춰 갱신 완료(2026-09-21) | `06_platform_ui_contract.md` §7/§15, `DESIGN.md` `sidebar-shell`/`top-bar`/`table-density`, `PLATFORM_REQUIREMENTS.md` §0 |
| Decided | Scope/설비 도메인 모델: Site→Line 2단계(Factory는 모델링하지 않음), Maker→Model→EquipmentID 식별 계층, Process(`room_name`)·StGroup(`stgroup`)은 계층이 아닌 교차 분류 축, Recipe(`prc_name`)는 설비가 아니라 Lot/Job에 붙는 속성(2026-09-22 도메인 인터뷰) | `CONTEXT.md`, `docs/adr/0001-scope-hierarchy-site-line-only.md` |
| Decided | 조직/운영 요구값(2026-09-22 확정): 백엔드 FastAPI, 배포 on-prem, 동시 사용자 ~100명, 데이터 보존 기간 제한 없음(삭제 안 함), 초기 1개 Site/Line으로 시작하되 구조는 확장 가능하게, Scope는 v1에서 단일 선택만(복수 선택은 이후), TZ는 한국(Asia/Seoul) 단일값으로 우선 시작(해외 사업장인 중국 시안·미국 오스틴 실존 확인, 확장 여지는 설계에서 배제하지 않음) | `03_backend_stack.md`; 아래 Open Questions |
| Decided | Evidence/Lineage drill-through(후보 1)와 원문 로그/설정파일 drill-through(후보 2, FileGateway류)는 현재 defer — parser의 view/mart 조회로 충분하며, 원본 접근은 내부 개발자 전용 메뉴가 실제로 필요해질 때 재검토(2026-09-22) | `docs/integration/component-contract-candidates.md` §다음 결정 순서 |
| Decided | 딥링크 키 확장(Recipe는 `recipeIds`로 승격, StGroup은 URL 키로 승격하지 않고 선택 시점 `equipmentIds`로 물질화), 기간 프리셋(`1일/7일/사용자 지정`)과 집계 단위(`granularity`, page-owned), 시각화 경계(donut은 분모 있는 비율만 기본 허용, gauge/3D/그라디언트는 기본 비허용이나 업무 근거 확인 시 케이스별 예외 가능), 폴링 주기 5분(300s), CJK 폰트(망분리 확인 — Noto Sans KR 자체 호스팅), 아이콘 세트(Lucide), 메뉴 활용률 계측(v1 범위 포함, 수집 필드·보존·열람권한 확정) — 전부 2026-09-22 grilling Round 2 | 아래 §딥링크 키 확장, §기간 프리셋과 집계 단위, §시각화 경계, §메뉴 활용률 계측; `docs/adr/0002-stgroup-materializes-to-equipment-ids.md`; `PLATFORM_REQUIREMENTS.md` |
| Candidate | 대표 분석 흐름으로 차트·표·드릴다운·딥링크 계약을 검증한다 | 아래 설계 검증 기준; 구현 착수는 별도 결정 |
| Candidate | 프론트엔드 라이브러리 및 백엔드 기술 선택(백엔드는 FastAPI로 방향 확정, 세부 프레임워크 버전·구성은 Candidate) | `04_frontend_ui_ux.md`, `03_backend_stack.md`; 제품 제약과 검증 결과에 따라 결정 |
| Open | 인증 프로토콜의 정확한 사양 — 사내 SSO 존재는 확인됐으나 프로토콜 미확인(사내 확인 중). 확인 전까지 인증 계층은 나중에 붙일 수 있도록 pluggable하게 구현한다 | 아래 Open Questions |
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

- [ ] 인증 프로토콜의 정확한 값 (사내 SSO 존재는 확인됐으나 프로토콜은 사내 확인 중 — 확인 전까지 인증 계층은 pluggable하게 구현)

2026-09-22 도메인 인터뷰로 이 절의 나머지 항목(백엔드 언어, 멀티테넌시, 배포 환경, 동시 사용자, 데이터 보존, 지연 완료 허용 시간 구체 숫자, 사업장 TZ 실제 값, Scope hierarchy)은 모두 Decided로 이동했다. 값과 근거는 위 결정 상태 표와 `CONTEXT.md`, `docs/adr/0001-scope-hierarchy-site-line-only.md`를 본다.

### 실시간성 (Decided — 메커니즘)

상세 원본은 [01 데이터 운영 정책](01_architecture_and_data_contract.md#refresh-policy)으로 이관했다. 이 제목은 기존 링크 호환을 위해 유지하며 정책을 중복 편집하지 않는다.

### 파서 DB 접근 방식 (Decided — 메커니즘)

상세 원본은 [01 데이터 운영 정책](01_architecture_and_data_contract.md#parser-db-access)으로 이관했다. 이 제목은 기존 링크 호환을 위해 유지하며 정책을 중복 편집하지 않는다.

<a id="late-arrival-policy"></a>
### 지연 완료 허용 시간 (Decided — 정책 메커니즘 + 구체 숫자)

상세 원본은 [01 데이터 운영 정책](01_architecture_and_data_contract.md#late-arrival-policy)으로 이관했다. 이 제목은 기존 링크 호환을 위해 유지하며 정책을 중복 편집하지 않는다.

### 딥링크 키 확장 — Recipe/StGroup (Decided, 2026-09-22 grilling Round 2)

`CONTEXT.md`가 Recipe(`prc_name`)를 "지표 산출과 분석 모두에서 가장 많이 쓰이는 1급 분류 축"으로 정의한 것에 대응해, **`recipeIds`를 06 §6.1의 URL 소유 키 목록에 추가한다**(Candidate 필드명, `equipmentIds`/`lotIds`와 같은 집합 키 정규화 규칙을 따름). Recipe는 Lot 실행 시점에 고정되는 속성이라 재방문 시 같은 결과를 재현하며 §6.1 재현성 원칙과 충돌하지 않는다.

**StGroup은 URL 소유 키로 승격하지 않는다.** 이유: StGroup 소속은 가변적이고 v1은 "현재 소속 기준만" 쓴다(`CONTEXT.md`). `stGroupId`를 URL 키로 두면 저장된 링크를 나중에 다시 열 때 그사이 소속이 바뀐 설비만큼 조회 대상 설비 집합이 **조용히** 달라져, 지연완료·마스터 정정과는 다른 새로운 종류의 비재현성이 06 §6.1 원칙과 정면으로 충돌한다. 대신 **UI에서 "StGroup X" 프리셋을 선택하는 순간 그 시점의 멤버 EquipmentID 목록을 `equipmentIds`로 물질화**해 URL에 박는다 — 재방문 시 그 설비 목록 그대로 재현되고, "지금 다시 StGroup X를 고르면 다른 설비가 나올 수 있다"는 것은 선택 시점에 사용자가 명시적으로 인지하는 행동이 된다. 근거·대안 비교는 `docs/adr/0002-stgroup-materializes-to-equipment-ids.md`.

### 기간 프리셋과 집계 단위 (Decided, 2026-09-22 grilling Round 2)

실제 사용 패턴은 "보통 1일 단위, 길면 7일, 드물게 그 이상"이다(로그 자체는 1시간 단위지만 조회 단위는 아니다). `DESIGN.md`가 참고 스크린샷에서 그대로 가져왔던 `7D/30D/90D` 프리셋을 **`1일/7일/사용자 지정`** 3버튼으로 교체한다(30일/90일은 프리셋 버튼에서 빠지지만 "사용자 지정"으로는 여전히 조회 가능 — YAGNI, 실사용에서 자주 확인되면 버튼을 다시 늘린다). Δ는 §6.3이 이미 확정한 `defaultRangeTo` 기준 rolling wall-clock 메커니즘(naive 길이 산술, 자정 비정렬)을 그대로 쓴다: 1일=Δ24h, 7일=Δ168h. 달력일 정렬(자정 스냅)이나 교대일/영업일 의미는 여전히 별도 Open이다(§실시간성 위 항목과 무관, `05` 상단 결정 상태 표의 다중 사업장 "같은 날짜" 참조).

**집계 단위(`granularity`, Candidate 필드명)**는 조회 기간과는 다른 축이다 — 같은 7일 기간이어도 시간별로 볼지 하루로 뭉쳐 볼지는 별개 선택이다. 06 §6.1이 이미 허용하는 **page-owned 계약**(화면마다 선언·등록, `metricId`+`metricVersion` 쌍과 같은 패턴)으로 새 URL 소유 키를 추가한다 — 전역 Context Bar에는 넣지 않는다(모든 메뉴가 granularity 선택을 갖는 게 아니라서, 안 쓰는 화면까지 계약을 소비하게 만들 이유가 없다). 값 후보: `hour`/`day`/`week`.

### 시각화 경계 — Donut/Gauge (Decided, 2026-09-22 grilling Round 2)

06 §24 Decorative Visualization의 경계를 한 문장으로 확정: **기본값은 분모가 있는 비율(예: 가동률, 완료율)에 한해 donut만 허용하고, 게이지·스피드미터류(3D/그라디언트 포함)는 기본적으로 쓰지 않는다.** 단, 이건 전면·영구 금지가 아니다 — 특정 업무 판단에 실제로 기여한다는 근거가 확인되면 케이스별로 예외를 추가할 수 있다. `PLATFORM_REQUIREMENTS.md` 42행의 후보 문구를 채택.

### 메뉴 활용률 계측 (Decided — v1 범위 포함, 2026-09-22 grilling Round 2)

**범위 판단 정정:** 이 계측은 "메뉴가 몇 개 쌓이면 그때 붙이는" 메뉴 부가기능이 아니라 **Platform Kernel 자체의 관측 범위**(Menu Registry가 실제로 어떻게 쓰이는지)다. 메뉴별 반복 패턴 확인 후 공통 컴포넌트로 승격하는 Premature Platformization 게이트(§24)는 여기 적용 대상이 아니다 — 플랫폼 우선순위(`AGENTS.md`, 06 §1)에 따라 v1 범위에 포함한다.

- **수집 필드**: menuId·이벤트·시각뿐 아니라 **조회조건·필터값까지 포함**한다.
- **보존기간**: 무제한(자동 삭제 없음). 개발자가 필요시 수동으로 삭제할 수 있는 경로는 둔다(자동 purge 잡은 아님).
- **열람 권한**: 개발자 및 운영자 기본 열람. 그 외 계정은 운영자가 개별로 권한을 부여한 경우에만 열람 가능(기존 06 §17 권한/Scope 집행 정책과 같은 서버 재검증 원칙을 따름 — 별도 새 권한 모델을 만들지 않고 기존 역할 체계 위에 얹는다).
- 계측 파이프라인의 이벤트 스키마·PII 최소화 세부 구현은 구현 착수 직전 별도로 다룬다(위 세 항목은 정책 수준 Decided).

## Deferred — 과거 Phase roadmap 가설 (non-authoritative)

아래 표는 기존 검토 내용을 보존한 **구현 순서 가설**이다. 확정 계획·일정·기술 도입 승인·현재 완료 기준이 아니다. 다른 문서의 Phase 0~4 참조 역시 이 가설을 가리키며 설계 계약에 우선하지 않는다. 구현 요청이 생기면 미결 결정과 수요를 확인한 뒤 별도 계획으로 다시 작성한다. 표의 POC와 기술명도 검토 후보일 뿐 착수 의무가 아니다.

| 가설 단계 | 검토했던 범위 | 향후 검증 후보 |
| --- | --- | --- |
| Phase 0 | 대표 사용자 시나리오, `docs/23`의 equipment_master/occurrence_directory/module_class_map/조인 규칙 채택, 제공 가능한 지표·데이터 계약·권한 범위 결정, 필드별 마스터 소유권(외부 MES 동기화 vs 플랫폼 직접관리) 결정, 지표 집계 가능성 규칙(비율은 분자·분모 별도 합산) 확정, 대표 그리드 1개·대표 차트 1개 POC | 필요한 입력과 숫자의 의미가 명확함 |
| Phase 1 | 코어 셸(인증 OIDC/메뉴 레지스트리/전역 필터) + 필터 딥링크 쿼리 파라미터 계약 고정(occurrence 전용 equipmentId/entityType/anchor와 목적지 객체 ID 분리, scopeId 및 서버 재검증, savedViewToken 예약, wall-clock 시간 계약 — `06_platform_ui_contract.md` §6) + 설비관리(유효구간) + 기준정보관리 + 공지(배너) | 원천→화면 흐름이 연결되고 필터 계약이 굳음 |
| Phase 2 | mart 파이프라인(지연 완료 watermark 감지 기반 재계산, pg_cron은 스케줄일 뿐 정합성 보장 아님) + 조회/분석 화면 하나를 끝까지(최소형 영역 주석 포함) + 지표 레지스트리 최소형(버전 필드 포함해 레지스트리 조회 관례 강제) + VOC 최소 구현 + 내보내기(CSV) + 동일 조건 차트·표·CSV 일치 검증 | 메뉴 간 숫자·권한·조회조건이 일치함 |
| Phase 3 | 지표 정의를 데이터로 승격 + 버전/발행 이력 + 두 번째 분석 메뉴 + 저장된 뷰 | 운영자가 안전하게 지표를 변경·운영함 |
| Phase 4 | 공통 위젯/대시보드 프레임워크, 메뉴 플러그인 레지스트리(외부 설치형), 자유 필기 고급 주석 편집기(Phase 2 최소형 영역 주석과 구분), 외부 BI 연동, VOC-운영 알림 연계 | 확인된 사용 수요에 맞춰 확장됨 |
