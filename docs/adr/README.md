# ADR — 결정 기록

실제 대안 중에서 고른 결정, 되돌리기 어려운 결정을 남긴다. ADR은 **결정과 이유**만 둔다. 세부 규칙은 소유 문서(06·01·DESIGN.md·`integration/*`)에 두고 ADR은 그쪽을 링크한다. 결정 상태 한눈 보기는 [05 결정 상태](../overview/roadmap-and-open-questions.md), 아직 답이 없는 결정은 [`.planning/README.md`](../../.planning/README.md) "결정 대기".

이 목록의 번호는 플랫폼 ADR이고 `ADR-NNNN`으로 부른다. FeedbackOps ADR(`docs/feedbackops/adr/`)은 번호를 따로 매겨 플랫폼 번호와 겹치므로(예: 0070은 양쪽에 있다) 플랫폼 문서와 코드 주석에서 항상 `FO ADR-NNNN`으로 쓴다.

#597 retires the standalone portions of ADR-0027/0045 and FO ADR-0071 under [ADR-0097](0097-platform-features-and-role-based-names.md). Their bodies remain historical; the live link contract is [feedbackops-deeplink.md](../integration/feedbackops-deeplink.md). Inbound platform hops remain supported.

## 목록

| ADR | 결정 | 상태 |
| --- | --- | --- |
| [0001](0001-scope-hierarchy-site-line-only.md) | Scope 계층은 Site→Line 2단계, Factory는 모델링하지 않음 | 부분 대체(2026-09-24) — Factory 미모델링만 유지, 나머지는 0005 |
| [0002](0002-stgroup-materializes-to-equipment-ids.md) | Equipment Group URL은 Condition / Selection 두 층 | Decided(2026-09-24 개정) — 단일축 제한·과거 소속 미도입은 0059가 대체(2026-10-21 부분 개정), Condition/Selection 분리는 유지 |
| [0003](0003-equipment-master-platform-owned-target.md) | 설비 마스터는 플랫폼이 등록·관리하는 시스템이 목표 | Decided(2026-09-24) — 필드별 전환 순서는 Open |
| [0004](0004-site-is-db-partition-not-column.md) | Site는 조회 조건이 아니라 물리적으로 분리된 DB | Decided(2026-09-24) |
| [0005](0005-scope-room-name-line-independent.md) | 권한·조회 Scope는 room_name 기준, Line은 독립 축 | Decided(2026-09-24) |
| [0006](0006-grid-free-first-engine-hidden-from-menus.md) | 그리드 편의 기능은 무료 경로 먼저, 표 엔진은 메뉴에 숨김 | Decided(2026-10-02) |
| [0007](0007-perspective-browser-engine-only.md) | 자유 피벗 엔진(Perspective)은 브라우저 안에서만 | Decided(2026-10-02, 플랫폼) |
| [0008](0008-table-owned-export-fixed-toolbar.md) | 표 내보내기·복사는 표 부품 소유, 툴바 고정 배치 | Decided(2026-10-02) |
| [0009](0009-production-assembly-injection.md) | 운영 빌드는 조립 모듈 주입, CI가 운영 그래프에 mock 없음을 확인 | Decided(2026-10-05 승인) |
| [0010](0010-feedbackops-design-system-shared-on-tailwind-v4.md) | FeedbackOps 디자인 시스템 공유(Tailwind v4, `@fops/ui` 직접 참조) | Decided(2026-10-03) — 원본 소유는 0043이 플랫폼으로 바꿈(2026-10-19, 본문은 코드 이전 때) |
| [0011](0011-design-direction-feedbackops-shell.md) | 디자인 방향: FeedbackOps 토큰 + FeedbackOps 셸 구조(C안) | Decided(2026-10-04) — 원본 소유는 0043이 플랫폼으로 바꿈(2026-10-19, 본문은 코드 이전 때) |
| [0012](0012-chart-thin-line-stroke-aliases.md) | 차트 얇은 선은 전용 진한 stroke 별칭 | Decided(2026-10-04) |
| [0013](0013-detail-panel-shell-docked-slot.md) | 상세 패널은 셸 소유 오른쪽 고정 슬롯(B안) | Decided(2026-10-04) |
| [0014](0014-chart-legend-period-grouping.md) | 차트 범례는 비교 기간별로 묶음 | Decided(2026-10-04) |
| [0015](0015-context-bar-priority-overflow.md) | Context 바는 우선순위 넘침으로 한 줄 유지(B안) | Decided(2026-10-04) |
| [0016](0016-page-filter-bar.md) | 페이지 필터는 공통 PageFilterBar 한 줄 | Decided(2026-10-04) |
| [0017](0017-shared-outcome-banner.md) | 같은 위젯 응답은 페이지 배너 + 간결 상태 | Decided(2026-10-04) |
| [0018](0018-feedbackops-stage2-screens-into-platform-menus.md) | FeedbackOps 2단계: 화면은 플랫폼 메뉴로, 백엔드는 도메인 API로 유지(A안) | Superseded(2026-10-09) — 0027 |
| [0019](0019-menu-query-endpoint-declaration.md) | 메뉴 데이터 조회는 메뉴가 선언한 엔드포인트 + 범용 요청 하나, 서버는 자기 선언 사본으로 판정 | Decided(2026-10-01) — 선언 원본은 ADR-0096 |
| [0020](0020-usage-events-identity-fields-only.md) | 메뉴 활용률 이벤트는 식별 필드만, 조회조건 값은 넣지 않음 | Decided(2026-10-05) |
| [0021](0021-echarts-canvas-renderer.md) | 차트는 ECharts Canvas 렌더러 | Decided(2026-10-05) |
| [0022](0022-management-filter-rail-analysis-two-column.md) | 관리 화면은 접을 수 있는 왼쪽 필터 레일, 분석 화면은 KPI 띠 + 차트 2열 | Decided(2026-10-05) |
| [0023](0023-feedbackops-primitive-shapes-and-sizes.md) | 플랫폼은 FeedbackOps 부품의 모양과 크기를 덮어쓰지 않는다(C안) | Decided(2026-10-07), 개정 2026-10-15(#340) — 원본 소유는 0043이 플랫폼으로 바꿈(2026-10-19, 본문은 코드 이전 때) |
| [0024](0024-table-column-controls-drag-width-pin-in-list.md) | 표 열 너비는 머리 끝 끌기로만, 컬럼 목록은 보이기 체크박스와 줄 끝 핀(C안) | Decided(2026-10-08) |
| [0025](0025-drilldown-level-page-keys-path-bar-layout.md) | 드릴다운은 단계마다 page key, Context가 바뀌면 지우고, 경로 바 + 단계마다 본문 교체 | Decided(2026-10-08) — 깊이 제한은 0063 대체 |
| [0026](0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md) | 공간은 업무 시스템 단위, FeedbackOps는 시스템별 협업 진입 + 권한자용 전체 허브 | Decided(2026-10-08) — 진입 형태는 0027(이후 0066이 대체), 메뉴 귀속은 0028, 매핑은 0045가 정함 |
| [0027](0027-feedbackops-stays-standalone-entry-links.md) | FeedbackOps 화면은 옮기지 않고, 업무 공간에는 그 시스템으로 좁힌 진입 링크만 둔다 | Superseded(2026-10-21) — 0066. 진입 링크는 합류 단계 4까지 유지 |
| [0028](0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md) | 멀티 워크스페이스 셸: 카드 런처 홈, 사이드바 바닥 고정 FeedbackOps 진입, 홈·공지·내 VOC는 공간 밖 전역 유틸리티 | Decided(2026-10-09) — 구현 #250. 레일·로고 부분은 0042가 대체(2026-10-18, 구현 #423). 홈·전역 화면 사이드바·홈 순서·블록의 VOC 등록은 0070 부분 대체(2026-10-22) |
| [0029](0029-page-filter-bar-collapse-summary.md) | 페이지 필터 접기는 값 요약 버튼으로 하고 조건을 생략하지 않음(A+C 혼합) | Decided(2026-10-10) |
| [0030](0030-location-adapter-base-path.md) | 하위 경로 배포는 위치 어댑터를 주입하고 앱 내부 URL 계약을 유지한다 | Decided(2026-10-13) |
| [0031](0031-menu-folders-by-space.md) | 메뉴 폴더는 시스템(공간) 아래 그룹으로 나누고 전역 그룹은 `_global`에 둔다 | Decided(2026-10-14) |
| [0032](0032-arrival-focus-wins-over-restored-detail-panel.md) | URL 도착으로 함께 열린 상세 패널은 포커스를 가져가지 않고 화면 제목을 따른다 | Decided(2026-10-15) |
| [0033](0033-audit-window-open-ended-viewer-time-input.md) | 감사 화면의 시각 범위는 한쪽만 열 수 있고 입력은 보는 사람 시간대다 | Decided(2026-10-15) |
| [0034](0034-user-facing-copy-no-contract-vocabulary.md) | 사용자 문구는 계약 어휘를 쓰지 않고 서버 message는 세부다 | Decided(2026-10-15) |
| [0035](0035-page-header-yield-order.md) | 페이지 머리는 한 줄을 유지하고 설명부터 폭을 양보한다 | Decided(2026-10-16) |
| [0036](0036-chart-range-keyboard-snap-compare-clip.md) | 차트 구간은 키보드로 고르고 막대 경계에 맞추며 비교 중에는 현재 기간만 선택한다 | Decided(2026-10-16) |
| [0037](0037-table-filter-consistency.md) | 관리 표는 내용만큼 커지고 동작 열은 오른쪽에 고정하며, 필터는 초안을 적용으로 한 번에 반영한다 | Decided(2026-10-16) |
| [0038](0038-host-module-contract-and-feedbackops-mounting.md) | 업무 모듈은 한 원본을 두 호스트에 탑재하고, FeedbackOps 화면은 플랫폼 셸의 협업 공간에 모듈로 올린다 | Superseded(2026-10-21) — 0066(FeedbackOps 부분). 호스트 계약은 0053 |
| [0039](0039-equipment-visualization-platform-first-host-contract.md) | equipment-visualization은 플랫폼 탑재가 기본이고, 플랫폼이 `@ap/contracts`로 호스트 → 모듈 계약을 낸다 | Proposed(2026-10-17, 선행 조사) — 방향은 사용자 코멘트(#332·#396) |
| [0040](0040-public-test-adapter-entry.md) | 어댑터·세션·공간 테스트 fixture는 `@ap/kernel/testing` 한 곳에서 공개하고 테스트 파일에서만 import한다 | Decided(2026-10-16) — #265의 패키지 내부 fixture를 바꿈 |
| [0041](0041-annotation-author-delete-audit.md) | 차트 주석은 작성자만 지울 수 있고, 삭제는 감사 기록에 남긴다 | Decided(2026-10-17) — #399 |
| [0042](0042-system-switcher-and-system-owned-rail.md) | 업무 시스템은 레일 맨 위 전환기 하나로 바꾸고, 레일은 현재 시스템의 섹션으로 쓴다 | Decided(2026-10-18 방향, 2026-10-19 화면 A안) — 0028 부분 대체, FeedbackOps 셸 안 열기는 0038 따름. 구현 #423. 전환기 이름·팝오버 구성·레일 도구는 0070 부분 대체(2026-10-22) |
| [0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md) | 플랫폼 SDK는 플랫폼에 올릴 앱이 따르는 계약이고, 세 제품의 프레임워크를 모두 덮는 하나의 플랫폼 프레임워크로 제공한다(의존은 SDK ← 제품, 독립 실행은 제품 책임) | Decided(2026-10-19, 목표) — #396 목표 대체, 디자인 시스템 원본 소유를 플랫폼으로(0010·0011·0023 규칙은 코드 이전까지 유지) |
| [0044](0044-sdk-source-in-platform-repo-released-separately.md) | SDK 원본은 이 저장소에 두고, 플랫폼 앱과 따로 묶음 버전으로 릴리스하며, 모노레포 밖 소비자 검사를 게이트로 둔다 | Decided(2026-10-19) — registry·접두사 시점은 Open |
| [0045](0045-feedbackops-entry-link-mapping-and-scope.md) | FeedbackOps 진입 링크: 공간 → Managed System 매핑은 앱 정적 표(공간당 하나), 설문은 목록·상세까지, 복귀는 FeedbackOps에 요청, 전체 진입은 전용 권한 | Decided(2026-10-19) — #81, 구현 #251. 결정 1(매핑 원천)은 0068이 개정(2026-10-22). 개정(2026-10-23, 코디네이터, #656): VOC 등록의 화면 정보는 설명 끝 `화면 정보` 블록 |
| [0046](0046-design-system-source-moves-to-platform-whole-package.md) | 디자인 시스템 코드는 FeedbackOps `@fops/ui` 전체를 `@ap/ui`로 옮겨 플랫폼이 원본을 갖는다(세 묶음 순서, 도메인 결합 부분 포함) | Decided(2026-10-19) — 구현 #441·#442·#443. FeedbackOps 소비 전환은 1·2·3a·3b 끝, 마지막 단계(앱 import 전환)는 보류(코디네이터, 되돌릴 수 있음). 픽셀 하니스는 FeedbackOps에 남김(#441) |
| [0047](0047-detail-panel-slot-single-registrant-model.md) | 상세 패널 슬롯은 플랫폼 슬롯 하나로 통합하고, FeedbackOps의 내용 전달 방식은 같은 슬롯의 두 번째 등록 방식으로 흡수한다 | Decided(2026-10-19, 코디네이터 결정·되돌릴 수 있음) — 구현 #442 |
| [0048](0048-menu-audit-seeds-join-shared-mock-audit-store.md) | 지표 이력은 공용 감사 저장소에서 읽는다 — 메뉴 mock이 감사 시드를 내고 앱 mock 조립이 `createMockAdapter`에 넣는다 | Decided(2026-10-19) — #90 |
| [0049](0049-analysis-context-belongs-to-a-pane.md) | 분석 Context는 칸에 속한다 — 본 화면은 칸이 하나, 분석 보드는 칸마다 하나. Kernel이 칸마다 하위 Provider를 주고 메뉴는 Kernel 훅으로만 읽는다 | Decided(2026-10-19, 사용자) — #421, 구현 #496·#497·#498 |
| [0050](0050-domain-coupled-ui-returns-to-feedbackops.md) | FeedbackOps 도메인에 묶인 UI 부품과 rich-content는 FeedbackOps 소유로 되돌리고, SDK에는 도메인을 모르는 부품만 남긴다 | 일부 대체(2026-10-19) — rich-content 부분은 0052가 대체, 나머지는 Decided(사용자 승인·되돌릴 수 있음), 구현 #479 |
| [0051](0051-analysis-board-pane-header-signal-chips-numbered-selection.md) | 분석 보드 칸 머리는 다른 키만 칩(`같음 N` 팝오버, 동작 `⋯`), 선택된 칸은 번호 배지 + 왼쪽 2px 막대 + 머리 선택 표면 | Decided(2026-10-19, 코디네이터 — 사용자가 UX 리뷰 판정에 위임) — #421 |
| [0052](0052-rich-content-stays-in-the-sdk.md) | rich-content는 SDK에 둔다 — 도메인 데이터를 박지 않은 범용 부품은 쓸 곳이 없어도 SDK에 남긴다 | Decided(2026-10-19, 사용자·되돌릴 수 있음) — ADR-0050의 rich-content 부분 대체, 구현 #483 |
| [0053](0053-host-module-contract-v1.md) | 호스트 → 모듈 계약 1판을 `@ap/contracts`에 내고, Kernel이 모듈을 등록해 화면에 호스트 포트를 준다(첫 소비자는 저장소 안 고정 모듈, 2026-10-25 개정: 첫 외부 소비자 EV 마운트 #801) | Decided(2026-10-19, 코디네이터·되돌릴 수 있음) — 탑재 설계 §2 확정, 0039의 계약 부분 구현 범위, 구현 #403·#489. 개정(2026-10-25, #804): 호스트가 제목 줄·Context 바·상세 패널을 그림 |
| [0054](0054-write-port-declared-actions-idempotency-version.md) | 쓰기는 메뉴가 선언한 동작과 범용 요청 하나로 하고, Kernel이 멱등 키를 붙이며 동시성은 불투명 버전으로 확인한다 | Decided(2026-10-20, 코디네이터·되돌릴 수 있음) — 포괄 목록 §5-3, 구현 #501·#502 |
| [0055](0055-theme-contract-css-source-dtcg-json-typed-names.md) | CSS를 원본으로 DTCG 테마 JSON과 색 토큰 이름 타입·런타임 읽기 함수를 생성한다 | Decided(2026-10-20, 코디네이터·되돌릴 수 있음) — 포괄 목록 §5-5, 구현 #512 |
| [0056](0056-sdk-release-github-release-tarballs.md) | SDK 배포물은 `sdk-v*` GitHub Release에 붙인 다섯 패키지의 빌드된 tarball이다 | Decided(2026-10-20, 코디네이터·되돌릴 수 있음) — 포괄 목록 §5-8, 구현 #519(tarball·외부 소비자 게이트)·#520(공개 API 스냅샷) |
| [0057](0057-legend-tree-arrow-key-row-navigation.md) | LegendTree의 행 이동은 APG 트리 방향키로 하고, 체크·펼침·선택·정렬은 기본 키보드 경로로 조작한다 | Decided(2026-10-20, 사용자 spec + 코디네이터) — #539, 06 §26 Tab 하한의 행 이동 예외 |
| [0058](0058-analysis-chart-spec-union.md) | 종류별 차트는 AnalysisChart의 ChartSpec 판별 union으로 받고 기존 시간축 프레임은 유지한다 | Decided(2026-10-20, 코디네이터 — 사용자 위임) — #545 |
| [0059](0059-app-injected-equipment-axes-and-condition.md) | 설비 축은 앱 주입, Condition은 다중축·다중값 맵, 소속 기준·옵션 페이지·고정 Selection 평가 | Decided(2026-10-21, 코디네이터·사용자가 되돌릴 수 있음) — #552·#513, Apply UI 구현 / live UI·과거 소속 평가 미구현 |
| [0060](0060-analysis-board-pane-sizing-collapse-maximize.md) | 분석 보드는 화면 안 그리드·열별 크기 조절·칸 접기·최대화를 사용하고 시트·레이아웃별로 저장한다 | Decided(2026-10-21, 사용자) — #536, dock 렌더러는 0067 대체 |
| [0061](0061-query-draft-applied-address-and-required-gate.md) | 조회 초안은 칸에 두고 Apply 한 번으로 적용 주소를 확정한다 | Decided(2026-10-21, 코디네이터·사용자가 되돌릴 수 있음) — #553 SDK |
| [0062](0062-chart-catalog-focus-layout.md) | 차트 카탈로그는 D 집중형 + E 오른쪽 지원 레일 resize | Decided(2026-10-21, 소유자 위임에 따른 코디네이터) — #530, 공통 Panel 이관은 #575 |
| [0063](0063-consumer-owned-chart-pieces-and-unbounded-drill.md) | 메뉴가 조립하는 차트 활성화·범주 줄·표시 제어, 드릴 깊이 상한 제거 | Decided(2026-10-21, 사용자) — #541·#580 S4, 0025의 깊이 제한 대체 |
| [0064](0064-topn-bar-and-lane-timeline.md) | TopN은 ChartSpec, Lane 시간선은 독립 Canvas 2D 부품 | Decided(2026-10-21, 코디네이터 위임) — #576 |
| [0065](0065-log-dev-and-improvement-spaces-work-queue-first.md) | 표준 로그 개발·개선 실행 공간은 내 작업 우선(C) 메뉴 구성, 메뉴는 예정으로 등록 | Decided(2026-10-21, 사용자) — #252 |
| [0066](0066-feedbackops-merges-into-platform.md) | FeedbackOps를 플랫폼에 합친다 — 모두가 쓰는 기능은 플랫폼 전역, 관리자·개발자 화면은 업무 시스템 하나, 서버는 FeedbackOps 백엔드에서 출발, 독립 앱 은퇴 | Decided(2026-10-21, 사용자) — 0027·0038 대체, 설계 [합류 설계](../integration/feedbackops-merge-design.md), 지도 #598 |
| [0067](0067-dockview-layout-engine-board-v2.md) | 보드와 분석 작업 영역은 같은 무료 Dockview 엔진을 쓰고, 보드 저장 모델을 칸 번호 순서의 V2로 옮긴다(grid는 대체 렌더러) | Decided(2026-10-22, 사용자 — #575 P0 추천 채택, 구현 세부는 코디네이터) |
| [0068](0068-permission-scope-and-business-system-link.md) | 권한은 FeedbackOps 부여 체계 하나로 업무 시스템까지 넓히고(`scope_kind`, 누출 테스트가 출시 조건), Managed System은 공간에 연결만 하며(권한을 주지 않음), 관리 화면은 최종적으로 콘솔(승인)과 피드백 운영(도메인 설정)으로 나눈다 | Decided(2026-10-22, 코디네이터, 사용자 위임) — #596, ADR-0045 결정 1 개정 |
| [0069](0069-platform-port-in-feedbackops-backend.md) | 플랫폼 포트는 FeedbackOps 백엔드의 `/api/v1/platform` 모듈로 두고 그 접두사에만 플랫폼 전송 규약(200 envelope·camelCase·no-store·CSRF 토큰)을 적용한다. 권한 이름 대응표, 감사는 definer 투영만, 부트스트랩 임시 값 | Decided(2026-10-22, 코디네이터, 사용자 위임) — #593(#620–#623). 결정 3·4(FO 경로) 0071 갱신 |
| [0070](0070-global-features-platform-menu-and-voc-drawer.md) | 전역 기능은 플랫폼 메뉴로 모은다(전역 화면은 사이드바, 업무 시스템 안은 `시스템 및 플랫폼 메뉴` 팝오버), 레일에 VOC 등록·알림, VOC 등록은 오른쪽 도킹 드로어(Context 고정 칩), 설문은 전체 페이지, 홈은 카드 → 내 할 일 | Decided(2026-10-22, 사용자 — 수정 P1) — #594, 0028·0042 부분 대체, 구현됨(#594) |
| [0071](0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md) | FeedbackOps 화면은 `@fops/frontend/global-screens` 다리(메뉴 `my-activity` 하나만 import, 호스트 이음매)로 올리고, 그 화면의 API는 `/api/fo`로 부르며 플랫폼 앞단이 접두사를 뗀다(FeedbackOps 경로는 그대로). 세션 세대마다 QueryClient를 비운다. mock에서는 `실서버 필요` | Decided(2026-10-22, 코디네이터, 사용자 위임) — #594(#651), 0069 결정 3·4 갱신 |
| [0072](0072-open-menu-vocabulary-app-declared-branded-ids.md) | `@ap/contracts`는 견본 메뉴 어휘를 닫힌 목록으로 갖지 않는다 — 그룹·공간·메뉴 권한은 브랜드 문자열, 목록은 앱이 선언하고 Registry가 런타임에 검증한다. contracts에는 Kernel 고유 권한만, `FeedbackOpsEntryId`는 슬롯 데이터로 | Decided(2026-10-23, 사용자) — #670 D1, 구현됨(#671 B9), 0053 G1 개정 |
| [0073](0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md) | FeedbackOps 백엔드 테스트는 `@ap/server-conformance`·`@ap/http-adapter`를 devDependencies로 import할 수 있고(테스트 코드만), 런타임 코드는 `@ap/ui` 밖의 `@ap/*`를 import하지 않는다(금지 검사) | Decided(2026-10-23, 사용자) — #670 D4, 0066 경계의 예외, 구현됨(#677) |
| [0074](0074-port-failures-three-surfaces-structural-port-error.md) | 포트 실패는 세 갈래(envelope·쓰기는 값, 비 envelope 조회는 throw)를 유지하고, 규칙 원본은 실서버 체크리스트 §2, 판정 코드 원본은 `PORT_ERROR_CODES`, `PortError` 판별은 구조적 `isPortError`(name + code), `ContractError`도 `name`을 갖는다 | Decided(2026-10-23, 코디네이터, 사용자 위임) — #670 D5, 구현 #671 B8 |
| [0075](0075-page-head-one-line-fold-thin-outcome-strip.md) | fill 페이지 머리 영역(`contextNotes` + `contextExtension`)을 한 줄로 접고(기본 접힘, 메뉴별 기억, 적용 칩·미적용·확인 필요·안내 표식) fill 페이지의 공유 응답 배너를 얇은 띠(`자세히` Popover)로 바꾼다 — A 촘촘하게·B 한 줄 접기+띠·C 옆 패널 중 B | Decided(2026-10-23, 사용자) — #680 |
| [0076](0076-kernel-host-entry-narrow-menu-platform.md) | `Platform` 값은 하나로 두고 타입을 `MenuPlatform`(root `usePlatform()`)과 `HostPlatform`(`@ap/kernel/host`의 `useHostPlatform()`)으로 나누며, 셸 전용 Provider·hook은 `@ap/kernel/host`로 옮기고 lint가 메뉴·모듈의 import를 막는다. `adapter`·`PlatformProvider`는 root에 남는다 | Decided(2026-10-23, 코디네이터, 사용자 위임) — 구현 #671 B8 |
| [0077](0077-workspace-stack-mode-rows-keep-own-height.md) | `PanelWorkspace`에 두 번째 높이 방식 `아래로 쌓기`(줄이 px 높이를 갖고 페이지가 스크롤)를 선택 모드로 더하고(기본은 화면 맞춤), 경계는 그 위 줄만 바꾸며 마지막 줄 아래 띠가 새 줄을 받는다 — A 늘리기 손잡이·B 높이 프리셋·C 줄 px 쌓기 중 C. ADR-0067 결정 4·8·21을 고친다 | Decided(2026-10-23, 사용자) — #686 |
| [0078](0078-hw-time-layout-recipes.md) | HW Time을 새 그룹 `동작시간분석`의 메뉴 4개(단계별·비교·개요·표)로 한 데이터 위에 레이아웃 선언만 달리 만들고, 06 §12.7에 메뉴가 선언한 부모 맥락 패널을 허용하며 `DrillPath` `summary` 슬롯을 더한다 — 기본 레시피 하나·단계만 드릴·오버레이 드릴 대신 | Decided(2026-10-24, 사용자) — #690 |
| [0079](0079-chart-row-focus-row-pitch.md) | `AnalysisChartFrame` 가로 막대에 제어형 `activeCategory`/`onActiveCategoryChange`/`revealActive`와 행 높이 viewport `rowPitch`를 더한다 — 동기화 그룹 컨텍스트 대신 제어형 prop(ADR-0063 패턴), `dataZoom` 창 대신 안쪽 스크롤(`rowPitch`에서는 범주 줌 끔). #541 F를 결정한다 | Decided(2026-10-24, 코디네이터, 되돌릴 수 있음) — #690 |
| [0080](0080-inspector-forms.md) | `Inspector`는 보조 섹션을 한 번 선언하고 두 형태(`stack` APG 아코디언, `rail` 40 px 아이콘 열 + Popover peek)로 보인다 — A 아코디언 스택·B 레일+peek·C 탭 중 A+B를 한 부품으로, 동시 다중 열림이 기본. 섹션 내용은 질의를 소유하지 않는다 | Decided(2026-10-24, 코디네이터, 되돌릴 수 있음) — #690 |
| [0081](0081-feedbackops-operator-screens-platform-frame.md) | FeedbackOps 운영 화면은 플랫폼 틀(사이드바 `목록 범위`, 한 줄 머리)로 업무 시스템 `FeedbackOps`(부제 `피드백 운영`) 하나에 옮긴다: 레일 7섹션, 신고자 항목 제외, 바닥 블록은 셸 안 이동 + 복귀 줄, 사용자 메뉴 `FeedbackOps 전체` 제거 | Decided(2026-10-24, 사용자 — 시안 A + UX 리뷰 개선) — #595, 0042·0045·0070 부분 대체, 구현됨 — #759 골격·#760 바닥 블록·#761 VOC·#763 Tasks·#762 Findings·연동·#764 Surveys·관리자·`FeedbackOps 전체` 제거 끝(독립 앱 은퇴 #597 남음) |
| [0082](0082-measure-reaggregation-contract.md) | 재집계 규칙은 `@ap/contracts`의 `Reaggregation`·`MeasureMeta`·`canClientSum` 한 어휘다 — 새 집계 어휘(`sum/count/rate/weightedAvg/min/max/nonAdditive`) 대신 지표 카탈로그의 `reaggregationRule` 세 값에 `none`을 더해 계약으로 올린다 | Decided(2026-10-25, 코디네이터(사용자 위임), 되돌릴 수 있음) — #580 580a |
| [0083](0083-condition-presets.md) | Condition 프리셋은 메뉴 조회의 투영·신원만 활성 프리셋의 축으로 좁히고 전역 Condition·URL·칸 복사는 그대로 둔다(대안: 값 제거 / 세션 보관 / 유지하되 투영 안 함 — 마지막 선택) | Decided(2026-10-25, 코디네이터(사용자 위임), 되돌릴 수 있다) — #580 노드 580b, 0059 결정 7 유지 |
| [0084](0084-legend-tree-drill.md) | LegendTree 드릴은 보이기와 분리한다 — 시리즈 줄은 체크박스·이름 = 보이기 + hover 단계 버튼, `drillOnly` 줄은 줄 클릭 = 드릴, Enter는 모두 드릴(대안: b1 이름 클릭 드릴 / b2 버튼만 — 조합 선택) | Decided(2026-10-25, 코디네이터(사용자 위임, Opus xhigh 리뷰 반영), 되돌릴 수 있다) — #580 노드 580e, 0057 보충 |
| [0085](0085-entity-audit-cursor-pages.md) | 목적지 감사 `entityAudit`은 서버 상한(50)·keyset 커서로 쪽을 나누고, `AuditTimeline`은 목록 끝 `이전 변경 이력 더 보기` 버튼으로 이어 붙인다(대안: B 총건수·`N/M건` 표시 / C 전역 감사 화면으로 넘기기 — A 선택) | Decided(2026-10-26, 코디네이터(사용자 지시: 시안은 Opus xhigh 리뷰 후 결정), 되돌릴 수 있다) — #826 |
| [0086](0086-kernel-query-engine-tanstack.md) | Kernel 조회 수명주기는 내부 엔진으로 TanStack Query를 쓴다 — 공유 키로 요청 중복 제거, 5분 메모리 SWR, 세션 세대 키로 이전 사용자 데이터 제거(대안: A Kernel 자체 중복 제거 / C TanStack을 SDK 조회 API로 공개 / D 하지 않음 — B 선택) | Decided(2026-10-26, 사용자 방향 + 코디네이터, 되돌릴 수 있다) — #825 |
| [0087](0087-board-minimize-restore-history.md) | 분석 보드는 URL이 최대화의 정본이고 `live`만 저장한 채 마운트를 유지하며 열기·최소화·복원·`분석 보드에 열기…`는 history replace로 전이한다(대안: a 언마운트 / b `history.back()` 최소화 / c 별도 mode 저장 — d 선택) | Decided(2026-10-27, 코디네이터(사용자 결정: 칩 + 레일 상태 표시), 되돌릴 수 있다) — #893 |
| [0088](0088-surface-pause-detail-slot.md) | 소유 표면이 가려지면(최소화된 보드) 상세 슬롯 등록자는 자리를 지키되 표시권만 멈춘다 — 종료(`onSuperseded`)가 아니다, 재개 때 여전히 승자일 때만 다시 보이고 `activation`+1(대안: a 해제 / b 보드 전용 prop / c unmount — d 도메인 중립 scope 선택, ADR-0047 개정) | Decided(2026-10-27, 코디네이터, 되돌릴 수 있다) — #893 |
| [0089](0089-board-tab-cap-split.md) | 시트의 칸(탭) 합계 상한(8)과 표시 그룹 상한(4)을 나눈다 — 4개 영역을 유지한 채 한 영역에 5번째 탭, 5칸 이상 보드는 `v:3` 저장(이전 빌드는 읽기 전용 `newer`로 연다)·dock 강제(대안: 상한만 올리기 / `v:2` 유지 / 분리 저장 / grid 확장) | Decided(2026-10-27, 코디네이터, 되돌릴 수 있다) — #893 |
| [0090](0090-repo-structure-by-branch.md) | 저장소는 갈래별 구조로 정리한다: FeedbackOps를 루트 `apps/`·`packages/`로 펼치고, `packages/`는 `sdk/`·`adapters/`로 묶고, 공간 id를 `mars`·`bravo`로 바꾸고, docs는 종류별 폴더 + 06 계약 분할(대안: #712 D1–D5의 A/B/C — D1 B, D2 C, D3 B, D4 A, D5 C 선택) | Decided(2026-10-27, 사용자, 최종 트리 표는 되돌릴 수 있다) — #713 |
| [0091](0091-board-floating-window.md) | 분석 보드는 일반 화면 위에 뜨는 비모달 자유 창으로도 볼 수 있다. 표시 모드는 파생이고 창은 주소를 소유하지 않으며 위치는 실행 세션 동안만 기억한다(대안: A 자유 창 / B 모서리 고정 / C 측면 패널 — A 선택) | Decided(2026-10-27, 사용자, 되돌릴 수 있다) — #893 893d |
| [0092](0092-saved-view-units-tiers-and-groups.md) | 저장된 뷰는 조건 세트 + 메뉴 뷰 두 단위, 소유는 개인 → 그룹(조직 팀 \| 커스텀) → 공식, 공유는 권한을 주지 않는다. UI는 조회 도구행의 현재 뷰 선택기 + 요청형 뷰 관리 표면(대안: A 탭 줄 / B 드롭다운 / C 상시 패널 — B 기본 + C 정보 구조) | Decided(2026-10-27, 사용자 + 시안 선택은 Astra 위임·코디네이터 기록, 되돌릴 수 있다) · #294 · 구현 #1011 |
| [0093](0093-canonical-paths-from-space-and-menu-id.md) | 메뉴 정규 경로는 `/{공간 id}/{메뉴 id 슬러그}` + `:param`으로 유도하고 manifest 경로는 옛 별칭으로 둔다 (대안: manifest가 슬러그를 선언 — 유도 선택) | Decided(2026-10-27) |
| [0094](0094-occurrence-anchor-is-record-sequence.md) | occurrence anchor는 파서 RecordSequence를 담은 불투명 숫자 문자열이고 시작 시각은 별도 표시 필드다 (대안: B `시각#순번` 합성값 / C 시각 유지 + 서버 해소 — 기각) | Decided(2026-10-27, 사용자) · #1007 |
| [0095](0095-dual-backend-fastify-core-fastapi-analytics.md) | 서버는 둘이다 — Fastify 코어가 유일한 입구(세션·권한·감사·알림)이고 FastAPI는 분석 데이터만 내부에서 맡는다. DB 인스턴스 하나·스키마별 소유, Zod → JSON Schema → Pydantic 한 방향. 권한 claim·부여는 설계 남음(#1087) | Decided(2026-10-28) — 사용자 "추천대로", D1·D2·D6·D7 결정. ADR-0066 결정 6·0069 결정 8·0043 개정 |
| [0096](0096-contract-schemas-zod-source-and-reference-implementations.md) | 서버 계약 원본은 TS의 Zod 스키마(→ JSON Schema → Pydantic), SDK는 계약에 더해 선택해서 쓰는 참조 구현을 낸다 | Decided(2026-10-28) — #148 닫음 |

| [0097](0097-platform-features-and-role-based-names.md) | FeedbackOps 제품·독립 앱·공간·인프라 이름을 제거하고 역할 이름으로 통합한다. `platform/<feature>/`는 Consumer 층, 옛 주소·SDK·권한 별칭 없음, migration 이력 원문 유지 | Decided(2026-10-28, 사용자; 세부 대응값은 코디네이터 위임·되돌릴 수 있음) — #1097. 0031·0045·0046 규칙 8·0066·0071·0073 규칙 11·0081·0090·0093 부분 대체; 구현 #597·#1098–#1102 |
| [0098](0098-adapter-preferences-people-notices-ports.md) | PlatformAdapter에 사용자 설정(키 패치·1회 원자 가져오기)·사람 정확 조회·공지 관리 포트를 더하고 `defaultRangeTo`를 `string \| null`로 넓힌다. 스키마 원본 경계는 ADR-0097을 따른다 | Decided(2026-10-28, 사용자 #1096; 세부 설계는 팀장 위임·되돌릴 수 있음) — #1103. 서버 #1104·#1105·#1106 |
| [0099](0099-server-saved-view-persistence.md) | 저장된 뷰 서버는 객체 ACL만 판정하고 메뉴·Scope는 실제 데이터 경계가 판정한다(0092 §3 부분 대체). 명령 하나의 엄격한 전송 계약, 공식 회수·승인·이전 정책 | Decided(2026-10-29, 사용자 #1105; 세부 설계는 팀장 위임·되돌릴 수 있음) — 서버 모듈 구현(#1105a), HTTP 저장소·브라우저 이전 실행은 미구현(#1105b) · #1105 |
| [0101](0101-opaque-audit-target-filter.md) | `auditTrail`의 `type` 필터는 불투명 ASCII 토큰(`[A-Za-z][A-Za-z0-9_.:-]{0,79}`)이다. 형식 맞는 미지 유형은 `empty`, 틀리면 `error`. 공개는 기존 SQL 투영만 결정한다 | Decided(2026-10-29, 팀장 위임·되돌릴 수 있음) — #1091 |

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

결정자는 사용자 결정과 플랫폼(에이전트)이 계약에서 유도한 결정을 섞지 않는다. 사용자가 코디네이터에게 위임한 결정은 `Candidate`로 남기지 않고 `Decided`로 기록하며, 결정자를 `코디네이터(사용자 위임)`로 적고 되돌릴 수 있음을 함께 적는다.
