# 07. App Shell 요구사항·와이어프레임

상태: 설계 산출물이며 셸 구조(§4)는 [ADR-0011](adr/0011-design-direction-feedbackops-shell.md)·[0013](adr/0013-detail-panel-shell-docked-slot.md)·[0015](adr/0015-context-bar-priority-overflow.md)로 Decided·구현됐다. 이 문서의 서술은 문서 대조용이며 런타임 통과 기록이 아니다(시나리오 검증은 §7).

전역 계약의 원본은 `06_platform_ui_contract.md`다. 이 문서는 그 계약을 소비하는 셸의 배치와 상태 시나리오만 소유한다. navigation IA는 §9, 식별자·URL·Scope·시간은 §6, Context 전환은 §11, 권한 UX는 §17을 따른다. 결정 상태와 Deferred 구현 가설은 `05_roadmap_and_open_questions.md`, 기술 후보는 `04_frontend_ui_ux.md`를 참조한다.

## 1. USER TASK

- 주 사용자: 공정/설비 엔지니어, 마스터데이터·지표 관리자, 운영 관리자, 현업 문의자.
- 작업: 메뉴를 오가며 요청한 Scope·기간·설비를 확인하고 분석 → 상세 → 관련 VOC로 이동한다.
- 셸의 책임: 현재 위치와 Context, 접근 가능한 메뉴, 재검증·로딩·오류 상태를 표시한다.
- 가정(Candidate): 메뉴 수십 개 이하, 즐겨찾기 수십 건 이하, Desktop-first. 교대 내내 상주하는지와 데이터 규모는 사용자 검증이 필요하다.

## 2. IA / SCREEN INVENTORY

목표 IA는 [06 §9·9.1](06_platform_ui_contract.md#9-information-architecture)과 [15 멀티 워크스페이스 설계](15_multi_workspace_ui.md)를 따른다. 2026-10-08 승인된 **4개 핵심 업무 워크스페이스 + 개발·운영 콘솔 + 전역 FeedbackOps 허브**가 새 탐색 계층이다. 기존 `analytics`/ `operations` Registry와 FeedbackOps 2단계 지도 #213은 **As-Is/진행 전 상태**다.

~~~text
Platform Home (시스템 런처)
├── 생산성 분석
│   ├── 분석 개요 · Cycle Time · Wafer/Job · Drill-down
│   └── 이 시스템의 VOC · Task · 설문 (FeedbackOps 공통 제공)
├── 지표관리
│   ├── 지표 카탈로그 · 정의/버전 · 발행/이력
│   └── 이 시스템의 VOC · Task · 설문
├── 표준 로그 개발
│   ├── 모델·개발 현황 · Alpha/Beta · 검증 Round · 결함 · 협력사 검토
│   └── 이 시스템의 VOC · Task · 설문
├── 개선 실행
│   ├── 개선 과제 · 적용 대상 · 현장 적용 · 개선 실적
│   └── 이 시스템의 VOC · Task · 설문
├── 개발·운영 콘솔 (권한자)
│   ├── 서버/파이프라인 · 모니터링 · 권한/관리·감사
│   └── 이 시스템의 VOC · Task · 설문
└── 전체 FeedbackOps 허브 (담당자 권한)
    └── 시스템별 VOC/Finding/Task Request/Task/Milestone/설문 조회·분류
~~~

운영 개요·설비관리·기준정보관리·공지 및 사용자용 VOC는 기존 플랫폼에 이미 존재하는 기능이므로, 대상 공간 귀속을 확정하고 점진적으로 옮긴다. 이를 새 설계가 삭제하지 않는다. 모델별 로그 검증 결함과 현장 개선 실적은 각각 원 소유 시스템 객체이고 FeedbackOps Task로 강제 합치지 않는다.

시스템이 달라질 때 공통 Rail은 유지하되 Sidebar를 해당 시스템 전용 그룹으로 교체한다. FeedbackOps 공통 메뉴는 그 시스템 Scope를 보여주며, 통합 허브는 권한 내 시스템만 나열한다. 상세 UI 및 상태/상호작용은 [15](15_multi_workspace_ui.md)에 있다.

## 3. SCREEN SPECIFICATION

| 항목 | 내용 |
| --- | --- |
| Purpose | 공통 골격, 현재 Scope/Context 및 위치 표시 |
| Primary task | 메뉴 이동 및 Scope·분석 조건 확인/변경 |
| Input | Scope 선택, 메뉴 선택/검색, 필터 편집, 즐겨찾기 |
| Output | 접근 가능한 하위 화면과 요청 Context를 담은 URL |
| Primary action | 메뉴 이동 |
| Secondary actions | 메뉴 검색, 즐겨찾기, 필터 제거/편집 |
| Navigation | 로그인 후 하위 화면에 공통 적용 |
| Data requirements | §6의 개념적 데이터 요구 |
| Empty state | 즐겨찾기/최근방문이 없으면 안내. 접근 가능한 메뉴가 없으면 별도 접근 안내(미구현 — 접근 가능한 메뉴가 0개일 때의 안내 화면은 아직 없다) |
| Loading state | 세션·메뉴는 동기 snapshot이라 메뉴 영역에 로딩 상태가 없다. Scope 검증 중은 사이드바 선택기('검증 중…')와 페이지 게이트로 표시하고, 세션 후보값을 확정값으로 표현하지 않는다. 화면 청크 로딩은 main의 스켈레톤 |
| Error state | 라우트 오류 경계(Correlation ID), Scope 확인 실패 + 다시 시도, URL 계약 오류, 권한/공간 거부 화면. 현재 사용자·Scope에서 접근 가능함이 확인된 항목만 노출 |

## 4. WIREFRAME (Decided 구조, 2026-10-04 — [ADR-0011](adr/0011-design-direction-feedbackops-shell.md))

```text
┌────┬───────────────┬────────────────────────────────────────────────┐
│Logo│ 분석        «  │ 부모 › 페이지 제목 ☆  설명…       페이지 동작   │ 50px
│    ├───────────────┼────────────────────────────────────────────────┤
│공간│ [Scope ▾]     │ [기간: wall-clock ▾] [room_name ▾] [조건 N개 더] │ 48px
│공간│  검증 상태     │                                                │
│ ── ├───────────────┼────────────────────────────────────────────────┤
│검색│ 운영 개요      │ 하위 화면 content slot                         │
│    │ 설비관리       │                                                │
│    │   설비 마스터  │                                                │
│    │ 생산성 분석    │                                                │
│도구│   …           │                                                │
│도움│ 즐겨찾기       │                                                │
│언어│ 최근방문       │                                                │
│사용자│              │                                                │
└────┴───────────────┴────────────────────────────────────────────────┘
 레일 52px  사이드바 240/56px   상단 바 없음
```

상세가 열린 상태(B안, [ADR-0013](adr/0013-detail-panel-shell-docked-slot.md)):

```text
┌────┬───────────────┬────────────────────────┬──────────────────┐
│레일│ 사이드바       │ 페이지 머리·Context     │ 상세 제목·동작·닫기│
│    │               ├────────────────────────┤ Context·상세 탭    │
│    │               │ 목록 / content slot    │ 상세 내용          │
│    │               │ (폭을 양보, 조작 가능)  │ 독립 스크롤        │
└────┴───────────────┴────────────────────────┴──────────────────┘
                                              셸 전체 높이 aside
```

상세가 없으면 오른쪽 슬롯은 폭 0이다. 폭·등록·URL·포커스 원본은 06 §7·§13이며 1440/1280 데스크톱 모두 같은 고정 슬롯을 쓴다. 페이지 머리 아래에 뜨는 overlay나 scrim은 두지 않는다.

구조는 FeedbackOps AppFrame(레일·밝은 사이드바·50px 머리)을 따른다(06 §7). 공통 Rail은 모든 워크스페이스에서 유지되고, Sidebar는 선택한 시스템의 그룹/메뉴로 교체된다([15](15_multi_workspace_ui.md)). 관리 권한이 있는 사용자는 개발·운영 콘솔과 전체 FeedbackOps 허브로 진입할 수 있다. 메뉴 검색은 레일의 Command Palette로 한다.

50px 페이지 머리와 Context Bar는 main 스크롤 영역 안에서 하나의 sticky 래퍼로 유지한다(Context Bar는 독립 sticky 아님). 콘텐츠 여백은 FeedbackOps `PageShell` 기준이며 치수 원본은 06 §7 Baseline이다. 접힌 사이드바에서도 Scope 선택·검증 상태는 아이콘·접근성 텍스트로 유지한다.

Context 바는 [06 §7 우선순위 넘침](06_platform_ui_contract.md#7-application-shell)을 소비한다(ADR-0015). 상세 열림·사이드바 접기에도 한 줄을 유지하며 넘침 팝오버 안에서 기존 편집기와 참조/미사용 배지에 접근한다.

Scope의 포함 관계는 Site→room_name→StGroup→Equipment이며 실무 권한·조회 기준은 room_name이다. Line은 room_name과 교차하는 독립 축이고 v1의 요청 scopeId는 단일 선택이다(전역 계약 §6.2, [ADR-0005](adr/0005-scope-room-name-line-independent.md)). Site 선택은 DB 연결 대상을 정한다. Factory는 별도 레벨로 모델링하지 않는다. 부모·자식 상속 세부는 Open이며 고정 다단 선택기를 요구하지 않는다. Scope 선택기는 사이드바 머리 하나뿐이며 중복 배치하지 않고, Global Context의 room_name·Equipment Group 두 층은 같은 권한 경계 안의 조회 조건으로 표시한다.

공지 배너의 위치·노출 조건은 Open이다. 전역 알림 벨·통합 미확인 배지는 필수 영역에 넣지 않는다. 저장된 뷰의 비활성 버튼도 배치하지 않는다.

## 5. CONCEPTUAL COMPONENT MAP

레일·사이드바·페이지 머리·Context 영역·콘텐츠 슬롯·상세 슬롯의 책임은 [06 §7](06_platform_ui_contract.md#7-application-shell)(셸 구조), §8(슬롯), §13(상세 슬롯)이 원본이다.

## 6. DATA REQUIREMENTS

- 메뉴 레지스트리에서 표시명·그룹·목적지·필요 권한·지원 Context를 읽는다(전역 계약 §5).
- 요청 Scope, 현재 검증 상태, 사용자가 접근 가능한 Scope 선택 항목을 읽는다(§6.2). room_name 기준 Scope·v1 단일 선택은 Decided이며 부모·자식 상속은 Open이다. 선택기 API 구현을 확정한 것은 아니다.
- URL에서 복원된 요청 Context와 목적지 객체 ID를 구분해 표시한다(§6.1). 직렬화·충돌 메커니즘은 §6.1/§6.4의 Decided 계약을 소비하며, 공개 필드명·enum·산출물 형식은 원본의 Candidate 상태를 따른다.
- 즐겨찾기/최근방문은 사용자별 목적지를 표시한다. **즐겨찾기는 목적지 ID만 저장한다(Decided, 2026-09-24 — [08 §6](08_operations_overview_wireframe.md#6-data-requirements))**: 마지막 조회 Context는 저장하지 않으며, 클릭 시 그 화면의 기본 상태로 진입하고 §6.2의 재검증을 그대로 따른다. 최근방문은 최대 12건을 저장하고 사이드바에 5건을 표시한다.
- 시간 표시/입력은 §6.3의 Decided 경계·fallback·병합 가드·기본 구간 물질화를 따른다. 초기 TZ는 한국(Asia/Seoul) 우선으로 Decided이며 다중 사업장 같은 날짜·교대일/영업일 의미는 Open이다. 이 화면에서 시간 계약을 재정의하지 않는다.

## 7. INTERACTION / DOCUMENT REVIEW SCENARIOS

시나리오 검증은 `apps/platform-e2e`의 계약 보고(`contract-report/`)를 본다.

## 8. DESIGN DECISIONS / OPEN QUESTIONS

이 문서가 소유한 Open·Deferred만 둔다. Decided는 06과 ADR-0011·0013·0015가 원본이다.

| 상태 | 결정/질문 | 소유자 |
| --- | --- | --- |
| Open | 공지 배너 위치·게시기간/대상 메뉴/권한에 따른 노출 | 셸과 공지 도메인 설계 |
| Open | 알림 벨·통합 배지의 읽음 상태·집계·권한 의미 | 별도 제안, 필수 요소 아님 |
| Deferred | 저장된 뷰, 메뉴 등록 UI, 수집 상태 대시보드 | 별도 요구 및 향후 구현 계획 |
