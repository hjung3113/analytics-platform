# 대표 작업 검증

검증 종류: 현재 원문을 이용한 **문서 탐색·의미 대조·변경 영향 모의 검토**. 제품 실행/성능/접근성 통과를 의미하지 않는다. 실제 원문 수정도 하지 않았다. REQUIREMENTS는 루트 `PLATFORM_REQUIREMENTS.md`의 약칭이다. 아래 문서명은 저장소 루트 기준이며 위치는 current-map과 sample-source에 결속된다.

## V1. 새 설비관리 메뉴의 Kernel 소비 준비

- 읽기 경로: AGENTS → INDEX → 06 §4–6,8,17,18–19,26,28–29 → 02 설비관리 → 01 마스터 원천 → 화면 설계 스킬 → DESIGN table/interaction. 04는 실제 기술 선택 시 추가한다.
- 원본: Registry/Slot/Context/권한·상태는 06. 설비는 실재 parser equipment_id에서 발견하며 business 속성을 부여한다는 도메인 규칙은 02, 필드 원천은 01. 시각값은 DESIGN.
- 소비 선언 샘플: 설비관리 Management consumer, 목적지 equipment_id는 occurrence anchor 없이 가능; Lot 미지원은 보존·미적용 표시; Scope 서버 검증; shared slot; empty/unknown 분리. 이 개념 선언을 실행 가능한 Registry manifest로 가장하지 않는다.
- 수정 대상(후속): 새 메뉴 spec와 소비 선언/수용 사례. 계약 공백이 드러날 때만 06의 별도 변경 제안. 기존 Sidebar를 메뉴별로 고치는 것은 06 §5 금지.
- 미결: 실제 Registry schema와 등록 검증, 필드 원천/쓰기 충돌, 첫 consumer의 사용자 우선순위. 미결이 읽기·개념 설계 전체를 차단하지는 않지만 쓰기 운영은 결정 필요.
- 검증: 06 §28/§29 질문으로 선언·Slot·Context·권한·Data Trust 대조. Domain Done만으로 종료하지 않는다.
- **관측 결과:** 현 INDEX는 개별 메뉴 구현자를 04로 먼저 보낸다. 목표 경로에서는 06 §5 금지를 먼저 읽고 도메인을 소비자로 놓을 수 있다. 실제 메뉴가 준비 완료라는 주장은 하지 않는다.

## V2. URL·Context·시간 변경 영향

- 변경 가정: 'R이 없으면 기본 기간 자동 물질화를 금지'. 읽기: 06 §6.3 → 05 지연완료 → 01 mart 재계산 → 06 §6.4/§11/§18–19 → 03 시간, 07 §6–8, DESIGN Date preset, REQUIREMENTS §3/Open Q4 → integration 후보2.
- 원본: 기본 기간은 06 §6.3, R/H는 현재 05. 같은 시간역/대상 조건에서 R 존재 시에만 `defaultRangeTo≤R`. R 부재 때 독립 defaultRangeTo 유효 시 물질화하고 자동 재집계만 보류한다.
- 직접 영향: 기본 진입/URL materialization/기간 UI/adapter 요청. 간접 영향: 운영 문구·지연완료 후보 보존·연구 요약. 연구의 'R 없으면 auto publish 중단'은 research SYNTHESIS §3에서 이미 정정된 과거 주장이다.
- 수정 대상: 원본 06 및 승인된 의미 변경이라면 관련 05; 03/04/07/REQUIREMENTS 요약·DESIGN preset·adapter 소비 검토. runtime 경로는 아직 없으므로 구체 파일을 발명하지 않는다.
- 미결: Δ, H, assertion/defaultRangeTo 공급자, 실제 TZ. 변경 가정은 기존 예외 제거이므로 단순 문서 정리가 아니다.
- 검증: [분리 샘플](sample-time-contract.md)의 역대조 10행; 원문 §6.3 무손실 사본 일치; 반례 R 없음/유효 to, R 있음/to>R, 마지막점 .500, TZ 미확인 단일, 시간역 중간 변경, 날짜-only URL 거부.
- 추가 데이터 운영 대조: 05에서 H 미설정 시 자동 시작 금지, `[R-H,R)`와 원천 정지 시 창 정지, 창 밖 후보 보존, `autoRefreshClosed`≠완전성을 확인했다. 01의 마스터 소급·설비 재분류·지표 변경은 별도 재계산 트리거이며 여러 mart 세대 혼합 금지도 유지한다. 이번 기본기간 가정은 이 정책들을 바꾸지 않는다. 연동 구현 검증은 미실행이다.
- **관측 결과:** rg를 `defaultRangeTo`만으로 수행하면 05 R/H와 07의 간접 소비 문장을 완전히 포착하지 못한다. 직접 의존 포인터+용어 검색을 병행해야 한다. 새 변경안은 채택하지 않았으며 문서 체계가 위험을 드러내는 데 성공했다.

## V3. Research/Candidate 채택 또는 보류

- 사례: integration/component-contract-candidates 후보2 Raw Evidence Drill-through Adapter.
- 읽기: 후보2 본문/행동 판정 → 06 §6.2–6.4/§17/§18–19 → 01 소비 경계 → 03 시간/상태 근거 → 원 조사(필요한 소스 재확인) → 05 결정 경로.
- 원본/경계: 플랫폼 의미는 06. FileGateway는 독립 서비스. 후보 문서의 원 구현 요약은 조사 결과이며 플랫폼 채택 증거가 아니다.
- 보존할 예외: log/history/current 세 요청 축 분리; API key caller≠설비 ACL; 무단 ID 필터링 성공 금지; naive→Seoul 추측 금지; offset 제거만으로 의미 보존 아님; 서로 다른 시간역 분리 조회 자체는 금지 아님; 요청 감사≠마스터 변경 감사.
- 후보2 표 추가 대조: current는 equipmentId+configurationType으로 기간/cursor 없이 배열, history는 from/to 필수+pagination이며 log 축과 다르다. API key 원문·token payload·물리 경로 비기록과 health 감사 제외는 원 서비스 조사 사실이지 플랫폼 감사 채택이 아니다. read-only/opaque cursor/status-error/partial FTP failure 경계를 별도로 검증해야 한다. 단일 Site TZ를 서버 assertion 대신 쓰거나 gateway 기본기간을 플랫폼 defaultRangeTo로 위임하면 안 된다. 현재 문서상 경계는 확인했지만 외부 서비스 실행은 하지 않았다.
- 채택 분기(이번에 실행 안 함): I6 수요 확인 + 시간/권한 매핑 검증 → 위임된 결정권자의 채택 근거 → 06/01/03 필요한 원본 변경/adapter spec → 05 결과 포인터 → 후보에 채택 범위/후속 링크. 원 조사 당시 오류/미검증은 보존. 코드·실연동은 별도 증거.
- 보류 분기: Deferred 이유=원문 수요/시간 매핑 입력 미확보, 재개 입력=업무 사례+증명 가능한 시간/ACL, 담당=통합·업무 담당 미지정, 행동=사례 수집. 파일 삭제/후보 필드의 확정 승격 없음.
- **관측 결과:** '후보 전체 채택' 한 체크로는 3개 요청 축과 요청 감사 신설 여부를 표현하지 못한다. 채택 범위와 제외를 단위별로 기록하도록 운영안을 보강했다. parser 소비 기준선은 이 신규 채택 절차로 다시 Candidate로 내리지 않는다.

### V1–V3 공통 Data Trust 대조

06 §18의 freshness/calculation basis/coverage/completeness·provisional/metric version/source·lineage는 공통 어휘이며 실제 계산 책임은 Backend/Data layer다. §19에서 `confirmed`/`clear`에는 statusSource·observedAt이 필요하고 원천 미구현/실패 시 적용 kind를 빼지 않고 `unknown`+이유로 유지한다. 성공 0건은 `empty`, 본 조회 실패는 `error`, 권한 제한의 원인은 서버가 확인해야 한다. source/lineage 진입을 제공한다고 데이터 완전성이나 원인 확인이 자동 입증되지는 않는다. V1 신규 메뉴의 상태 선언, V2 TZ 미확인 표시, V3 adapter 상태 매핑에서 이 경계를 대조했다. 필드명·enum의 Candidate 상태는 유지하며 runtime pass로 보고하지 않는다.

## V4. DESIGN 시각값과 전역 행동 찾기

- 작업: 고밀도 표의 행 높이 및 Context 전환 중 표시 동작 확인.
- 읽기: DESIGN `table-density`/Layout/Shared interaction → 06 §15/§11/§19 → 07 화면 시나리오.
- 원본: DESIGN 최소 row/header 32px, compact 25px는 시각 목표이며 줄바꿈/포커스에 따라 증가, coarse pointer 44px. 06 §15는 이 값을 인용하면서 Decided 플랫폼 최소 기준의 소비 의무를 규정한다. 값의 편집 원본과 최소 기준의 적용 책임을 구별한다. Context 변경/Scope 전환의 이전 결과 차단과 응답 원인 의미는 06, 렌더 focus/busy/skeleton 표현은 DESIGN, visible focus/focus trap 등 접근성 행동 의무는 06 §26이다.
- 변경 대상: 색·행 geometry 변경은 DESIGN, 공개 상태 의미 변경은 06. 표시도 의미에 영향을 주면 양쪽 담당 검토. 값이 같다는 이유로 06 §23 Candidate 전체를 Decided로 올리지 않는다.
- 미결: 실제 CJK/키보드/대비 검증, preset·queue/lifecycle 업무 의미. 현재 숫자는 재질문 안 함.
- **관측 결과:** DESIGN Navigation의 screenshot 6그룹 'matching'은 06 7그룹과 불일치하며 같은 파일 후반에 정정돼 있다. 'DESIGN 전체=시각 canonical'으로만 검색하면 잘못된 메뉴 IA를 가져올 수 있어 섹션별 종류/상태 표시가 필요했다. DESIGN을 페인트만으로 좁히면 render interaction이 유실되므로 그 제안은 수정했다.

## V5. 서로 다른 파일을 고치는 두 에이전트

모의 변경 제안(실제 source mutation 없음):

- Agent A: FE codec에서 집합 `equipmentIds` 중복을 제거한다(06 §6.1에 부합).
- Agent B: 서버 요약 규칙에 '중복 query key는 같은 값이어도 모두 거부'를 넣는다. 단일 `scopeId`에 맞는 규칙을 집합에도 확대했다.
- 파일/줄이 달라 Git merge conflict가 없어도 같은 공개 cardinality 계약을 서로 다르게 정의한다.

판정 경로: 작업 시작의 소비 계약 `URL-CARDINALITY`/source revision 확인 → 06 §6.1 집합 정규화와 단일값 중복 문단을 **둘 다** 직접 읽음 → B의 범위를 단일값으로 제한하거나 새 계약 변경 제안으로 분리 → FE/BE parity 사례에 집합·단일·공집합 표식 충돌을 함께 포함.

검증 결과: 마지막 수정 승리나 더 엄격한 금지 우선은 틀린 해결이다. 승인된 원문 기준으로 의미를 조정하고 해결 전에는 영향받는 변경만 보류한다. 독립 시각 수정까지 막을 필요는 없다. 원본 revision이 바뀌면 해당 문단 영향 검토 후 관련 결과만 갱신한다.

## 구조안에 반영한 수정과 한계

- 거대한 중앙 상태/증거 표 대신 포인터 중심 길찾기·원본 인접 직접 관계·작업별 evidence를 권고한다. 실제 팀 흐름에 맞는 위치는 I7 미결이며 같은 관계를 여러 곳에 복제하지 않는 조건이 중요하다.
- sample은 정확한 원문 대조를 위한 임시 산출물이다. 영구 복제 원본을 늘리는 방식으로 채택하지 않는다.
- 자동 체크의 음성 사례(사본 예외 삭제·source hash 변경·없는 포인터)는 validation 스크립트가 메모리 내에서 탐지하는지 확인한다. 의미 검사는 위 5개 문서 워크스루이며 자동화가 대체하지 않는다.
- 탐색 시간/LLM 정확도 개선율은 측정하지 않았다. 새 에이전트가 실제 migration을 실행해 본 결과도 아니다. 후속 첫 patch에서 작은 독서 묶음의 충분성/누락 소비자를 다시 확인한다.
