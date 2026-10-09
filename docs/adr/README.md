# ADR — 결정 기록

실제 대안 중에서 고른 결정, 되돌리기 어려운 결정을 남긴다. ADR은 **결정과 이유**만 둔다. 세부 규칙은 소유 문서(06·01·DESIGN.md·`integration/*`)에 두고 ADR은 그쪽을 링크한다. 결정 상태 한눈 보기는 [05 결정 상태](../05_roadmap_and_open_questions.md), 아직 답이 없는 결정은 [`.planning/README.md`](../../.planning/README.md) "결정 대기".

## 목록

| ADR | 결정 | 상태 |
| --- | --- | --- |
| [0001](0001-scope-hierarchy-site-line-only.md) | Scope 계층은 Site→Line 2단계, Factory는 모델링하지 않음 | 부분 대체(2026-09-24) — Factory 미모델링만 유지, 나머지는 0005 |
| [0002](0002-stgroup-materializes-to-equipment-ids.md) | Equipment Group URL은 Condition / Selection 두 층 | Decided(2026-09-24 개정) |
| [0003](0003-equipment-master-platform-owned-target.md) | 설비 마스터는 플랫폼이 등록·관리하는 시스템이 목표 | Decided(2026-09-24) — 필드별 전환 순서는 Open |
| [0004](0004-site-is-db-partition-not-column.md) | Site는 조회 조건이 아니라 물리적으로 분리된 DB | Decided(2026-09-24) |
| [0005](0005-scope-room-name-line-independent.md) | 권한·조회 Scope는 room_name 기준, Line은 독립 축 | Decided(2026-09-24) |
| [0006](0006-grid-free-first-engine-hidden-from-menus.md) | 그리드 편의 기능은 무료 경로 먼저, 표 엔진은 메뉴에 숨김 | Decided(2026-10-02) |
| [0007](0007-perspective-browser-engine-only.md) | 자유 피벗 엔진(Perspective)은 브라우저 안에서만 | Decided(2026-10-02, 플랫폼) |
| [0008](0008-table-owned-export-fixed-toolbar.md) | 표 내보내기·복사는 표 부품 소유, 툴바 고정 배치 | Decided(2026-10-02) |
| [0009](0009-production-assembly-injection.md) | 운영 빌드는 조립 모듈 주입, CI가 운영 그래프에 mock 없음을 확인 | Decided(2026-10-05 승인) |
| [0010](0010-feedbackops-design-system-shared-on-tailwind-v4.md) | FeedbackOps 디자인 시스템 공유(Tailwind v4, `@fops/ui` 직접 참조) | Decided(2026-10-03) |
| [0011](0011-design-direction-feedbackops-shell.md) | 디자인 방향: FeedbackOps 토큰 + FeedbackOps 셸 구조(C안) | Decided(2026-10-04) |
| [0012](0012-chart-thin-line-stroke-aliases.md) | 차트 얇은 선은 전용 진한 stroke 별칭 | Decided(2026-10-04) |
| [0013](0013-detail-panel-shell-docked-slot.md) | 상세 패널은 셸 소유 오른쪽 고정 슬롯(B안) | Decided(2026-10-04) |
| [0014](0014-chart-legend-period-grouping.md) | 차트 범례는 비교 기간별로 묶음 | Decided(2026-10-04) |
| [0015](0015-context-bar-priority-overflow.md) | Context 바는 우선순위 넘침으로 한 줄 유지(B안) | Decided(2026-10-04) |
| [0016](0016-page-filter-bar.md) | 페이지 필터는 공통 PageFilterBar 한 줄 | Decided(2026-10-04) |
| [0017](0017-shared-outcome-banner.md) | 같은 위젯 응답은 페이지 배너 + 간결 상태 | Decided(2026-10-04) |
| [0018](0018-feedbackops-stage2-screens-into-platform-menus.md) | FeedbackOps 2단계: 화면은 플랫폼 메뉴로, 백엔드는 도메인 API로 유지(A안) | Superseded(2026-10-09) — 0027 |
| [0019](0019-menu-query-endpoint-declaration.md) | 메뉴 데이터 조회는 메뉴가 선언한 엔드포인트 + 범용 요청 하나, 서버는 자기 선언 사본으로 판정 | Decided(2026-10-01) — 선언 원본은 #148 |
| [0020](0020-usage-events-identity-fields-only.md) | 메뉴 활용률 이벤트는 식별 필드만, 조회조건 값은 넣지 않음 | Decided(2026-10-05) |
| [0021](0021-echarts-canvas-renderer.md) | 차트는 ECharts Canvas 렌더러 | Decided(2026-10-05) |
| [0022](0022-management-filter-rail-analysis-two-column.md) | 관리 화면은 접을 수 있는 왼쪽 필터 레일, 분석 화면은 KPI 띠 + 차트 2열 | Decided(2026-10-05) |
| [0023](0023-feedbackops-primitive-shapes-and-sizes.md) | 플랫폼은 FeedbackOps 부품의 모양과 크기를 덮어쓰지 않는다(C안) | Decided(2026-10-07) |
| [0024](0024-table-column-controls-drag-width-pin-in-list.md) | 표 열 너비는 머리 끝 끌기로만, 컬럼 목록은 보이기 체크박스와 줄 끝 핀(C안) | Decided(2026-10-08) |
| [0025](0025-drilldown-level-page-keys-path-bar-layout.md) | 드릴다운은 단계마다 page key, Context가 바뀌면 지우고, 경로 바 + 단계마다 본문 교체 | Decided(2026-10-08) |
| [0026](0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md) | 공간은 업무 시스템 단위, FeedbackOps는 시스템별 협업 진입 + 권한자용 전체 허브 | Decided(2026-10-08) — 진입 형태는 0027, 메뉴 귀속 Candidate, 매핑 Open |
| [0027](0027-feedbackops-stays-standalone-entry-links.md) | FeedbackOps 화면은 옮기지 않고, 업무 공간에는 그 시스템으로 좁힌 진입 링크만 둔다 | Decided(2026-10-09) — 0018 대체, 진입 위치는 #250 시안 |
| [0028](0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md) | 멀티 워크스페이스 셸: 카드 런처 홈, 사이드바 바닥 고정 FeedbackOps 진입, 홈·공지·내 VOC는 공간 밖 전역 유틸리티 | Decided(2026-10-09) — 구현 #250 |
| [0029](0029-page-filter-bar-collapse-summary.md) | 페이지 필터 접기는 값 요약 버튼으로 하고 조건을 생략하지 않음(A+C 혼합) | Decided(2026-10-10) |

새 ADR을 쓰면 이 표에 한 줄을 더한다.

## 형식

파일명 `NNNN-<영문-요약>.md`(번호는 가장 큰 번호 다음). 제목은 한국어, 접두어 없이 결정 문장으로 쓴다.

```markdown
# <결정 문장>

상태: **Decided (YYYY-MM-DD)**.
- 결정자: 사용자 — <무엇을 골랐는지, 가능하면 사용자 말 그대로> | 플랫폼 — <어느 계약에서 유도했는지>

<맥락 1–2문단. 세부 규칙의 소유 문서 링크.>

## 결정

- …

## Considered Options

- **(A) …**: 왜 고르지 않았나
- **(B, 채택) …**: 왜 골랐나

## 결과

- 무엇이 바뀌고, 어느 문서·이슈가 이어받는가
```

결정자는 사용자 결정과 플랫폼(에이전트)이 계약에서 유도한 결정을 섞지 않는다. 에이전트에게 위임된 결정은 사용자 확인 전까지 `Candidate`로 둔다.
