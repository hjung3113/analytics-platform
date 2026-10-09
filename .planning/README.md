# 남은 일 한눈에 보기

> 마지막 갱신 2026-10-10. 원본은 GitHub 이슈·마일스톤이고 이 보드는 그 요약이다. 이슈가 닫히거나 상태가 바뀌면 같은 PR에서 해당 줄을 고친다. 물어 와야 할 질문과 미결 범위는 [inputs.md](inputs.md), 이슈로 올리지 않은 아이디어는 [backlog.md](backlog.md).

## 지금 어디까지

| 단계 | 상태 |
| --- | --- |
| 1. 계약 문서 | 완료 |
| 2. Kernel 프로토타입 | 완료 |
| 3. 모노레포 정리 | 완료 |
| 4. 플랫폼 기능 (M1) | 완료 — 후속 드릴다운(#225) v0.4.0 |
| 5. 디자인 시스템 (M2) | **완료** — v0.1.0, 후속 #218·#156 v0.2.0, FeedbackOps 모양·크기 정리와 디자인 lint 위반 0(#228) v0.3.0, 표 컬럼 설정(#239) v0.4.0, 페이지 필터 줄 접기(#230) v0.6.0 |
| 6. FeedbackOps 1단계 (M3) | 대부분 완료. 남은 4개는 FeedbackOps·사내 SSO 답 대기 |
| 7. 사내 적용 (M4) | 플랫폼 쪽 준비 끝. 사내 답 대기 — 지도 #157 |
| 8. FeedbackOps 2단계 (M5) | 화면은 옮기지 않고 공간별 진입 링크만 둔다(ADR-0027, 2026-10-09). 매핑(#81)과 셸·Registry 확장(#250) 뒤 — 지도 #213 |
| 9. 멀티 워크스페이스 셸 | **완료** — v0.5.0(#250, ADR-0026·0027·0028), 공간 진입·메뉴 열기 판정 Kernel화(#264) v0.6.0 |

## 다음 할 일

다음 세션은 여기서 시작한다. 직전 세션(2026-10-09~10)에서 v0.5.0 후속(#264·#262·#266·#265·#273)과 페이지 필터 줄 접기(#230)를 끝내 v0.6.0을 릴리스했다(아래 "끝난 것").

1. 다음 슬라이스를 사용자에게 고르게 한다(후보: 바로 할 수 있는 일 표. #251 FeedbackOps 링크 계약·매핑은 #81 대기, #252 표준 로그·개선 실행 공간은 도메인 소유자 합의·#249 미결 대기).
2. 작업 규칙은 루트 `AGENTS.md`(2026-10-05 간소화), 작업자 함정은 [`docs/agents/operations.md`](../docs/agents/operations.md). 문서만 바꾸면 `pnpm docs:links`만 돌린다. 작업자 배정은 전역 `routing.tsv`가 원본이다(역할 `impl`·`impl-mid`·`impl-complex`·`impl-luna` — 모델·effort를 여기에 복제하지 않는다, #283).

## 바로 할 수 있는 일 (에이전트)

| 이슈 | 할 일 | 메모 |
| --- | --- | --- |
| #90 | 지표 상세 이력을 감사 저장소(`entityAudit`)로 통합 | 낮은 우선순위 |

## 다음 슬라이스 후보 — 멀티 워크스페이스 v2 (지도 #249)

공간을 업무 시스템 단위(생산성 분석 · 지표관리 · 표준 로그 개발 · 개선 실행 + 운영 콘솔)로 나누고, FeedbackOps는 각 공간 사이드바의 진입 링크와 권한자용 전체 허브 링크로 붙인다([ADR-0026](../docs/adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md), [ADR-0027](../docs/adr/0027-feedbackops-stays-standalone-entry-links.md), 설계 [15](../docs/15_multi_workspace_ui.md)). 이번 슬라이스(셸·Registry·귀속)는 완료다([ADR-0028](../docs/adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)). 남은 4·5행은 후속이다.

| 순서 | 할 일 | 상태 |
| --- | --- | --- |
| 1 | 설계·ADR·시안을 저장소에 반영, 06 §9.1 개정 | 완료(이 문서 PR) |
| 2 | 셸·Registry 확장(#250): 플랫폼 홈(런처), 공간별 사이드바, 사이드바의 FeedbackOps 진입 자리, 권한별 레일, 기존 라우트 호환 → `?variant=` 시안 컨펌 | 완료 — ADR-0028, #259(Kernel·Registry·팔레트), #260(카드 런처 홈·전역 화면·공간 분리·마지막 화면 복원·FeedbackOps 자리) |
| 3 | 기존 분석 메뉴를 생산성 분석·지표관리 공간으로 나눔. 귀속은 ADR-0028(운영 개요 → 홈, 설비·기준정보 → 생산성 분석, 공지·내 VOC → 전역 유틸리티) | 완료(#260) |
| 4 | 표준 로그 개발·개선 실행 공간(#252). 도메인 구현은 별도 제품 | 후속 |
| 5 | FeedbackOps 링크 계약·매핑(#251 — #81 대기)과 시스템 간 링크 회귀(복귀, 무권한, 미지원 필터, 새로고침·Back/Forward, 공간 0개·많음) | 후속 |

## 그 다음 — FeedbackOps 2단계 (M5, 지도 #213)

FeedbackOps 화면은 플랫폼으로 옮기지 않는다. FeedbackOps가 VOC → Evidence → Finding → Task 흐름을 전담하고, 각 업무 공간은 그 시스템으로 좁힌 진입 링크만 둔다([ADR-0027](../docs/adr/0027-feedbackops-stays-standalone-entry-links.md), ADR-0018 대체). 남은 일은 매핑과 링크 계약이다.

| 순서 | 할 일 | 상태 |
| --- | --- | --- |
| 1 | 공간 → Managed System 매핑 표의 모양과 원천(#81) | 결정 대기 |
| 2 | 링크 계약 확장: 시스템별 목록 진입(VOC·Task·설문 + `managedSystem`)과 범위 없는 허브 진입을 `feedbackops-link` 계약·딥링크 문서에 더함 | 1 뒤 |
| 3 | 셸의 진입 자리(#250에서 컨펌한 위치)에 링크를 연결, 허브 링크 노출 권한 결정 | #250 뒤 |
| 4 | 세션 공유(#150) — 그전에는 FeedbackOps 로그인이 한 번 더 있을 수 있음 | 사내 답 대기 |

## 결정 대기 — 사람이 고를 것

이슈가 있는 것:

| 이슈 | 질문 | 권고·메모 | 막는 것 |
| --- | --- | --- | --- |
| #81 | FeedbackOps 딥링크 확장(Scope↔Managed System 매핑·설문 제출·VOC prefill·복귀) | FeedbackOps 쪽 변경 필요 | M3 마무리, 공간별 FeedbackOps 진입(ADR-0027) |
| #148 | 엔드포인트 선언의 원본(TS ↔ FastAPI codegen) | 사내 백엔드 담당 의견과 함께 | #154, #155 |
| #98 | 권한 부여·회수의 원천 — 역할 소속 쪽 절반 | #150 IdP 그룹 claim 사양 뒤. 그전에는 쓰기 포트·화면을 만들지 않는다 | 권한 쓰기 |

이슈가 없는 것(이번 문서·코드 대조에서 나왔다 — 필요하면 이슈로 올린다):

| 질문 | 현재 상태 | 막는 것 |
| --- | --- | --- |
| TanStack Router·Zustand 미채택을 확정할지 | 04가 "미도입(Kernel 자체 구현)"으로 기록 | — |
| `defaultRangeTo`를 서버가 산출하지 못할 때 | 06 §6.3은 Decided인데 포트는 항상 값을 준다. 실서버 전에 포트를 `string \| null`로 넓힐지 | #154 |
| 사용자 설정(즐겨찾기·최근·언어·표 열) 저장 위치 | 브라우저 localStorage에만 있다(기기 간 동기 없음). v1을 이대로 둘지, 서버 보존 포트를 둘지 | 사내 적용 |
| 접근 가능한 메뉴가 0개일 때 안내 화면 | 07이 요구하지만 미구현. 만들지, 요구를 지울지 | — |
| Line·Site를 Context 키로 둘지 | CONTEXT·ADR-0005는 Line을 독립 축이라 하지만 코드에 키가 없다 | — |
| 생산성 개요의 지표별 버전 page key | 11 설계는 지표별 버전 키, 구현은 미등록 | — |
| 프로토타입 컨펌 캡처 보관 | ADR-0011·0013·0015·0017이 원격 프로토타입 브랜치에만 있는 캡처를 근거로 든다. 레포로 가져올지, 브랜치를 남겨 둘지 | 그 브랜치 삭제 |

## 사내·외부 답 대기

사내 적용(M4)의 전체 순서는 지도 이슈 #157.

| 이슈 | 내용 | 누구에게 | 답이 오면 풀리는 것 |
| --- | --- | --- | --- |
| #150 | 사내 SSO(IdP) 사양과 설정값 | 사내 SSO 담당 | #86, #98, #154, #155 |
| #151 | 배포·인프라 환경(on-prem·망분리·CI·브라우저) | 사내 인프라 담당 | — |
| #149 | 실어댑터 전송 형식 초안 → 합의 | 사내 백엔드 담당 | #154, #165 |
| #155 | 사내 FastAPI 플랫폼 API | 사내 백엔드 | #154 |
| #154 | 실어댑터(HTTP) + 사내 테스트 서버로 적합성 묶음 | ← #148·#149·#150 | 사내 적용 |
| #165 | Kernel 5분 폴링·계산 세대 재검증 | ← #149, #155 세대 신호 | — |
| #37 | 적재 워커 상태 스키마 합의(초안 있음) | 파서 담당 | #51 모니터링·트레이스 |
| #84 | 내 설문 응답 이력 읽기 API | FeedbackOps#548 | M3 마무리 |
| #85 | 신고자가 열 수 있는 VOC 상세 딥링크 | FeedbackOps#549 | M3 마무리 |
| #86 | 내 VOC 이력 실제 어댑터 | ← #150 | M3 마무리 |

질문지와 미결 범위 전체는 [inputs.md](inputs.md), 사내 적용 순서는 [사내 적용 가이드](../docs/integration/in-house-rollout.md) §2.

## 보류

| 이슈 | 다시 볼 조건 |
| --- | --- |
| #163 Perspective 자유 피벗 POC | 자유 피벗이 업무 필수로 확인될 때 |
| #164 AG Grid Enterprise 평가 | 셀 범위 복붙·채우기가 사내 메뉴 2–3곳에서 필수로 확인될 때 |
| #91 전역 감사 조회에 room 권한 적용(결정됨, 05) | 일부 room만 가진 콘솔 역할이 생길 때 서버에서 구현 |

## 끝난 것

작업 흐름(2026-10-09, #255): FeedbackOps의 이슈 처리 흐름과 역할별 리뷰어(`issue-wave-conductor`, `review-ux`·`review-quality`)를 옮겼다. conductor 후속(2026-10-10, #283): FeedbackOps conductor 4커밋 반영 — `impl-mid` 단계, 브리프 사전 점검(`templates/brief-check.md`), 웨이브 스냅숏(`wave-status.py`), 작업자 위생(`worker-hygiene.sh`), 지적 fold·file·note 분류와 가치 게이트. 스킬 5종·에이전트 4개 추가(`.agents/README.md`).

v0.1.0(2026-10-04): Kernel(Registry·전역 Context·URL 계약·권한·Scope·감사·활용률 계측·화면 오류 격리), 공통 컴포넌트(서버 페이징 표·내보내기·복사, 셸 상세 슬롯, 감사 타임라인, 신뢰 표시, 상태 화면, 필터 바, 같은 응답 배너), 차트 계약(Brush·Compare·Annotate·Export, 범례), FeedbackOps 디자인 시스템 기반 셸, 플랫폼 계약 E2E, 메뉴 조회 포트와 서버 적합성 묶음, 운영 빌드 조립 분리. 세부는 닫힌 이슈와 [v0.1.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.1.0).

v0.2.0(2026-10-05): M2 후속 — Context 바 1440px에서 기간 프리셋 다시 인라인(#218), 레이아웃 슬롯 `ManagementLayout`·`AnalysisLayout`(#156, ADR-0022). 세부는 [v0.2.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.2.0).

v0.3.0(2026-10-08): FeedbackOps 서브모듈 `13a3c5a`와 디자인 lint 설정(FeedbackOps ADR-0062)을 가져오고(#236), inline style 정리(#238), 플랫폼이 FeedbackOps 부품을 덮어쓰던 83곳을 걷어 내 FeedbackOps 모양·크기로(#241, 시안 C·[ADR-0023](../docs/adr/0023-feedbackops-primitive-shapes-and-sizes.md)) — 디자인 lint 위반 0, 접근성 하한 셋만 lint contract. Context 바 넘침 버튼을 이웃 칩 모양으로(#240). 설비 도메인 정정 — 설비명 없음(EquipmentID가 유일 키), room_name은 PHOTO·ETCH 같은 공정명(#242). 세부는 [v0.3.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.3.0).

v0.4.0(2026-10-08): 표 열 너비는 머리 끝 끌기로만, 컬럼 목록은 보이기 체크박스와 줄 끝 핀(#239, 시안 C·[ADR-0024](../docs/adr/0024-table-column-controls-drag-width-pin-in-list.md)). 드릴다운 — 단계마다 page key, Context가 바뀌면 단계를 지우고, 경로 바 + 단계마다 본문 교체, 출발 메뉴와 단계를 보이는 복귀 버튼(#225, 시안 A·[ADR-0025](../docs/adr/0025-drilldown-level-page-keys-path-bar-layout.md), 06 §6.4·§12.7·§22). 세부는 [v0.4.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.4.0).

v0.5.0(2026-10-09): 멀티 워크스페이스 셸 — 공간은 업무 시스템 단위(생산성 분석 · 지표관리 · 운영 콘솔 등록, [ADR-0026](../docs/adr/0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)). FeedbackOps 화면은 옮기지 않고 공간별 진입 링크만 둔다([ADR-0027](../docs/adr/0027-feedbackops-stays-standalone-entry-links.md), ADR-0018 대체). 실제 앱 위 시안 A/B/C를 사용자가 위임한 UX 판정(GPT-6-Astra high)으로 골라 [ADR-0028](../docs/adr/0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md): 홈 = 업무 시스템 카드 런처, 홈·공지·내 VOC = 공간 밖 전역 유틸리티(`GroupDef.space: null`, #259), 공간별 마지막 화면 복원, 레일 로고 = 홈, FeedbackOps 바닥 고정 블록·전체 링크 자리(슬롯, 앱 미주입 — #251·#81 대기), 팔레트 공간 묶음(#260). 슬라이스 품질 리뷰 반영(#267). 세부는 [v0.5.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.5.0).

v0.6.0(2026-10-10): 페이지 필터 줄 접기 — `PageFilterBar` opt-in 접기, 접힌 상태는 필드명·값을 모두 담은 펼치기 버튼(말줄임 없이 항목 단위 줄바꿈), 메뉴별 접힘 기억, 첫 소비자 사이클타임 상세(#230, 시안 A+C 혼합을 사용자가 위임한 판정(GPT-6-Astra high)으로 골라 [ADR-0029](../docs/adr/0029-page-filter-bar-collapse-summary.md)). 공간 진입 목적지와 메뉴 열기 판정을 Kernel `canOpen`·`spaceEntry`로 — 부분 권한 공간은 마지막 화면 → 열 수 있는 홈 → 첫 열 수 있는 메뉴(#264). 테스트 결정성(#262·#273), app-preview 종료 전 소유 확인(#266, 규칙표 테스트를 CI에 연결 #279), 내부 fixture builder(#265). 세부는 [v0.6.0 릴리스](https://github.com/hjung3113/analytics-platform/releases/tag/v0.6.0).

2026-10-05: 문서·작업 규칙 정리와 이 보드 도입(#220). 결정 — 활용률 이벤트는 식별 필드만(#75, ADR-0020), 차트는 Canvas 렌더러(ADR-0021), 운영 조립 주입 승인(ADR-0009), 전역 감사도 room 권한 적용(#91, 구현은 해당 역할이 생길 때). GitHub 정리 — #33·#63 닫음, M5 마일스톤 생성, #81·#84·#85를 M3에, #218을 M2에. #218 Context 바 적용 배지 생략·라벨 먼저 숨김. #156 레이아웃 슬롯 — 관리 화면은 접을 수 있는 왼쪽 필터 레일, 분석 화면은 KPI 띠 + 차트 2열 + 카드별 접기, 생성기 뼈대 반영(ADR-0022).
