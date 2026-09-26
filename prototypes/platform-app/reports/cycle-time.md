# 사이클타임 상세 — 구현 보고

Analysis Workspace 소비 화면. 플랫폼 계약(archetype, 공통 컴포넌트, 메뉴 간 링크)을 검증하는 용도이며 사이클타임 지표 정의의 완료가 아니다.

## 만든 것

- `src/pages/analytics/CycleTimeDrilldown.tsx` — `/analytics/cycle-time`. Header → Global Context(셸) → 페이지 필터 → KPI 4장 → P50/P95 추세 → 분포 → 느린 실행 표 → Data Trust.
- `src/pages/analytics/ExecutionDetail.tsx` — `/analytics/executions/:equipmentId`. 식별 키 3개, 공정 타임라인, 구간 표, 품질, 리니지, 복귀/설비/VOC 링크.
- `src/pages/analytics/cycleData.ts` — `EQUIPMENT`에서 시드한 합성 Job. 창 `2026-06-20`–`2026-09-26T09:00:00`.

조회는 모두 `usePlatformQuery(serve(...))` + `QueryView`, 표는 `loadPage` → `serve` + `sortAndPage`. 분석 화면 `maxHours: 24 * 31`.

## 플랫폼 계약

| 계약 | 이 화면 |
| --- | --- |
| §12.2 Analysis Workspace | KPI → Primary Chart(Selection/Annotate는 Chart Frame) → 분포 → Breakdown Table → Data Trust |
| §6 metric 쌍 | 없으면 `cycle_time` v3를 **페이지 기본값**으로 표시하고 URL에 쓰지 않음. `metricId !== cycle_time`이면 **미적용** 배지, 전역 쌍은 유지 |
| §6.4 returnTo | `pageParam('returnTo')` 그대로 이동. 없으면 `linkTo('cycle-time')` |
| §15 표 | 서버 정렬/페이지, 행 선택, CSV, 컬럼 설정 |
| §16 차트 | Zoom/Brush/Reset/Compare/Annotate/Export. 점 클릭은 전역 기간을 바꾸지 않음. 구간 승격은 프레임의 “분석 구간 적용” |
| §19 | loading/refreshing/empty/forbidden/too_large/timeout/error/unknown은 응답 시나리오와 `maxHours`로 재현 |
| §22 | 상세는 `linkTo('execution-detail', { params.equipmentId, page.entityType/anchor, returnTo })`. Selection을 목적지 ID로 바꾸지 않음. 일괄 “선택 설비로 분석 좁히기”만 `setGlobal({ selection })` + toast |

등록 page key만 URL에 둔다. `granularity=hour|day`, `percentile=p50|p95|all`, `sort=column:asc|desc`. 잘못된 값은 다른 값으로 바꾸지 않고 오류 문구를 낸다.

## Candidate (Open을 닫지 않음)

- 집계 기본값: 기간 ≤48h이면 `hour`, 아니면 `day`. URL에 없을 때만.
- 꼬리 기본값: `≥ P95`(표시값, 동률 포함). KPI·차트 모집단은 줄이지 않는다. `all`은 전체 실행.
- 분위수: 선형 보간 후 0.1분 반올림. 미완료 Job은 만들지 않음.
- 분포 구간: `[0,30) [30,45) [45,60) [60,75) [75,90) 90+`.
- 정렬 기본값: `cycleMin:desc`.
- 증감 화살표는 직전 동일 길이 기간 대비이고, 사이클타임 **감소를 개선**으로 칠한다.
- Compare 시리즈는 이전 기간의 **실제 시각**에 찍는다. 현재 창에 겹쳐 그리지 않는다.
- 점 클릭은 그 버킷 ∩ 꼬리 조건으로 목록만 줄인다. 이전 기간 점은 드릴하지 않는다.
- `entityType`은 `job`만 연다. 다른 값·소수 anchor·누락 키는 오류이며 Lot/근접 시각으로 복원하지 않는다.
- 타임라인은 XFR/FNC/PRC. 빈 구간은 미분류(대기·불량 아님). Module/Slot은 합성 속성. Wafer Journey와의 관계는 Open이라 연결하지 않음.
- 품질은 `unknown`(미확정) 또는 `review`(합성 플래그). 정상/불량·수율로 쓰지 않는다.
- 전역 `cycle_time`이 v3가 아니면 버전 **라벨만** 적용하고, 합성 시계열은 v3 하나뿐이라고 적는다. 다른 세대 숫자는 만들지 않는다.

## Platform gaps

- 버킷·분포 구간을 담을 page key가 없다(`granularity`/`percentile`/`sort`만 등록). 두 필터는 화면 상태이며 URL·`returnTo`에 남지 않는다. 화면 캡션에 적어 두었다.
- `PlatformDataTable` 정렬이 비제어다. URL `sort`가 데이터 기준이고, 헤더 클릭은 `sort`에 다시 쓴다. 헤더를 세 번 눌러 정렬을 지우면 화살표만 꺼지고 URL 정렬은 남는다. 정렬 셀렉트를 바꾸면 표를 remount해 헤더 상태를 비운다.
- `serve()`는 메뉴 capability와 무관하게 Selection/room/condition/lot/recipe를 적용하고, `maxHours`는 selection이 비어 있으면 장기 기간을 `too_large`로 막는다. 실행 상세는 전부 reference라, 조회에 넘기는 global 복사본에서 그 필터만 지우고 `maxHours`는 넘기지 않는다. 그렇지 않으면 따라온 90일 기간이 객체를 숨긴다. Scope 권한 집합은 그대로 재검증한다.
- `voc`에 occurrence page key가 없다. `linkTo('voc')`는 전역 Context만 옮긴다. 목적지 ID를 Selection에 넣지 않는다.
- envelope `trust.source`는 서버가 모든 조회에 `mart.productivity_hourly`로 찍는다. 사이클타임 전용 원천명으로 바꿀 수 없다.
- `returnTo`는 태스크대로 불투명 URL을 그대로 연다. 와이어프레임 Candidate(검증된 Registry 목적지)는 구현하지 않았다.

## 검증

- `./node_modules/.bin/tsc --noEmit` — exit 0 (이 보고 직전, 키 구분자만 `|`로 바꾼 뒤의 타입은 동일).
- `./node_modules/.bin/vite build` — 성공 (`CycleTimeDrilldown`, `ExecutionDetail` 청크 포함).
- `vite-node` 스모크: ICH 권한 설비 38대, 기본 24h 실행 166건, P50 47.3, P95 91.9, 느린 실행 9, 시간 버킷 24. 식별 조회는 ok / missing / forbidden을 구분.
- 브라우저 `http://127.0.0.1:5190` (ego-browser):
  - 한/EN. KPI 47.3 / 91.9 / 166 / 9, 페이지 기본값 `cycle_time` v3, Data Trust(수집 unknown·커버리지 98.7%·잠정).
  - `granularity=day`, `percentile=all`(목록 166, 모집단 166 유지), `sort=anchor:asc`(첫 행 2026-09-25 09:02:10).
  - Compare 켜면 “P50/P95 이전 기간” 범례.
  - 추세 점 클릭 → “Bucket/버킷” 칩. 전역 기간 URL은 유지.
  - 행 “상세” → `/analytics/executions/ICH-CVD-0168`, `entityType=job`, `anchor=2026-09-25T09:02:10`, returnTo에 day/all/sort 보존. 키 3칸과 XFR/FNC/PRC/PRC. “돌아가기”가 그 URL을 복원.
  - 설비 상세 href는 `/equipment/:id` + `returnTo`, Selection 치환 없음. VOC href는 `/voc` + 전역 기간만.
  - `entityType=wafer` + 소수 anchor → 오류, 타임라인 없음, 반올림 없음.
  - 없는 설비 + 유효 anchor → No matching result, XFR 없음.
  - `metricId=yield&metricVersion=9` → Not applied, URL의 yield 유지, 화면은 cycle_time.
  - 90일 링크 → “Query too large” 3곳(확인 시점). 표도 같은 `maxHours`.
  - 응답 시나리오 0건 → “No matching result”.
  - 체크박스 후 “선택 설비로 분석 좁히기” → `selectedEquipmentIds=ICH-ETCH-0142`, toast, `percentile=p95` 유지.
  - 390px: KPI 2열, 가로 오버플로 없음.

브라우저에서 하지 않은 것: 분포 Brush 뒤 “이 구간 실행 보기”(캔버스 brush), 점 클릭 후 목록 건수의 재집계, 시나리오를 empty에서 Normal로 되돌리는 팝오버 두 번째 클릭(empty 진입 자체는 확인). 헤더 정렬 화살표와 URL `sort`의 불일치는 위 gap 그대로다.
