# analytics-platform 구축 요구사항 종합 (3-모델 교차 검증)

작성 방식: `docs/00`~`07`, `DESIGN.md`, `.agents/skills/analysis-platform-wireframe/SKILL.md`를 세 개의 독립 모델에게 각각 정독시켜 요구사항 체크리스트를 뽑고(orca orchestration으로 병렬 디스패치), 그 결과를 이 문서에서 하나로 통합했다. 세 모델 모두 "메뉴 개수를 늘리는 것보다 Platform Kernel을 완성하는 것이 우선"이라는 `AGENTS.md`의 원칙을 전제로 작성했다.

| 모델 | 관점/강점 | 산출 항목 수 | 원본 |
| --- | --- | ---: | --- |
| Codex `gpt-6-astra` (medium) | 계약 정합성·데이터 신뢰·출처 인용 정밀도 | 86개 + Open 13 | [requirements-codex-astra.md](.agents/reports/requirements-codex-astra.md) |
| Grok `4.6` (high) | YAGNI 경계·메뉴 카탈로그 폭·긴장 관계 발견 | 153개(신규 제안 38 포함) + Open 18 | [requirements-grok.md](.agents/reports/requirements-grok.md) |
| omp `zai/glm-5.3` (thinking max) | 문서 간 수치 충돌 탐지·개발 편의 항목 | 114개(신규 제안 17 포함) + Open 20 | [requirements-omp-glm.md](.agents/reports/requirements-omp-glm.md) |

**이 문서는 구현 승인이 아니다.** 세 모델 모두 명시했듯, 체크된 항목이 없다는 것은 "결정됐다"는 뜻이 아니라 "구축 시 필요한 작업/결정"이라는 뜻이다. `docs/06_platform_ui_contract.md` §29의 Platform-first Definition of Done을 만족하지 않는 메뉴 구현은 이 목록의 완료로 치지 않는다.

읽는 법:
- **[3/3]** = 세 모델 모두 독립적으로 지적 — 신뢰도가 가장 높다.
- **[2/3]** = 두 모델이 지적.
- **[1/3 · 모델명]** = 한 모델만 지적 — 그 모델의 고유 시각.
- **출처**가 "Decided"면 이미 `docs/`에 확정된 계약을 구현 요구로 재진술한 것이고, "신규 제안"이면 세 모델이 문서에 없는 걸 자유 판단으로 추가한 것이다(사용자가 요청한 대로 범위를 넓게 잡아 자유롭게 제안하도록 지시했다).

---

## 0. 지금 바로 결정해야 하는 문서 충돌 (3개 모델 모두 발견)

이건 요구사항이라기보다 **막힌 지점**이다. 셋 다 독립적으로 같은 두 수치 불일치를 찾았다 — 구현 착수 전에 하나로 정해야 뒤 작업이 안 갈라진다.

- [ ] **셸 치수(사이드바/탑바) 확정** — `docs/06` §7 Baseline(사이드바 240px · 헤더 56px)과 `DESIGN.md` canonical(사이드바 270px · 헤더 54px)이 다르다. 계약 위반은 아니고(§7은 권장 Baseline, DESIGN.md는 스크린샷 실측치) 둘 다 Candidate라 우열이 없다 — 구현 기본값을 하나 고른다. **[3/3]**
- [ ] **테이블 행 밀도 확정** — `docs/06` §15(행 40px)과 `DESIGN.md` table-density(최소 32px, 레퍼런스 화면 25px는 compact 목표)가 다르다. **[3/3]**

---

## 1. 디자인 요소

- [ ] **디자인 토큰 3층(primitive→semantic→component)을 실제 CSS/Tailwind 변수로 물질화** — `docs/06` §23은 Candidate, `DESIGN.md`는 그와 정렬됐지만 코드 산출물은 없다. 화면마다 임의 색·간격이 생기지 않게 하는 기반. **[3/3] Must** — Decided/Candidate.
- [ ] **차트 라이브러리(ECharts 후보) 테마를 토큰에 바인딩** — 팔레트 계약은 있지만 실제 theme config·POC 검증(대용량 시계열, 다중 차트 브러시 동기화)이 없다. **[3/3] Must** — `DESIGN.md` Open Decisions, `docs/04`.
- [ ] **아이콘 세트 단일화(Lucide 등 rounded-outline 한 패밀리)** — 후보만 있고 확정 없음. **[3/3] Should** — Candidate.
- [ ] **UI 프리미티브 조합 확정(shadcn/ui + Base UI/Radix 비교 후 채택)** — 모든 Platform Component의 기반. **[3/3] Must** — Candidate, `docs/04`.
- [ ] **인터랙션 상태 전체 구현(hover/pressed/selected/focus/disabled/busy)과 중복 제출 차단** — 토큰만 있고 동작 미구현. **[3/3] Must** — Decided/디자인 요구.
- [ ] **접근성 구현·렌더 검증(§26): 키보드 탐색, focus trap, 색 외 구분, 대비 4.5:1/3:1** — 토큰만으로 통과 주장 불가. **[3/3] Must** — Decided.
- [ ] **한글/CJK 타이포 검증** — Inter는 한글 미지원, 폴백 폰트가 행높이·밀도를 바꾼다. 이 플랫폼 사용자 언어가 한국어라는 점에서 세 모델 모두 공백으로 지적했다. **[3/3] Should** — 신규 제안(Noto Sans KR 등 폰트 스택 결정 필요).
- [ ] **Data Trust 시각 표준화(Updated/Data through/Coverage/Metric version/Provisional을 공통 vocabulary로)** — 숫자만큼 숫자의 상태를 보여줘야 함. **[3/3] Must** — Decided, `docs/06` §18.
- [ ] **상태 배지 4종(success/warning/danger/neutral) + §19 매핑표를 임의색으로 확장 금지** — 매핑표 자체는 문서에 없어 공백. **[2/3 · Codex, Grok] Must** — Candidate + 신규 제안(공백 메움).
- [ ] **다크모드는 지금 설계하지 않되 토큰 구조가 이후 확장을 막지 않게** — 사이드바가 이미 다크라 단순 invert 불가. **[3/3] Nice(지금은 Open)** — `DESIGN.md` Open Decisions.
- [ ] **장식적 시각화 금지(Gauge/3D/장식 게이지) — donut은 분모 있는 비율에만** — §24 Decorative Visualization vs 레퍼런스 스크린샷의 donut/gauge 어휘 사이 허용 범위를 한 문장으로 확정할 것. **[2/3 · Grok, omp] Must** — Decided + Open(허용 경계).
- [ ] **모션 토큰(120ms 전환, reduced-motion 0ms, live pulse는 freshness 근거 있을 때만)** — **[2/3 · Codex, Grok] Should**.
- [ ] **KPI 타일 상한 5–6개** — KPI 행이 지표 화면을 대체하지 않게. **[2/3 · Grok, omp] Should**.
- [ ] **숫자 표시 규칙(우측 정렬·tabular-nums·ID mono)** — **[2/3 · Codex, omp] Must**.
- [ ] **반응형(Desktop-first, ≥1440 full / 1024–1439 collapse / <1024 조회 중심)** — **[3/3] Must(정책)**, 실제 모바일 구현은 Nice.
- [ ] **z-index/오버레이 스택 계약(Dropdown/Popover/Drawer/Modal/Palette/Toast)** — 전역 스택 정의가 없음. **[1/3 · Grok] Should** — 신규 제안.
- [ ] **기간 프리셋(7D/30D/90D) 의미 확정(rolling vs 달력일, 앵커)** — §6.3 half-open URL 물질화의 전제. **[3/3] Must(제공 시)**.
- [ ] **디자인 상태 갤러리/Storybook(정상·빈값·권한없음·긴 한글·부분실패 비교)** — **[2/3 · Codex, omp] Should** — 신규 제안.

## 2. 메뉴 카탈로그

내비게이션 IA의 단일 기준은 `docs/06` §9의 **7그룹**(운영 개요 / 설비관리 / 기준정보관리 / 생산성 분석 / 지표관리 / 공지·VOC / 관리·감사)이며, `docs/02`의 6도메인과 개수를 맞추지 않는다. 아래는 이미 문서에 있는 것과, 세 모델이 자유롭게 판단해 추가 제안한 것을 함께 담았다 — 사용자가 지정한 설비관리/기준정보관리/생산성분석/지표관리/공지/VOC/모니터링을 모두 포함한다.

### 2.1 기존 문서에 정의된 메뉴 (7그룹 안)

- [ ] **운영 개요(랜딩)** — 즐겨찾기·최근방문·내 메뉴 바로가기. 근거 서비스 없는 "수집 상태" 위젯은 금지. **[3/3] Must**.
- [ ] **설비관리 — 설비 마스터 목록/상세(유효구간 이력, `equipment_id` 단일 조인, 사용중지≠물리삭제)** — **[3/3] Must(첫 Consumer 후보)**.
- [ ] **기준정보관리 — 공정/레시피/자재 등 CRUD(외부 MES 소유 필드 vs 플랫폼 직접관리 필드 구분)** — **[3/3] Must/Should**.
- [ ] **생산성 분석 — 개요(물리 점유율/비Process 체류/사이클타임 P50·P95/Job 처리량)** — 파서로 계산 가능한 범위로 한정, SEMI E10 가동률·수율은 제외. **[3/3] Must(대표 분석 Consumer)**.
- [ ] **생산성 분석 — 사이클타임 상세→느린 실행→occurrence 상세(공정 타임라인+품질)** — 대표 드릴다운 검증 경로. **[3/3] Must**.
- [ ] **생산성 분석 — Wafer Journey 이송 분포** — **[3/3] Should**.
- [ ] **지표관리 — 카탈로그/상세(grain·분자분모·버전·발행·사용처)** — 계산식 저장소가 아니라 카탈로그. **[3/3] Must/Should**.
- [ ] **공지 — 목록/상세 + 로그인 배너(대상 메뉴·Scope 타게팅)** — 별도 알림 엔진 없이 배너/목록으로 충분. **[3/3] Should**.
- [ ] **VOC — 접수→처리중→완료(담당 배정, 댓글, 관련 Context)** — VOC 열람 권한이 분석 권한을 자동 부여하지 않음. **[3/3] Should**.
- [ ] **관리·감사 — 권한/역할 관리(메뉴×데이터 Scope)** — **[3/3] Must**.
- [ ] **관리·감사 — 전역 Audit Trail 뷰어(who/when/before-after)** — 유효기간 이력과 별개. **[3/3] Should**.
- [ ] **모니터링 — 수집 상태/데이터 최신성** — 상태 판정 근거 서비스(statusSource)가 없으면 노출 금지. 서비스가 생기기 전까지는 화면을 먼저 그리지 않는다. **[3/3] Nice/Deferred(전제 충족 후)**.

### 2.2 세 모델이 자유롭게 제안한 신규 메뉴 (7그룹 안에 수용, 새 최상위 그룹 아님)

- [ ] **사용자·조직 디렉터리(관리·감사)** — VOC 담당 배정·권한 부여·감사 주체의 전제. 인증만으로는 조직 모델이 안 생긴다. **[3/3] Must** — 신규 화면 제안(도메인 전제는 Decided).
- [ ] **메뉴 활용률 대시보드(관리·감사)** — 누가 어떤 메뉴를 얼마나 쓰는지. 공통 컴포넌트 승격·화면 개선 우선순위의 근거 데이터가 현재 설계에 없다는 걸 세 모델 다 지적했다. **[3/3] Should/Nice** — 신규 제안(§4 계측 파이프라인 전제, 보존기간·개인정보 범위는 Open).
- [ ] **시간역(timeDomain) 매핑 관리 화면** — 복수 설비 시간축 병합 가드가 요구하는 assertion 데이터를 등록/수정할 화면이 없다. **[3/3] Should(복수 설비 병합 제공 시 Must)** — 신규 제안(assertion 계약은 Decided).
- [ ] **지연완료·정정/backfill 후보 목록** — 창 밖 후보를 보존한다는 정책의 UI 소비자. **[2/3 · Codex, Grok] Should** — 신규 제안(메커니즘은 Decided).
- [ ] **운영 이벤트 뷰어(적재 중단·mart 실패)** — 범용 알람 엔진이 아니라 원천이 확인한 사건만 표시. **[2/3 · Grok, omp] Should/Nice** — 신규 제안. 공정 이상탐지/알람 워크스페이스 자체는 지표·임계값 검증 전까지 **비범위(YAGNI)**.
- [ ] **비동기 작업 모니터(내보내기·재집계 상태·취소)** — **[2/3 · Codex, Grok] Should** — 신규 제안.
- [ ] **마스터 필드 원천 소유권 설정 화면** — 외부 import와 플랫폼 수정 충돌 방지. **[2/3 · Codex, Grok] Must(정책)/Should(UI)** — 신규 제안.
- [ ] **사용자 온보딩(첫 Scope 선택, Context 개념 안내)** — **[3/3] Should** — 신규 제안.
- [ ] **리포트 빌더/스케줄 리포트, 알람·이상탐지, 저장된 뷰, 표준 로그 라이프사이클(설비관리 하위 후보)** — 명시적으로 **비범위(YAGNI)** 또는 수요 확인 전 **Nice**. `docs/00`이 1차 리뷰에서 제외한 항목을 재제안하지 않는다. **[3/3] Nice/비범위**.

## 3. 메뉴 간 연결 (딥링크·Context 전파·크로스내비게이션)

핵심 가치는 메뉴 수가 아니라 "문맥과 함께 이동"하는 것 — 세 모델이 가장 겹치는 영역이다(거의 전부 [3/3]).

- [ ] **Context Link helper 공통 라이브러리** — destination·transferable·unsupported·permission을 처리. 메뉴가 서로 URL 문자열을 직접 조립하지 않는다. **[3/3] Must** — Decided, `docs/06` §22.
- [ ] **목적지 객체 ID와 분석 Context 분리** — occurrence `(equipmentId, entityType, anchor)` vs 설비 `equipment_id` vs `vocId` vs `metricId+metricVersion`. **[3/3] Must** — Decided, §6.1.
- [ ] **미지원 Context는 폐기하지 않고 칩으로 표시("Lot: A1023 · Not used")** — 지원 메뉴 복귀 시 재검증 후 적용. **[3/3] Must** — Decided.
- [ ] **전역 Context / Page Filter / Visualization / 영속 주석 4층 분리** — 차트 줌은 로컬, Brush 후 명시적 적용만 URL 승격. **[3/3] Must** — Decided.
- [ ] **URL이 세션/최근방문보다 우선, 누락값을 과거 세션으로 채우지 않음** — **[3/3] Must** — Decided.
- [ ] **URL 스키마: 집합 키 정규화, 명시적 공집합 표식, 카디널리티 검증** — **[3/3] Must** — Decided.
- [ ] **`metricId`+`metricVersion` 쌍 보존(한쪽만 있는 입력으로 최신 버전 대체 금지)** — **[3/3] Must** — Decided.
- [ ] **URL 버전 `v` 수명주기(미지원 버전 전체 거부, 과거 링크 자동 재해석 금지)** — **[3/3] Must** — Decided.
- [ ] **wall-clock 구간 유지(naive datetime, half-open `[from,to)`), offset/한쪽 경계만 있는 입력 거부** — **[3/3] Must** — Decided.
- [ ] **다중 설비 시간역(timeDomain) 병합 가드** — 서버 assertion으로 증명될 때만 축 병합. **[3/3] Must** — Decided.
- [ ] **비동기 응답 레이스 가드** — Context 변경 시 이전 요청 결과를 새 조건으로 채택 금지. **[3/3] Must** — Decided.
- [ ] **대표 드릴다운 왕복 검증: 사이클타임 P95 → 느린 실행 → occurrence → 공정 타임라인 → VOC 생성/복귀** — 식별자·권한·리니지·차트를 한 번에 검증하는 경로. **[3/3] Must** — Candidate 검증 시나리오.
- [ ] **Breadcrumb은 Kernel이 자동 생성, 메뉴가 수동 구현 금지** — **[3/3] Must** — Decided.
- [ ] **Command Palette: 메뉴 이동은 기본, Entity Search/Action은 Deferred** — **[3/3] Must(이동)/Nice(검색·액션)**.
- [ ] **뒤로가기 복원 범위는 URL 소유 상태로 한정(줌/브러시/시리즈 가시성 제외)** — **[3/3] Must** — Decided.
- [ ] **차트 클릭 → 페이지 필터 칩 생성(Silent Drill-down 금지, 전역 필터를 조용히 바꾸지 않음)** — **[2/3 · Grok, omp] Must/Should**.
- [ ] **동일 조건 차트·표·CSV 수치 일치 검증** — 메뉴 간 신뢰 성립의 최소 기준. **[2/3 · Grok, omp] Must**.
- [ ] **연결 행렬(출발/목적지별 적용·보존·미지원·권한)을 메뉴 계약 문서에 첨부** — **[1/3 · Codex] Should** — 신규 문서화 제안.

## 4. 플랫폼 공통 기능

- [ ] **선언형 Menu Registry(이름·그룹·경로·권한·지원 Context·페이지 유형)** — 신규 메뉴마다 Sidebar/Breadcrumb 코드 수정 금지. **[3/3] Must** — Decided, `docs/06` §5.
- [ ] **App Shell + Shell Slot 계약(title/actions/contextExtension/content/dataTrustSummary)** — **[3/3] Must** — Decided, §4/§8.
- [ ] **전역 Context Bar(Time/Equipment/Group/Lot/Process/Metric Version/Scope), 헤더 Scope 선택기와 중복 배치 금지** — **[3/3] Must** — Decided.
- [ ] **인증/세션(day-1 OIDC 권장)** — 사내 SSO 여부는 Open이나 라이브러리 조기 도입 방향은 확정적. **[3/3] Must(방향)**.
- [ ] **전 경로 권한/Scope 집행(메뉴·URL·필터·조회·캐시·내보내기·딥링크·저장된 뷰 전부 동일 정책, 서버 매 요청 재검증)** — **[3/3] Must** — Decided, §6.2/§17.
- [ ] **권한없음 vs 데이터없음 Empty State 분리** — **[3/3] Must** — Decided.
- [ ] **감사(Audit Trail) 공통 기반(who/when/before-after, 유효기간 이력과 분리)** — **[3/3] Must**.
- [ ] **두 층 응답 스키마(outcome + assessments[]), unknown 누락 없이 반환** — 가짜 상태 판정 방지. **[3/3] Must** — Decided, §19.
- [ ] **폴링 + 완료된 계산 세대 기반 캐시 재검증(watermark 이동 ≠ mart 완료)** — SSE/WebSocket은 요구 확인 후. **[3/3] Must** — Decided.
- [ ] **Toast/Confirm/Modal/전역 Error Boundary + Correlation ID** — **[3/3] Must** — Decided.
- [ ] **공지 배너 인프라(게시기간·대상 메뉴·Scope)** — 통합 알림 벨/미확인 배지는 읽음 모델이 미정이라 **비필수**. **[3/3] Should(배너)/Nice(벨)**.
- [ ] **메뉴 활용률 계측 파이프라인(menuId·이벤트·시각·권한 범위, PII 최소화)** — 세 모델 모두 "현재 설계에 관측 체계가 없다"고 독립적으로 지적한 항목. **[3/3] Should** — 신규 제안(보존기간·개인정보 범위는 Open Question으로 남김).
- [ ] **즐겨찾기/최근 메뉴(재진입 시 권한 재검증)** — **[3/3] Should**.
- [ ] **저장된 뷰(Saved View)** — route+Context+필터+컬럼 상태. 복원 시 서버 Scope 재검증 필수. **[3/3] Nice(지금은 Deferred)**.
- [ ] **내보내기(CSV) 공통 경로(권한·적용 필터·선택 범위 명시, 대량 작업은 별도 프로세스)** — **[3/3] Should/Must**.
- [ ] **성능 UX(조회 timeout·취소·서버 다운샘플링·가상화, 원본 전체를 브라우저로 보내지 않음)** — **[3/3] Must** — Decided, §27.
- [ ] **공통 키보드 숏컷 레지스트리** — **[2/3 · Codex, Grok] Should**.
- [ ] **환경 배너(staging/prod) + 메타데이터 쓰기 경고** — **[1/3 · Grok] Should** — 신규 제안.
- [ ] **Feature flag로 메뉴 점진 노출(레지스트리 필드로)** — **[1/3 · Grok] Should** — 신규 제안.

## 5. 개발 편의 (메뉴 개발을 쉽게 만드는 공통 자산)

- [ ] **5개 Page Archetype(Overview/Analysis Workspace/Management/Catalog/Workflow) 최소 템플릿** — **[3/3] Must** — Decided, §12.
- [ ] **Platform Component 스타터셋** — `GlobalContextBar`, `PageHeader`, `DataTrustIndicator`, `AnalysisChartFrame`, `PlatformDataTable`, `DetailDrawer`, `AuditTimeline`, `EmptyState`, `PermissionGuard`(`SavedViewSelector`는 채택 시). **[3/3] Must** — Decided, §13.
- [ ] **PlatformDataTable 계약(서버 정렬/필터, 가상화, 컬럼 설정, 선택, 내보내기 재사용)** — **[3/3] Must** — Decided, §15.
- [ ] **Analysis Chart Frame + 공통 Toolbar 어휘(Zoom/Brush/Reset/Compare/Annotate/Export)** — 차트 비즈니스 정의는 도메인 소유. **[3/3] Must** — Decided, §16.
- [ ] **공개 스키마 단일 산출물(URL/JSON 필드·카디널리티) + codegen** — 클라이언트/서버가 같은 정의 소비. **[3/3] Must/Should** — Decided 소유, 형식은 Candidate.
- [ ] **계약 적합성/스냅샷 테스트(URL round-trip, 잘못된 입력, 파서 dump 기반 view 회귀)** — "테스트 없는 계약은 흡수 선언일 뿐"이라는 §01 원칙. **[3/3] Must**.
- [ ] **메뉴 PR 거버넌스 체크리스트 = Platform-first Definition of Done(Domain Done ≠ Platform Done)** — **[3/3] Must** — Decided, §28/§29.
- [ ] **메뉴 스캐폴드/코드 생성 도구(레지스트리 매니페스트→라우트·권한·Context 스텁)** — 반복 확인 후 도입(과도한 선공통화 금지). **[3/3] Should/Nice**.
- [ ] **차트 타입 레시피/허용 목록(시계열·분포·히트맵·구간 타임라인, Gauge/3D 기본 금지)** — **[3/3] Should**.
- [ ] **도식(다이어그램)은 도메인 컴포넌트로 유지(EquipmentValidityTimeline, WaferJourneyTimeline 등)** — 반복 확인 전 범용 엔진 금지(Premature Platformization). **[3/3] Should**.
- [ ] **컴포넌트 갤러리(Storybook 등) — 토큰·11개 상태 taxonomy 시각 통로** — **[2/3 · omp, Codex] Nice/Should** — 신규 제안.
- [ ] **개발용 파서 dump fixture/목데이터 제너레이터** — **[2/3 · Codex, omp] Should** — 신규 제안.
- [ ] **화면 설계 워크플로 강제(Requirements→IA→Screen Spec→Wireframe→Open Decisions)** — 이미 `.agents/skills/analysis-platform-wireframe/SKILL.md`로 존재. **[2/3 · Codex, Grok] Should** — Decided 절차.

## 6. 기타 제안 (위 5개 범위 밖, 플랫폼이 메뉴 없이도 실패하는 지점)

- [ ] **버전 5종 혼동 방지** — 분석 계약 버전 ≠ 파서 SnapshotSchema ≠ DB 마이그레이션 ≠ 지표 정의 버전 ≠ URL `v`. 하나의 숫자로 묶지 않는다. **[3/3] Must** — Decided.
- [ ] **mart 재계산 트리거 4종 + 계산 세대 관리** — 지연 완료 watermark, 마스터 소급 정정, 설비 재분류, 지표 정의 변경. 한 화면의 차트·표·CSV가 다른 세대를 섞지 않는다. **[3/3] Must** — Decided, `docs/01`.
- [ ] **집계 가능성 규칙 강제(비율은 분자·분모 각각 합산, P95의 평균 금지)** — **[3/3] Must** — Decided.
- [ ] **지연완료 정책(`lateArrivalAutoHorizon`, 진행 경계 `R`·창 `H`, 창 밖은 정정 후보로 보존)** — 메커니즘 Decided, 숫자는 Open. **[3/3] Must**.
- [ ] **재현성 계약(딥링크는 조회조건·지표 버전만 재현, 숫자는 계산 기준시각과 함께 표시)** — **[3/3] Must** — Decided.
- [ ] **파서 DB 접근 토폴로지(같은 인스턴스, read-only, 플랫폼 전용 스키마, API는 원본 테이블 직접 조회 금지)** — **[3/3] Must** — Decided.
- [ ] **단일 테넌트 + site/plant 행 스코핑(초기), 풀 멀티테넌시는 요구 확인 시** — **[3/3] Should**.
- [ ] **접근성 릴리스 게이트(색만으로 상태 구분 금지)** — **[2/3 · Grok, omp] Must**.
- [ ] **보안: URL 필터는 보안 경계가 아님을 위협모델에 명시(권한은 서버에)** — **[2/3 · Grok, omp] Must**.
- [ ] **브라우저 지원 매트릭스 정의** — Desktop-first/Canvas 차트/가상화가 브라우저에 의존. **[3/3] Should** — 신규 제안.
- [ ] **백업/복구 전략(플랫폼 메타 DB — 감사·지표 버전 이력이 유실되면 복구 불가)** — **[2/3 · Codex, omp] Should/Must** — 신규 제안.
- [ ] **의존성 라이선스/유료 기능 사전 검토(예: AG Grid Enterprise 경계)** — **[1/3 · omp] Should**.
- [ ] **운영 관측/runbook(API 실패·쿼리 지연을 correlation ID로 연결)** — **[1/3 · Codex] Should** — 신규 제안.
- [ ] **쓰기 동시성/중복 실행 정책(마스터 수정, 지표 발행, VOC 전이, backfill 충돌 감지)** — **[1/3 · Codex] Must** — 신규 제안.

---

## Open Questions (통합, 결정 전 구현 금지 — 체크박스 아님)

세 모델의 Open Questions(13+18+20=51개)를 주제별로 병합했다.

1. **셸 치수·테이블 밀도** — 위 §0 참조. 즉시 결정 필요.
2. **Scope 도메인** — 계층(사이트→공장→라인)·상속·복수 Scope·설비 소속 변경 규칙. 현재는 단일 `scopeId`가 결정.
3. **시간 의미** — 사업장별 실제 TZ 값, timeDomain assertion 공급자, 교대일/영업일, 다중 사업장의 "같은 날짜".
4. **운영 수치** — `defaultRangeTo` 기본 길이, 지연완료 창 `H`, 폴링/감지 주기, 최대 조회량·timeout.
5. **인증·조직·배포** — 사내 SSO 여부, 백엔드 언어(FastAPI 권장이나 팀 스택에 따라 변경 가능), 온프렘/클라우드, 브라우저 지원 범위, 동시 사용자·데이터 볼륨/보존 기간, 멀티테넌시 여부.
6. **상태 근거 서비스** — 수집/파서 지연/coverage 판정의 statusSource·observedAt 공급자가 없으면 모니터링 메뉴를 열 수 없다.
7. **공개 계약 산출물 형식** — 필드명·공집합 표식·assessment enum, OpenAPI/JSON Schema/codegen 중 무엇으로 확정할지, URL `v` sunset 정책.
8. **디자인 바인딩** — 다크모드 실제 수요, 아이콘 라이브러리, UI 프리미티브 조합, ECharts vs Plotly 최종 확정(POC 필요), CJK 폰트 선택, 기간 프리셋(7D/30D/90D) 의미.
9. **공지·알림** — 배너 위치·노출 조건, 알림 벨의 읽음/집계/권한 의미(벨 자체는 비필수).
10. **메뉴 활용률의 목적과 노출 범위** — 개인별 이용 기록 필요 여부, 보존 기간, 열람 권한, 익명화 수준.
11. **업무 모델 세부** — 필드별 외부/플랫폼 소유권, VOC 담당 조직·상태 전이 예외, 마스터 필드 원천 소유권.
12. **운영 완료 기준** — 가용성·복구 목표(RTO/RPO), 감사 보존기간, 대량 작업 실패 재개 책임.
13. **추가 메뉴 착수 조건** — 알람/이상탐지·리포트 빌더·저장된 뷰를 정당화할 사용자 수요·반복 사례가 실제로 있는가.
14. **Donut/Gauge 허용 경계** — §24 장식적 시각화 금지와 레퍼런스 디자인의 donut 어휘 사이 명확한 선.
15. **보조기술 사용자 실존 여부** — §26 접근성 기준 자체는 Decided이나 투입 우선순위 조정 여지.

---

## 부록 — 이 문서를 만든 방법과 한계

- 세 모델 모두 기존 문서를 **읽기만** 했고 수정하지 않았다. 이 저장소의 `docs/*.md`, `DESIGN.md`는 변경되지 않았다.
- 세 원본 리포트(`.agents/reports/requirements-*.md`)에는 이 요약에 없는 세부 근거 인용·문장이 더 있다. 특정 항목을 실제로 착수하기 전에는 해당 항목이 어느 모델 리포트의 어느 줄에서 왔는지 원본을 대조하는 걸 권한다.
- **[N/3]** 표기는 "몇 개 모델이 유사한 취지를 지적했는가"를 사람이 판단해 합친 것이지, 자동 집계가 아니다. 문장 표현은 모델마다 달라서 완전히 기계적으로 매칭할 수 없었다.
- 세 모델 모두 사용자가 지정한 범위(디자인 요소, 설비관리/기준정보관리/생산성분석/지표관리/공지/VOC/모니터링 메뉴, 메뉴 간 포워딩, 메뉴 활용률 분석, 개발 편의 컴포넌트·차트·도식·레이아웃) 외에도 자유 판단으로 항목을 추가했다 — 특히 **사용자·조직 모델**, **메뉴 활용률 계측 파이프라인**, **시간역 관리 화면**, **버전 5종 혼동 방지**, **백업/복구 전략**은 문서에 없었는데 세 모델이 독립적으로 필요하다고 판단해 신규 제안한 항목이다.
