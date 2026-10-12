# Capability Selection Matrix — 어떤 분석에 무엇을 사용하는가 (Candidate)

상태: **설계 후보(2026-10-13)**. 채택·구현·성능 보장 아님. [개요](README.md) · [도입 계획](architecture-rollout.md) · [선택기](feature-explorer.html).

> 기본: **서버에서 Scope/권한/한도/공식 지표 판정 → 의미가 확정된 필드/수치만 클라이언트에 전달 → 차트와 동일한 표 fallback 제공**. 기능 수가 아니라 **해당 분석 질문을 잘 설명하는가**가 채택 기준이다. “문제 해결에 기여하지 않는 gauge·3D·gradient”는 [06 §24 Decorative Visualization](../../06_platform_ui_contract.md#decorative-visualization) 기본 금지.

## 1. 추천 규칙: 질문 → 자료 형태 → 기능

| 질문/조건 | 데이터 최소 요건 | 1순위 표현/엔진 | 보완 후보 | 금지·주의 |
| --- | --- | --- | --- | --- |
| 시간별 CT 평균/P95가 어떻게 변했나? | timestamp, 같은 metricVersion, 단위, 버킷, sample count | Time line/ECharts + 표 | 다중 Pane 고밀도라면 Lightweight Charts | 데이터 품질 없는 구간 연결 금지, 평균과 P95 혼합 축 금지 |
| 수십~수백 설비별 장기 추세를 확대·갱신 | 시간 버킷, 단조 시간, gap/coverage, 충분한 기간 | ECharts → LWC PoC 게이트 통과 시 전문 엔진 | uPlot 성능 기준선 | LWC는 초 Timestamp·동시각 중복 이벤트 순서 보존 불가 |
| 1초 내 발생한 센서/이벤트를 순서대로 조사 | epoch-ms/sequence, stable eventId, 값/상태 | ECharts time+scatter 또는 이벤트 목록 | 도메인 event timeline | 원본 ms 타임스탬프를 정수 초로 깎아 series에 삽입 금지 |
| 두 지표를 같은 시간축에서 비교 | 공통 time domain, 양쪽 unit, 버킷/보간 규칙 | 동기화 time panes, ECharts | Lightweight Charts 여러 Pane | 단위 다른 축을 동일하게 정규화해 실제 변화량 감추지 말 것 |
| 이상 구간의 전후 이벤트는 무엇인가? | time span + event timestamps + IDs | 브러시된 시계열 + 이벤트 마커 + 상세 표 | vis-timeline | 점 자체를 클릭했다고 전역 Context 자동 변경 금지 |
| 상태별 설비 정지·대기·동작 구간 | start, end, state, module, 겹침 정책 | State timeline(도메인); ECharts custom series 또는 vis-timeline | 구간 합계 표 | 연속·누락 구간을 임의로 메움 금지; open interval 처리 명시 |
| Lot/Wafer 처리 단계의 시작과 끝 | ordered step, start/end, equipment, Lot/Wafer ID | Gantt/timeline + drill | Robot 이동 graph | start만 있는 행을 정상 종료로 표현 금지 |
| 요일×시간대에 상태가 몰리는가? | 시간대가 확정된 bucket, count/denominator | Calendar/hour heatmap/ECharts | 피벗 | 단일 Site 교대 시간 경계를 일반 날짜로 단순화 금지 |
| 설비 간 CT 중앙값·편차가 다른가? | 개별 관측치 또는 사전 계산된 사분위수, n | Box Plot/ECharts | Violin/Plotly, 분해 테이블 | n이 부족하면 box 해석 불가; 평균만으로 Box 생성 금지 |
| 분포의 다봉성/치우침을 파악 | 개별 수치 + 범위/버킷 정책 + 결측 수 | Histogram/ECharts | Violin/Plotly, ECDF | 그룹마다 bin 폭이 달라지면 비교 조건 표기 |
| 상위 지연 원인부터 개선 | 카테고리별 가중/건수, 분모, 중복 정책 | Pareto(정렬된 bar + 누적 비율)/ECharts | 표 | 분류가 겹치거나 원인이 추정이면 '원인' 단정 금지 |
| 매우 작은 차이를 정확히 비교 | 동일 단위, 동일 period, 동질 모집단 | Dot plot/bar + 값 표 | Bullet chart(목표 정의 시) | donut/gauge/3D 금지 |
| 두 집단을 같은 모집단으로 나누어 비교 | 범주·그룹·집계 규칙 | Grouped bar/ECharts | 표 | 완전히 다른 기준 기간/샘플 수는 한눈 비교 위험 |
| 전체 구성 비율 | 서로 배타적 분류와 전체 분모 | 100% stacked bar/ECharts | donut(분모 명확하고 소수 범주일 때) | 겹치는 그룹을 100%로 표기 금지 |
| Recipe×Module/Room 교차 차이 | 2개 dimension, 집계치, sample count, null | Heatmap/ECharts | Perspective Pivot, AntV S2 | null을 0으로 칠하지 말고 범례/결측 표시 |
| 여러 변수들의 상관 구조 | 수치 measure 2개 이상, 동일 grain, n | Scatter matrix / heatmap(상관)/Plotly·ECharts | table | 상관을 인과로 표현 금지, 숨은 Recipe/설비군 분해 가능해야 함 |
| CT와 Alarm Count가 연관되는가? | 짝지어진 값, ID, n, 필요 시 log 축 | Scatter/ECharts | Plotly density/hexbin | 시간대나 장비군 효과 무시한 회귀 결론 금지 |
| 점이 너무 많아 Scatter가 과밀 | 원래 pair + 2D bin 집계·density | Density/hexbin/Plotly PoC | 서버 집계 기반 heatmap | 임의 subsample만으로 밀도 해석 금지 |
| 어떤 모듈·공정이 병목 경로인가? | 유효한 단계 간 edge, duration/throughput | Sankey/Graph/ECharts | React Flow(편집 필요 시) | edge weight 없으면 Sankey 너비 임의 부여 금지 |
| 여러 설비 상태 간 전이 빈도 | from/to state + count, 스코프·기간 | Sankey/Alluvial/ECharts | 전이 행렬 | 순서 없는 범주 데이터를 Flow로 강제 금지 |
| Recipe/설비군 계층별 용량 구성 | 올바른 parent-child + metric additive | Treemap/ECharts | hierarchy table | 부모-자식 중복 합산 금지 |
| 분석/검증 파이프라인 DAG 검토 | 명시적 node/edge, status, owner | React Flow(읽기/편집 구분) | ECharts graph | 실제 실행 그래프와 임의 도식 혼동 금지 |
| Chamber/Robot 경로 탐색 | 장비 사양상 유효한 이동 node/edge | Domain graph/React Flow 또는 ECharts | Step timeline | 실제 물리 좌표 미보유 시 물리 지도처럼 표시 금지 |
| Wafer Die별 불량/수율 공간 패턴 | Die (x,y), bin/value, wafer ID, 미측정/edge mask | 전용 wafer map Canvas/WebGL(별도 PoC) | Die 측정값 표 | Wafer flow 기록만으로 die map 생성 금지 |
| Facility floor map | 좌표/배치 버전·설비 ID 유효성 | 공간 domain renderer 후보 | 위치 표 | 임의 생성된 공장 도면 사용 금지 |
| 관리 한계를 넘었는가? | 시간/lot-order, 관리도 종류, subgroup, control limits, n | SPC chart(ECharts plot + 서버 검증 계산) | 이상치 상세 목록 | 단순 ±3σ를 검증 없이 공식 SPC로 표시 금지 |
| 이상 발생 후 어느 시점부터 변했는가? | history, baseline reference, change event | Run chart + change/event markers | CUSUM/EWMA 전문 PoC | 모형과 false alarm 기준 없으면 예측 기능이라 부르지 않음 |
| 여러 기간 결과를 비교 | 동일 정의·Scope·버전/보정 정책 | Compare line/paired bar + 기간 범례 | Small multiples | 기준이 달라지면 시각 비교 전에 경고 |
| 1차 데이터 품질 문제/지연 적재 | assessment, coverage, freshness, affected count | Status matrix + Trust + 누락 표 | heatmap | 미수집·가공 지연·결과 없음·권한 부족 혼동 금지 |
| 수백만 Raw Data 행을 보고 싶음 | 정렬 가능 stable ID, 필터/페이지 포트 | 서버 페이징 `PlatformDataTable` + Virtual | AG Grid Enterprise(필수 검증 뒤) | 대량 전체를 브라우저 로딩 금지 |
| 엑셀과 함께 검토할 행 데이터를 추출 | 현재 필터·Scope, 헤더·time/ID 의미 | 기존 표 내보내기(XLSX)/행 복사 | 대용량 export의 서버 파일 경로는 별도 결정 | 화면에 로드한 행과 전체 검색 결과 혼동 금지 |
| 그룹/행/열을 즉석에서 피벗 | additive 원 값, 2~3 차원, maxRows, Trust | Perspective v5 PoC(#163) | AntV S2 또는 Graphic Walker | 공식 지표 계산식 덮어쓰기 금지, 비율 평균 금지 |
| 사용자가 차트 X/Y/color를 교체 | dimensions·measures 타입, unit, valid aggregates | Guided Builder + ECharts recipe | Graphic Walker UX PoC | 의미 없는 axes 조합/비호환 engine은 비활성 사유 제공 |
| 여러 그리드를 동시 필터링 | stable selection identities + 동일 dataset grain | Cross-filter bus(계약 후보) | Perspective workspace(탐색 내부) | 전역 URL Context는 묵시적 변경 금지 |
| 템플릿으로 반복 분석 | 안전한 analysis spec, metricId+version, dataset reference | 저장형 Analysis Spec + 복원(Deferred) | 타인과 공유/템플릿 | 데이터 행 자체, 토큰·자격 증명은 저장 금지 |
| 사용자가 카드 위치/크기를 변경 | 사용자별 승인된 layout schema/panel IDs | Dockview(탭/분할) 또는 RGL(카드형) | 고정 `AnalysisLayout` 기본값 | 라이브러리 내부 JSON을 플랫폼 공개 저장형식으로 쓰지 않음 |
| 차트 내 특정 결과로 상세 이동 | 목적지 메뉴 ID, context capability, row/entity ref | Kernel `resolveLink` / `linkTo` | 상세 drawer | 임의 URL 조립, 권한 없는 상세 데이터 노출 금지 |
| 사용자 업로드 CSV·Parquet를 별도 분석 | 사용자가 승인한 파일, schema, 용량상한 | 브라우저 DuckDB-Wasm 후보 | 서버 import 계약 별도 | 운영 DB를 브라우저 엔진/SQL로 직접 연결 금지 |
| 처리시간 예측/이상점 자동 판정 | 모델 버전, 검증 집합, 분포 변화, false positive 기준 | **기본 제공하지 않음**(별도 ML 설계) | 점수만 plot | 단순 시각화로 예측 정확도 보장 금지 |

## 2. 필드와 통계 연산의 안전한 합성

| 필드/측정 타입 | 허용 가능한 계산 예 | 경계 |
| --- | --- | --- |
| count/duration/sum 원시 값 | sum, count, min/max, 가중 평균(분모 있을 때), 분위수(원본 또는 서버 계산) | duration은 시간 단위·grain 표시; 분포에 표본 수 필요 |
| percent/rate 공식 지표 | 서버가 계산한 `metricId + metricVersion` 결과 표시 | 행별 비율의 SUM/AVG 금지. 분자/분모와 재집계 정의가 제공되면 **서버**에서 계산 |
| categorical dimension | group by, distinct, filter, count | 대량 고카디널리티 값은 Top-K+Other/탐색 검색; category sort 안정 |
| datetime instant | 기간 필터, 명시된 time zone으로 표시, date bucketing(서버 우선) | `Date.now()`의 epoch-ms, naive wall-clock, LWC seconds를 혼합하지 않음 |
| interval [start,end) | duration, state occupancy, overlap/gap diagnosis | 열린 end, 타임 도메인 경계, 부정확한 pairing은 separate status |
| id/opaque key | join/selection/drill | 열람 권한 검증 전 공유 URL·캐시·telemetry 등에 ID 누출 금지 |
| nullable measurement | missingness statistics, explicit empty cell | null != 0; 미수집/품질 오류/필터 0건 구별 |

**시각화 자동 추천에서 필수 입력(Candidate):** dataset reference/endpoint + grain + fields(role, type, unit, nullable, cardinality) + measures(aggregateSemantics, `metricVersion`, numerator/denominator 필요성) + timeSemantics(instant/wall-clock, precision, zone) + sampling(maxRows, coverage) + outcomes/trust + interaction allowed.

## 3. 엔진별 선택 게이트

| 엔진 | 켜는 조건 | 반드시 측정할 것 |
| --- | --- | --- |
| ECharts Canvas | 기본 유형, 인터랙션, 현재 UX와 일치 | 신규 series의 bundle 증가, 여러 차트 동시 업데이트, 표·키보드 대체 |
| Lightweight Charts | 고밀도 추세, 가벼운 갱신, 여러 Pane가 분석 목적일 때 | series별 unique monotonic seconds; ms/동일 시점 loss; naive wall-clock 변환; licensing NOTICE/링크 |
| uPlot | LWC/ECharts가 부하를 못 견디고 선형 시계열만 필요 | 입력 수 × series 수 × chart 수, 메모리, pointer/brush UX |
| Perspective v5 | 자유 피벗 수요 #163 해제, 데이터셋 row cap 내 결과 | `menuQuery`와 일치하는 데이터/Trust; worker/WASM 자체 호스팅; WebGL fallback; workspace save format v5 검증 |
| Graphic Walker | 직접 chart composing UX가 별도 가치를 증명 | 필드 역할/계산 DSL 검증, 임의 서버 통신 차단/adapter 경계, 라이선스 |
| Plotly | 기본 ECharts 구현 비용이 유독 높은 통계 유형 | 대형 bundle, 애니메이션, tooltip/a11y, 3D 예외 근거 |
| AG Grid Enterprise | #164 기존 Deferred 해제 + 엑셀 업무 필수 + 구매 승인 | 읽기/쓰기 분리, 06 §15 및 열 API 호환, 가격, 브라우저/내부망 라이선스 |
| Dockview/RGL | 06 §14 자유 배치 Deferred 해제 + 실제 반복 워크플로 | 복원/마이그레이션, touch는 MVP 범위 밖, 탭/분할 UX, 키보드 이동, 오류 격리 |
| DuckDB-Wasm | **허용된 결과나 사용자 파일**의 재분석이 필요 | 브라우저 메모리/Worker/확장 다운로드/외부 네트워크 없음 확인 |

## 4. 화면별 추천 조합

| 화면 유형 | 우선 레시피 | 추가 UX |
| --- | --- | --- |
| Overview | KPI(서버 공식값) + ECharts trend + Trust | 불필요한 3D/게이지 배제, 결과 상세로 이동 |
| Analysis | ECharts chart frame + breakdown table + explicit select/apply | 조건 비교, Legend, Brush→표, 근거 표시 |
| Management | `PlatformDataTable` + 필터 + audit | bulk write는 별도 검증된 계약 없으면 읽기 전용 |
| Catalog | Metric definition/version/status + 사용처 | 정의와 계산 결과를 분리 |
| Workflow | 상태/이벤트 표 + audit timeline | node editor는 실제 도메인 사용이 확인될 때만 |
| Exploration(후보) | 제한된 데이터셋 + Pivot + Guided Chart + User view | 편집형·공유형·저장형 단계별 승인; 기존 Analysis를 대체하지 않음 |

## 5. API/UI가 반드시 설명해야 하는 실패 이유

- **지원 안 됨:** “서버에 XY 좌표가 없어 Wafer Map을 제공할 수 없습니다.”
- **모집단 부족:** “분포를 계산할 수 있는 관측치 수가 부족합니다(n=…).”
- **정의 오류:** “이 비율은 평균 가능한 수치가 아닙니다. 공식 지표 계산을 선택하세요.”
- **데이터 과대:** `too_large` + 기간 축소/그룹 집계/필터 선택. 브라우저 행 일부만 출력하고 전체인 척하지 않음.
- **권한:** `forbidden` + 허용된 빈 상태를 섞지 않음.
- **구현 미지원:** “현재 차트 엔진에서 밀리초 단위 중복 이벤트를 표시할 수 없습니다. 이벤트 타임라인으로 전환하세요.”
- **품질 제한:** `stale`/`partial`/coverage가 있으면 시각 정보와 표 요약에 함께 표시.

기능 선택기의 추천 점수는 언제나 **이유를 보여주는 규칙 기반**이어야 한다. 임의 AI 추천으로 공식 분석 방법이 결정되거나, 추천 결과가 데이터·권한 판정을 바꾸면 안 된다.
