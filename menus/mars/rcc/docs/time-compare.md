# RCC Process 시간 비교

**Candidate · #2496 · v0.45 합성 데이터 시안. 실제 데이터 조회와 배포는 미구현([#2694](https://github.com/hjung3113/analytics-platform/issues/2694)).**

[이슈 #2496 및 소유자 결정](https://github.com/hjung3113/analytics-platform/issues/2496) · [분석 작업 영역](../../../../docs/contract/layout.md#122-analysis-workspace) · [차트 계약](../../../../docs/contract/chart.md#16-analysis-chart-contract) · [HW Time 패널](../../../../docs/adr/0165-workspace-per-step-panels-add-and-pin.md)

## 1. USER TASK

**Decided.** 공정·설비 엔지니어가 설비의 L1 총시간부터 Layer, Step, Lot과 Wafer 실행까지 좁혀 보며 느린 공정 구간을 찾는다. 데스크톱 시안은 최대 설비 12대, 구성 유형 2종, 유형별 Step 18개, 일별 자료 14일을 사용한다.

## 2. IA

```text
플랫폼 Shell → 분석 → MARS → RCC (/mars/rcc)
  ├─ 셸 조회 막대 [기간] [대상] [조회]
  ├─ 비교 단위 [PPID별 / Recipe별 / PPID·Recipe] [좁히기]
  └─ 전체 → 비교 묶음 (L1 총시간) → Layer 선택 → Step 선택
      ├─ Layer 선택 화면: 설비별 Layer 시간
      ├─ Step 선택 화면: Step 막대와 Step × 설비
      └─ 선택 Step: Wafer 산포, 일별 추세, Lot·Wafer 실행 표
```

**Decided.** 한 화면 안에서 이동하고 앞 단계 패널을 유지한다. [플랫폼 탐색](../../../../docs/contract/kernel.md#9-information-architecture) · [드릴 경로](../../../../docs/adr/0025-drilldown-level-page-keys-path-bar-layout.md)

## 3. SCREEN INVENTORY

| 상태 | 입력과 결과 |
| --- | --- |
| L1 총시간 | 기간·대상·비교 단위·좁히기 → 설비별 L1 가로 막대. 비교 묶음 이름으로 Layer 단계 진입. |
| Layer | 선택 묶음 → 설비별 Layer 시간. Layer 막대 또는 이름으로 Step 단계 진입. |
| Step | 선택 Layer의 비교 묶음 → 설비별 Step 시간과 기준 대비 편차. Step 이름·막대·히트맵에서 실행으로 진입. |
| Lot / Wafer | 선택 Step → 비교 가능 설비 전체 산포, 기준과 초점의 일별 추세, Lot ID·Wafer ID가 있는 실행 표. |
| 빈 결과와 오류 | 자료 기간 밖, 대상에 속한 합성 설비 없음, 비교할 묶음 없음은 각각 빈 상태. 대상 목록 조회 중에는 로딩, 실패하면 재시도. 잘못된 URL 값은 공통 경고와 복구. |

## 4. WIREFRAME

공통 `[셸 기간 · 대상 · 조회] [비교 단위 · 좁히기 · 구성 · 기준]`

```text
1  [비교 묶음 목록] [설비별 L1 가로 막대 · 비교 기준]
2  [Layer 목록]    [설비별 Layer 가로 누적 막대 · Start Align]
                   [이전 · L1 총시간]
3  [Step 목록]     [설비별 Step 누적 막대] [Step × 설비]
                   [이전 · Layer 시간]
4  [선택 Step · 설비 초점]
   [Wafer 산포] [일별 추세]
   [실행 표 · Lot ID · Wafer ID]
   [Step 목록] [이전 · Step 막대] [선택 셀을 강조한 Step × 설비]
```

**Decided.** 비교 묶음·Layer·Step 목록은 차트 옆에 둔다. Step 막대는 왼쪽, 히트맵은 오른쪽에 놓는다. 실제 L1 총시간은 설비별 마름모 표식과 독립 라벨로 읽는다. Step 합은 누적 막대에서 읽는다.

## 5. COMPONENT MAP

| 책임 | 조립 |
| --- | --- |
| 기간·대상 | Manifest의 Context·apply 선언으로 셸 `QueryBar`의 `PeriodFields`와 `TargetPicker` 사용. |
| 비교 좁히기 | `SegmentedRadio`, `FacetedSetDialog`. PPID별 결과는 PPID 하나당 한 행, Recipe 관련 결과는 상세 비교 묶음 하나당 한 행. |
| 단계 이동 | Manifest drill, `DrillLayout`, `LegendTree drillOnName`, 차트 지점·셀 활성화. [메뉴 소유 차트 조각](../../../../docs/adr/0063-consumer-owned-chart-pieces-and-unbounded-drill.md) |
| 비교 | `PanelWorkspace`의 단계별 프리셋. `AnalysisChartFrame` 가로 막대, Layer가 둘 이상일 때 Start Align(조각 값), 하나면 행 합계 값, `rowGroups`, Step의 `categoryValueMarks`, 두 막대의 `emptyCategoryLabel`. `AnalysisChart`의 발산형 히트맵, `nullLabel` 및 `selectedCell`. |
| 증거 | `AnalysisChart` 설비별 scatter, `AnalysisChartFrame` 일별 추세, `PlatformDataTable` 실행 표. |

## 6. DATA REQUIREMENTS

- **Decided.** 상세 비교 묶음은 PPID + Process Layer + Recipe, Step 키는 StepNo + StepSeq다. Recipe가 여러 곳에서 쓰이면 PPID와 Layer를 표시한 별도 행으로 남긴다.
- **Decided.** L1 총시간, Layer 시간, 각 Step 시간과 Wafer 실행 시간은 독립 지표다. 기준은 현재 비교 가능한 묶음의 중앙값 또는 선택 설비다. 여러 날의 값은 «일별 평균 소요시간 · 일별 값 평균(N일)»로 표시한다.
- **Candidate.** 시안은 PPID 3개와 여러 Layer, PPID를 넘나드는 공통 Recipe, 설비·일자별 Lot과 여러 Wafer를 제공한다. PPID별 L1은 각 상세 비교 묶음의 합성 L1 일별 표본을 건수 가중해 보여 준다. 동일 PPID의 공정 한 회에 대한 합산 총시간의 정의는 운영 계약에서 확인한다. EQ-008/009는 일부 Step에 큰 지연을 둔다.
- **Candidate.** Mock 셸의 MEM 설비 ID 12개에 RCC의 EQ-001–012 별칭을 고정해 현재 Scope에서 허용된 대상만 표시한다. 조회 대상 중 합성 자료가 없는 설비가 있으면 대상과 자료 보유 설비 수를 함께 표시한다. 합성 자료는 선택 기간에 온전히 포함된 일별 값과 일수를 사용한다. 선택 Step의 Lot ID, Wafer ID, 시작 시각, 설비, 실행 ID와 소요시간을 표에서 확인한다.

## 7. INTERACTION RULES

- **Decided.** 좁히기에서 축 사이는 AND, 축 안은 OR다. 다른 축 때문에 개수가 0이 된 값과 기존 선택을 유지한다. [조회 대상과 교차 개수](../../../../docs/adr/0164-target-picker-dialog-and-custom-groups.md)
- **Candidate.** PPID별에는 PPID, Recipe별에는 Layer·Recipe, PPID·Recipe에는 PPID·Layer·Recipe를 펼친다. 모드를 바꿀 때 하위 경로를 지우고 숨긴 축의 선택은 해당 축으로 돌아올 때 복원한다.
- **Decided.** 첫 진입에는 선택 대상 중 설비 수 최다 구성 유형을 쓴다. 다른 구성을 «비교 보류»로 남기고, Layer·Step 막대의 해당 행에 «비교 보류» 문구를 표시한다(`emptyCategoryLabel`). 히트맵은 기준과의 차이(초)를 표시하며 0은 «기준과 같음»이다. 산포에는 모든 비교 설비가 나오며 선택 설비만 강조한다.
- **Decided.** Step 목록·막대·히트맵은 Step 10부터 같은 순서로 읽는다. 목록은 현재 Step에 표식을 표시하고, 히트맵은 URL의 Step과 설비가 가리키는 셀에 테두리를 표시한다.
- **Candidate.** 비교 단위·좁히기·구성 변경은 하위 경로를 초기화한다. 기간·대상 적용은 manifest의 Context 초기화 규칙을 따른다. URL은 `mode`, 반복 facet 키, `structure`, `baseline`, `unit`, `layer`, `step`, `equipment` 및 전역 Context로 복원한다.

## 8. DESIGN DECISIONS

- **Decided.** Step 단계는 단일 시안으로 검토한다. 셸 조회, 네 단계 드릴다운, Recipe별 상세 비교 묶음 행, 별도 L1 표식, Lot ID가 검토 범위다.
- **Candidate.** 초기 비교 단위는 PPID·Recipe이며 첫 일치 묶음을 L1 패널에 표시한다. Layer 단계에서는 상세 비교 묶음별 Layer 시간 시리즈를 쓴다. 같은 Layer에 Recipe가 두 개면 각각 구분해 탐색한다.
- **Deferred.** 수동 매칭, NonProcess, L3/L4는 v0.45에서 미구현. 다시 여는 조건은 [백로그](../../../../.planning/backlog.md)의 «RCC 수동 Step 매칭·NonProcess View·L3/L4»를 따른다.

## UX REVIEW · 문서

반복 StepNo에는 StepSeq를 함께 표시한다. 기준명과 수치는 L1 차트 위 한 줄에서 읽는다. Step 합과 L1 총시간은 독립 단위로 읽을 수 있어야 한다. 데스크톱 캡처에서 막대와 히트맵 라벨, 포인터·키보드 진입, 앞 단계 유지, 페이지 스크롤을 확인한다.

## OPEN QUESTIONS / RISKS

- **Open.** 동일 PPID에서 Layer마다 Recipe가 하나인지 확인한다. 합성 자료는 Layer당 하나로 만들고 화면은 같은 Layer의 Recipe가 여러 개여도 상세 비교 묶음을 각각 표시한다. 확인은 [#2694](https://github.com/hjung3113/analytics-platform/issues/2694).
- **Open.** 운영 PPID 단위 L1의 정의, 공급 지표명, Original/Effective 기준, Process-only 판별, StepSeq 보존, 일부 건수 또는 날짜 불일치 처리 규칙을 확인한다. 확인은 [#2694](https://github.com/hjung3113/analytics-platform/issues/2694).
- **SDK gap.** 셸의 커스텀 조회 그룹 확장은 메뉴 쿼리 전송 경로에서 이뤄진다. 메뉴 내 합성 자료만 쓰는 시안에서 그룹과 과거 소속 조건은 명시적 자료 없음 상태로 표시한다.
