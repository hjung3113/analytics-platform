# 생산성 개요 (productivity-overview) — 구현 보고

작업: `docs/11_productivity_overview_wireframe.md`의 Overview archetype을 `prototypes/platform-app` Consumer 화면으로 구현. 날짜: 2026-09-26.

## 빌드한 것

`src/pages/analytics/ProductivityOverview.tsx` + `src/pages/analytics/productivityData.ts` (합성 데이터, 결정적 시드). Overview §12.1 6영역 순서:

1. **Header/Global Context** — `PlatformPage` 슬롯. primary "사이클타임 상세 보기"(`linkTo('cycle-time')`, Context 보존), secondary 새로고침(4개 쿼리 `refetch`), `dataTrustSummary` = KPI 쿼리의 `DataTrustIndicator`.
2. **contextExtension (page filter)** — 집계 단위 hour|day|week 세그먼트(radiogroup). URL 키 `granularity`(registry pageKeys에 등록된 유일한 키). 미지정 시 기본: 기간 ≤48h → hour, 아니면 day. "전역 필터가 아님"을 라벨·캡션으로 명시. 미지정·알 수 없는 값(`granularity=year`)은 기본 정책 적용 + warning 배지(조용한 보정 아님).
3. **KPI row (StatCard ×4)** — 물리 점유율(% + 6px progress track chart-blue, 분자/분모 캡션), 비Process 체류(h/Job, 총 체류시간 ÷ 완료 Job), 사이클타임 P50(32px)/P95(22px, 분), Job 처리량(Job, 완료/착수 = coverage 분자/분모). 전 카드 직전 동일 길이 기간 대비 delta(방향별 good 판정). 카드 클릭 = 아래 추세 선택(페이지 로컬 상태).
4. **Main trend** — `AnalysisChartFrame` time axis. 선택 KPI별 시계열(처리량 = chart-purple bar·0축, 점유율/체류 = line, 사이클 = P50·P95 2 라인). Compare = 직전 동일 기간(bucket index 정렬, cat-amber 점선). 처리량 설명에 "합계 = KPI 카드와 동일 합산"(동일 hour-bucket 합산으로 보장). Brush→"분석 구간 적용"→전역 기간 승격 동작 확인.
5. **Breakdown** — room_name/StGroup 축 토글(페이지 로컬 Candidate) + `AnalysisChartFrame` xType=category stacked(점유 chart-blue / 명명된 잔여 "미점유(관측 가능 시간)" chart-remainder) + 분자·분모·%·Job 표(정렬 가능, aria-sort). 백분율은 항상 접근 가능한 표에서 분자/분모와 함께 노출.
6. **Attention list** — 비Process 체류 상위 3 + P95 상위 3 (`attentionRows`, 랭킹만 — 임계값 판정 없음). 각 행 StatusBadge(neutral) + 두 링크: `cycle-time`는 `global: { selection: [id] }` 명시 교체(§22), `equipment-detail`는 `params` + `returnTo`(목적지 ID와 분석 Context 분리).

## 검증한 플랫폼 계약 (실제 브라우저로 실행, http://127.0.0.1:5190)

- **§19 상태 taxonomy (위젯별 격리)** — 플라스크 시뮬레이터로 error(4 위젯 각자 오류 + Correlation ID 4개), empty(4× "조건에 맞는 결과"), timeout(4× 재시도 버튼), forbidden(4×), unknown_status(DataTrust "일부 상태 미확인 (4)", coverage "—") 확인. too_large는 실제 90일(2829h > maxHours 2160) URL로 4 위젯 확인. 정상 복귀 확인.
- **명시적 빈 Selection** — `equipmentSelection=none` → 4 위젯 모두 outcome empty("조회는 성공했고 결과가 0건"), 오류 아님. 각 위젯에 "명시적 빈 Selection 지우기" 액션 → 1클릭 복원(마커 제거·데이터 복귀 확인).
- **URL page state** — `granularity=day|week` URL 반영·복원, 라디오 선택 상태 일치. KPI 선택·breakdown 축은 의도적으로 URL 미기록(로컬 상태).
- **Context Link** — cycle-time 링크 href에 `selectedEquipmentIds=<id>` + 전역 기간/scopeId 보존; equipment-detail 링크 `/equipment/<id>?...&returnTo=<현재 URL incl. granularity>`.
- **미확인 vs 0** — DATA_THROUGH(2026-09-26T08:00) 이후 bucket은 null(툴팁 "미확인"), KPI 분모·합계에서 제외. 체류/점유율은 완료 Job/분모 0일 때 "—"로 미확인 표시.
- **i18n** — 한/EN 전환으로 전 위젯 문구 확인(Four-metric summary, Slowest P95, Occupied h (numerator) 등). 마스터 값(ID·room·StGroup)은 미번역.
- **차트 렌더** — canvas 2개 실제 페인트 확인(비빈 픽셀 샘플). 스크린샷 `/tmp/productivity-ko.png` 촬영(비전 QA 응답이 환각이라 픽셀 검증으로 대체).
- **tsc --noEmit 0 에러(전체 프로젝트), vite build 성공.** (도중 `MetricCatalog.tsx`가 다른 워커의 진행 중 상태로 일시 오류 — 내 수정 없이 재실행 시 해소됨.)

## Candidate 선택 (wireframe Open 항목)

| 항목 | 선택 | 근거 |
| --- | --- | --- |
| 버전 표시 | 응답 `trust.metricVersion`에 4개 버전 합성 문자열로 전달(카드 캡션에 개별 표시). page-owned 버전 키 미사용 | registry pageKeys가 `granularity`뿐. README 규칙 4(미등록 키 금지) |
| 주 시작일 | Monday 00:00 정렬 | wireframe §3.1 bucket 규칙 Open — 화면에 명시 |
| 부분 bucket | 양끝 잘라 정렬된 bucket에 귀속, bucket 라벨은 정렬 경계 | wireframe Open |
| Coverage 분모 | 착수 = 완료 ÷ (1−dropRate) 합성 | wireframe §6 coverage 분모 Open |
| Attention 배지 | neutral 톤 라벨("체류 상위"/"P95 상위") | §1 임계값 이상 판정 금지 |
| 조회 상한 | maxHours 2160 (90일) | §27 상한 Open — 프로토타입 가드 |

## Platform gaps

1. **지표별 버전 page key 미등록** — wireframe §3.1은 `occupancyVersion` 등 4개 page-owned 키를 Candidate 선언하지만 registry `productivity-overview.pageKeys = ['granularity']`. 버전 선택 UI를 만들 수 없어 응답 표시로 대체. registry 확장 필요.
2. **Trust envelope의 metricVersion 단일 필드** — 네 지표 버전을 한 필드에 합성 문자열로 넣어야 함(§18은 지표별 버전 요구).
3. **StatCard에 secondary 값 슬롯 없음** — P50/P95 두 숫자를 value ReactNode 조합 + `t-stat-2` 유틸리티로 우회(유틸리티는 존재).
4. **시나리오 `partial`이 serve에서 무처치** — `partial`은 normal과 동일하게 동작(mock/server.ts 시나리오 분기에 없음). 위젯 일부만 실패하는 국면은 시뮬레이터로 재현 불가.
5. **AnalysisChartFrame compare 시리즈가 x축 범위 밖 이전 기간 timestamp를 그릴 수 없음** — bucket index 정렬로 우회(표준 관행이나 프레임 차원 정렬 옵션 부재).

## 하지 않은 것

- Wafer Journey·실행 목록·occurrence 상세·편집 CRUD (wireframe §1 명시적 제외).
- SEMI E10 가동률·수율 등 대체 지표.
- 임계값 기반 알림/이상 판정 (§1 금지).
