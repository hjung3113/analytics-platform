# analytics-platform 구축 요구사항 종합 (3-모델 교차 검증)

작성 방식: `docs/00`~`07`, `DESIGN.md`, `.agents/skills/analysis-platform-wireframe/SKILL.md`를 세 개의 독립 모델에게 각각 정독시켜 요구사항 체크리스트를 뽑고(orca orchestration으로 병렬 디스패치), 그 결과를 이 문서에서 하나로 통합했다. 세 모델 모두 "메뉴 개수를 늘리는 것보다 Platform Kernel을 완성하는 것이 우선"이라는 `AGENTS.md`의 원칙을 전제로 작성했다.

| 모델 | 관점/강점 | 산출 항목 수 | 원본 |
| --- | --- | ---: | --- |
| Codex `gpt-6-astra` (medium) | 계약 정합성·데이터 신뢰·출처 인용 정밀도 | 86개 + Open 13 | [requirements-codex-astra.md](.agents/reports/requirements-codex-astra.md) |
| Grok `4.6` (high) | YAGNI 경계·메뉴 카탈로그 폭·긴장 관계 발견 | 153개(신규 제안 38 포함) + Open 18 | [requirements-grok.md](.agents/reports/requirements-grok.md) |
| omp `zai/glm-5.3` (thinking max) | 문서 간 수치 충돌 탐지·개발 편의 항목 | 114개(신규 제안 17 포함) + Open 20 | [requirements-omp-glm.md](.agents/reports/requirements-omp-glm.md) |

**이 문서는 계약 원본이 아니라 파생 작업·제안 목록이다.** 항목을 고칠 때 원본의 해당 문단부터 확인한다. 모델 표수나 Must/Should/Nice는 최초 조사에서의 지적 빈도·우선순위 제안이며 채택·일정·구현 승인이 아니다.

읽는 법:

- **[3/3] / [2/3] / [1/3 · 모델명]**은 조사 출처 이력이다. 다수 의견이어도 제품 결정이나 검증 증거가 되지 않는다.
- **Decided**는 원본에 확정된 계약, **Candidate/신규 제안**은 미채택 후보, **Open**은 필요한 입력·결정이 남은 범위, **Deferred**는 보류 범위다. 한 항목 안에서도 계약·필드명·구현 형식의 상태를 따로 읽는다. 상태·원본이 불명확한 추천은 승인된 요구로 간주하지 않는다.
- **§0의 [x]는 문서의 결정 반영 완료**다. §1–6의 [ ]는 미완료 작업/검토 후보이며 채택 여부를 뜻하지 않는다. 구현 항목을 [x]로 바꾸려면 해당 줄에 작업 기록 또는 PR 링크를 붙이고 `원본 revision·구현 파일/commit·검증 명령/환경/결과·미검증 범위`를 남긴다. 후보 검토 완료는 채택/기각 근거를 남기며 제품 구현 완료와 구별한다.
- 플랫폼 자체의 구현·런타임 검증 증거는 현재 없다. FeedbackOps 구현을 이 목록의 완료 증거로 쓰지 않는다. 메뉴 구현 완료는 [06 §29](docs/06_platform_ui_contract.md#29-platform-first-definition-of-done)의 Platform Done과 Domain Done을 함께 확인한다.
- 전역 행동·URL·Scope·상태의 원본은 [06](docs/06_platform_ui_contract.md), 시각 token/render는 [DESIGN](DESIGN.md), 데이터 계약은 [01](docs/01_architecture_and_data_contract.md), 도메인 의미는 [02](docs/02_domain_menus.md)와 [CONTEXT](CONTEXT.md)다. 기술 선택은 [03](docs/03_backend_stack.md)/[04](docs/04_frontend_ui_ux.md), 결정 경로는 [05](docs/05_roadmap_and_open_questions.md), 폴링·DB 접근·R/H 상세는 [01 데이터 운영 정책](docs/01_architecture_and_data_contract.md#데이터-운영-정책)을 본다. 아래 `§6.1` 같은 전역 계약 절 표기는 06을 가리킨다.

---

<a id="0-지금-바로-결정해야-하는-문서-충돌-3개-모델-모두-발견"></a>
## 0. 해결된 문서 충돌 — 결정 반영 이력

두 수치 충돌은 아래 날짜에 해결됐다. 체크는 문서 정렬 완료를 뜻하며 CSS·컴포넌트 구현이나 렌더 검증 완료가 아니다. 원본은 [DESIGN](DESIGN.md), 적용 의무는 [06 §7/§15](docs/06_platform_ui_contract.md)다.

- [x] **셸 치수(사이드바/탑바) 확정** — 2026-09-21 결정: `DESIGN.md` canonical(사이드바 270px · 헤더 54px) 채택. `docs/06` §7을 Decided로 갱신 완료. **[3/3]**
- [x] **테이블 행 밀도 확정** — 2026-09-21 결정: `DESIGN.md` table-density(최소 32px, 25px는 compact 시각 목표) 채택. `docs/06` §15를 Decided로 갱신 완료. **[3/3]**

---

## 1. 디자인 요소

- [ ] **디자인 토큰 3층(primitive→semantic→component)을 실제 CSS/Tailwind 변수로 물질화** — `docs/06` §23은 Candidate, `DESIGN.md`는 그와 정렬됐지만 코드 산출물은 없다. 화면마다 임의 색·간격이 생기지 않게 하는 기반. **[3/3] Must** — Decided/Candidate.
- [ ] **차트 라이브러리(ECharts, 2026-09-25 Decided) 테마를 토큰에 바인딩** — 채택은 확정했고(`docs/04` 프론트엔드 기술 스택), 이 세션 Unit B(`prototypes/kernel-chart-frame/`)에서 SVG 렌더러 기본 동작은 실검증했다. 다만 실제 디자인 토큰 바인딩과 대용량 시계열·다중 차트 브러시 동기화 POC는 아직 없다. **[3/3] Must** — `DESIGN.md` Open Decisions, `docs/04`.
- [ ] **아이콘 세트 단일화(Lucide, rounded-outline)** — 2026-09-22 grilling으로 Lucide 확정(Candidate→Decided). 실제 바인딩/구현은 아직. **[3/3] Should** — Decided.
- [x] **UI 프리미티브 조합 확정** — 2026-09-25 결정: shadcn/ui + Radix, FeedbackOps `packages/ui/src/components/shadcn/`의 실제 22개 컴포넌트 소스와 `cn()` 헬퍼를 이식한다. `docs/06` §13을 Decided로 갱신 완료. **[3/3]** 실제 이식·포팅 작업은 아직(체크는 채택 결정 완료를 뜻하며 코드 이식 완료가 아니다). 원본: [04 프론트엔드 기술 스택](docs/04_frontend_ui_ux.md#프론트엔드-기술-스택-decided-2026-09-25).
- [ ] **인터랙션 상태 전체 구현(hover/pressed/selected/focus/disabled/busy)과 중복 제출 차단** — 토큰만 있고 동작 미구현. **[3/3] Must** — Decided/디자인 요구.
- [ ] **접근성 구현·렌더 검증(§26): 키보드 탐색, focus trap, 색 외 구분, 대비 4.5:1/3:1** — 토큰만으로 통과 주장 불가. **[3/3] Must** — Decided.
- [ ] **한/영 UI 범위** — UI 문구·정적 본문만 번역하며 사용자 입력 본문·마스터 값·식별자는 번역하지 않는다. [06 §23](docs/06_platform_ui_contract.md#23-design-tokens) Decided, 언어 선호 저장은 Candidate. 구현 완료를 뜻하지 않는다.
- [ ] **한글/CJK 타이포 검증** — 2026-09-22 grilling으로 폰트 스택 확정: Noto Sans KR + Inter 페어링. 사내망이 망분리(인터넷 차단)돼 있어 **CDN이 아니라 자체 호스팅**(폰트 파일 번들)으로 간다. 실제 CSS/토큰 반영은 아직. **[3/3] Should** — Decided(스택/호스팅 방식), 실제 물질화는 구현 시.
- [ ] **Data Trust 시각 표준화(Updated/Data through/Coverage/Metric version/Provisional을 공통 vocabulary로)** — 숫자만큼 숫자의 상태를 보여줘야 함. **[3/3] Must** — Decided, `docs/06` §18.
- [ ] **상태 배지 4종(success/warning/danger/neutral) + §19 매핑표를 임의색으로 확장 금지** — 매핑표 자체는 문서에 없어 공백. **[2/3 · Codex, Grok] Must** — Candidate + 신규 제안(공백 메움).
- [ ] **다크모드는 지금 설계하지 않되 토큰 구조가 이후 확장을 막지 않게** — 사이드바가 이미 다크라 단순 invert 불가. **[3/3] Nice** — Deferred. [DESIGN Open Decisions](DESIGN.md#open-decisions-per-wireframe-skill-convention)와 아래 질문 8 참조.
- [ ] **장식적 시각화 금지(Gauge/3D/장식 게이지) — donut은 분모 있는 비율에만** — 2026-09-22 grilling으로 경계 확정: 기본값은 분모 있는 비율에 한해 donut만 허용, gauge/3D/그라디언트는 기본 비허용이나 업무 근거 확인 시 케이스별 예외 가능(전면·영구 금지 아님). [06 시각화 경계](docs/06_platform_ui_contract.md#decorative-visualization) 참고. **[2/3 · Grok, omp] Must** — Decided.
- [ ] **모션 토큰(120ms 전환, reduced-motion 0ms, live pulse는 freshness 근거 있을 때만)** — **[2/3 · Codex, Grok] Should**.
- [ ] **KPI 타일 상한 5–6개** — KPI 행이 지표 화면을 대체하지 않게. **[2/3 · Grok, omp] Should**.
- [ ] **숫자 표시 규칙(우측 정렬·tabular-nums·ID mono)** — **[2/3 · Codex, omp] Must**.
- [ ] **반응형(Desktop-first, ≥1440 full / 1024–1439 collapse / <1024 조회 중심)** — **[3/3] Must(정책)**, 실제 모바일 구현은 Nice — Desktop-first 제약과 [06 §25](docs/06_platform_ui_contract.md#25-responsive-strategy)의 Candidate breakpoint 정책을 구별한다.
- [ ] **z-index/오버레이 스택 계약(Dropdown/Popover/Drawer/Modal/Palette/Toast)** — 전역 스택 정의가 없음. **[1/3 · Grok] Should** — 신규 제안.
- [ ] **기간 프리셋 값·의미 확정** — 2026-09-22 grilling으로 확정: 프리셋 버튼은 `7D/30D/90D`가 아니라 **`1일/7일/사용자 지정`**(실사용 패턴: 보통 1일, 길면 7일, 드물게 그 이상). Δ는 §6.3이 이미 정한 `defaultRangeTo` 기준 rolling wall-clock(자정 비정렬) 그대로 재사용(1일=Δ24h, 7일=Δ168h). 달력일 정렬·교대일/영업일 의미는 별도 Open. [06 시간 계약](docs/06_platform_ui_contract.md#ctx-time) 참고. **[3/3] Must** — Decided.
- [ ] **집계 단위(`granularity`) URL 계약 신설** — 2026-09-22 grilling에서 새로 확인: 조회 기간과 별개로 "시간별/일별/주별로 뭉쳐 보기" 축이 필요. 06 §6.1의 page-owned 계약 패턴(화면별 선언·등록)으로 추가, 전역 Context Bar에는 넣지 않는다. 값 후보 `hour`/`day`/`week`. **[신규, 이번 세션 확인] Must** — Decided(메커니즘/소유 방식), 필드명은 Candidate.
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
- [ ] **메뉴 활용률 대시보드(관리·감사)** — 누가 어떤 메뉴를 얼마나 쓰는지. 2026-09-22 grilling으로 범위 판단 정정: 메뉴 개수 게이트(Premature Platformization) 대상이 아니라 Platform Kernel 자체의 관측 범위라 v1에 포함한다. **[3/3] Must** — Decided(범위 포함), 세부는 §4 참고.
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
- [ ] **전역 필터·Equipment Group 두 층 URL 정책** — room_name/PPID/Recipe는 전역 축이며 Operation은 v1 필터에서 제외. StGroup / 분임조 / Maker+Model 중 한 축을 Condition으로 유지하고 현재 결과 재평가를 허용한다. 명시 Selection은 축과 무관하게 고정 EquipmentID 목록이다. 공개 키 후보·기존 equipmentIds 대응은 [06 §6.1/§6.4](docs/06_platform_ui_contract.md), 근거는 [ADR-0002](docs/adr/0002-stgroup-materializes-to-equipment-ids.md). **Must — Decided(2026-09-24 개정), 구현 미완료**.
- [ ] **미지원 Context는 폐기하지 않고 칩으로 표시("Lot: A1023 · Not used")** — 지원 메뉴 복귀 시 재검증 후 적용. **[3/3] Must** — Decided.
- [ ] **전역 Context / Page Filter / Visualization / 영속 주석 4층 분리** — 차트 줌은 로컬, Brush 후 명시적 적용만 URL 승격. **[3/3] Must** — Decided.
- [ ] **URL이 세션/최근방문보다 우선, 누락값을 과거 세션으로 채우지 않음** — **[3/3] Must** — Decided.
- [ ] **URL 스키마: 집합 키 정규화, 명시적 공집합 표식, 카디널리티 검증** — **[3/3] Must** — Decided.
- [ ] **`metricId`+`metricVersion` 쌍 보존** — 임의 최신 버전 대체 금지. 단, 초기화를 선언한 진입점의 ID-only 입력과 소유 ID가 유일한 경로의 version-only 입력은 [06 §6.1](docs/06_platform_ui_contract.md#61-식별자와-url-소유-상태-decided)의 완성/초기화 규칙을 따른다. **[3/3] Must** — Decided.
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
- [ ] **전역 Context Bar(Time/Equipment/Group Condition·Selection/room_name/Lot/PPID/Recipe/Metric Version/Scope), 헤더 Scope 선택기와 중복 배치 금지** — **[3/3] Must** — Decided.
- [ ] **인증/세션** — 사내 SSO 존재는 확인됐고 정확한 프로토콜은 Open. 확인 전 pluggable 경계만 확정했으며 OIDC·라이브러리·도입 시점을 확정하지 않는다. **[3/3] Must(방향)**. 원본: [05 인증 질문](docs/05_roadmap_and_open_questions.md#open-questions), [03 인증 행](docs/03_backend_stack.md). 실제 연동은 질문 5의 사내 입력에 의존한다.
- [ ] **전 경로 권한/Scope 집행(메뉴·URL·필터·조회·캐시·내보내기·딥링크·저장된 뷰 전부 동일 정책, 서버 매 요청 재검증)** — **[3/3] Must** — Decided, §6.2/§17.
- [ ] **권한없음 vs 데이터없음 Empty State 분리** — **[3/3] Must** — Decided.
- [ ] **감사(Audit Trail) 공통 기반(who/when/before-after, 유효기간 이력과 분리)** — **[3/3] Must**.
- [ ] **두 층 응답 스키마(outcome + assessments[]), unknown 누락 없이 반환** — 가짜 상태 판정 방지. **[3/3] Must** — Decided, §19.
- [ ] **폴링 + 완료된 계산 세대 기반 캐시 재검증(watermark 이동 ≠ mart 완료)** — SSE/WebSocket은 요구 확인 후. **[3/3] Must** — Decided.
- [ ] **Toast/Confirm/Modal/전역 Error Boundary + Correlation ID** — **[3/3] Must** — Decided.
- [ ] **공지 배너 인프라(게시기간·대상 메뉴·Scope)** — 통합 알림 벨/미확인 배지는 읽음 모델이 미정이라 **비필수**. **[3/3] Should(배너)/Nice(벨)**.
- [ ] **메뉴 활용률 계측 파이프라인** — 2026-09-22 grilling으로 정책 확정: 수집 필드는 menuId·이벤트·시각뿐 아니라 **조회조건·필터값까지 포함**. 보존기간은 **무제한**(자동 삭제 없음, 개발자가 필요시 수동 삭제). 열람권한은 **개발자·운영자 기본, 그 외는 운영자가 개별 승인한 계정만**(기존 권한/Scope 재검증 원칙 위에 얹음, 새 권한 모델 아님). 이벤트 스키마 등 실제 구현 세부는 착수 직전 별도로 다룬다. `docs/05` §메뉴 활용률 계측 참고. **[3/3] Should** — Decided(정책), Open(이벤트 스키마 구현 세부).
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
- [ ] **지연완료 정책(`lateArrivalAutoHorizon`, 진행 경계 `R`·창 `H`, 창 밖은 정정 후보로 보존)** — 메커니즘과 **H=1시간은 Decided**, 필드명은 Candidate. 원본: [01 R/H 정책](docs/01_architecture_and_data_contract.md#late-arrival-policy), 조회 기간과의 연결은 [06 CTX-TIME](docs/06_platform_ui_contract.md#ctx-time). 운영 설정·워커 구현·검증 증거는 아직 없다. **[3/3] Must**.
- [ ] **재현성 계약(딥링크는 조회조건·지표 버전만 재현, 숫자는 계산 기준시각과 함께 표시)** — **[3/3] Must** — Decided.
- [ ] **파서 DB 접근 토폴로지(같은 인스턴스, read-only, 플랫폼 전용 스키마, API는 원본 테이블 직접 조회 금지)** — **[3/3] Must** — Decided.
- [ ] **초기 1개 Site/Line 운영 범위, 확장 가능한 구조** — 운영 시작 범위와 권한 계층은 구별한다. Scope 관계는 Site→room_name→StGroup→Equipment, Line은 독립 축, Factory/plant는 제외. Site별 DB 분리, v1 단일 Scope 선택은 Decided이며 상속 세부는 Open. 원본: [06 §6.2](docs/06_platform_ui_contract.md#62-scope와-권한-decided--open), [ADR-0005](docs/adr/0005-scope-room-name-line-independent.md). **[3/3] Should**.
- [ ] **접근성 릴리스 게이트(색만으로 상태 구분 금지)** — **[2/3 · Grok, omp] Must**.
- [ ] **보안: URL 필터는 보안 경계가 아님을 위협모델에 명시(권한은 서버에)** — **[2/3 · Grok, omp] Must**.
- [ ] **브라우저 지원 매트릭스 정의** — Desktop-first/Canvas 차트/가상화가 브라우저에 의존. **[3/3] Should** — 신규 제안.
- [ ] **백업/복구 전략(플랫폼 메타 DB — 감사·지표 버전 이력이 유실되면 복구 불가)** — **[2/3 · Codex, omp] Should/Must** — 신규 제안.
- [ ] **의존성 라이선스/유료 기능 사전 검토(예: AG Grid Enterprise 경계)** — **[1/3 · omp] Should**.
- [ ] **운영 관측/runbook(API 실패·쿼리 지연을 correlation ID로 연결)** — **[1/3 · Codex] Should** — 신규 제안.
- [ ] **쓰기 동시성/중복 실행 정책(마스터 수정, 지표 발행, VOC 전이, backfill 충돌 감지)** — **[1/3 · Codex] Must** — 신규 제안.

---

<a id="open-questions-통합-결정-전-구현-금지--체크박스-아님"></a>
## Open Questions — 미결 범위와 결정 이력

초기 조사 질문을 주제별로 병합한 목록이며 완료 이력도 함께 남긴다. **미결 입력에 의존하는 동작만 보류한다.** 독립적인 문서 검토·계약 설계까지 모두 막지 않는다. 취소선은 해당 결정 이력에만 적용하며 일부가 남았으면 아래에 명시한다.

질문 처리 경로: 인증·운영 입력은 [05](docs/05_roadmap_and_open_questions.md#open-questions), 시간은 [06 CTX-TIME](docs/06_platform_ui_contract.md#ctx-time), Scope·공개 계약·상태는 [06](docs/06_platform_ui_contract.md), 기술 후보는 [04](docs/04_frontend_ui_ux.md)를 먼저 확인한다. 후속 작업 담당은 필요한 입력·결정 주체·차단되는 동작·답변 전 가능한 일을 작업 기록에 적는다. 담당자가 미지정이면 지정 필요로 남기고 답을 만들어 넣지 않는다.

1. ~~**셸 치수·테이블 밀도**~~ — 2026-09-21 결정 완료(§0, `docs/05` 참조). DESIGN.md canonical(270px/54px/32px) 채택.
2. **Scope 도메인 — Decided / 상속 세부 Open** — Site→room_name→StGroup→Equipment 관계, room_name 기준 권한, 독립 Line 축을 따른다([ADR-0005](docs/adr/0005-scope-room-name-line-independent.md)). EquipmentID는 전 Site 유일하고 Site는 ID 사용 전 활성 Scope에서 확립한다([ADR-0004](docs/adr/0004-site-is-db-partition-not-column.md)). room_name은 드물게 변경 가능·ID 유지, EquipmentName 변경은 재등록·기존 ID 종료. StGroup·분임조는 외부 소속 정보다. v1 단일 Scope 및 [06 §6.2](docs/06_platform_ui_contract.md#62-scope와-권한-decided--open)의 상속 Open을 유지한다.
3. **시간 의미** — 사업장별 실제 TZ 값은 2026-09-22 결정(한국/Asia-Seoul 단일값 우선, 해외 사업장 확장은 배제 안 함 — `docs/05` 참조). timeDomain assertion 공급자, 교대일/영업일, 다중 사업장의 "같은 날짜"는 여전히 Open. assertion 공급 근거는 국내 설비끼리라도 복수 시간축 병합을 제공하기 전에 필요하다([06 시간 계약](docs/06_platform_ui_contract.md#ctx-time)).
4. **운영 수치** — `defaultRangeTo` 기본 길이, 실제 데이터 볼륨·조회 패턴, 최대 조회량·timeout은 Open. 지연완료 창 `H`=1시간, 클라이언트 폴링 주기=5분(300s)은 2026-09-22 결정(`docs/05` 참조). 폴링 중단 조건·워커 감지 주기는 여전히 Open(구현 시 운영 설정으로 정함).
5. **인증·조직·배포 — 일부 Decided / 프로토콜 Open** — 2026-09-22 대부분 결정 완료(`docs/05` 참조): 백엔드 FastAPI, 온프렘, 동시 사용자 ~100명, 데이터 보존 기간 제한 없음, 멀티테넌시는 단일 사업장으로 시작(확장 가능). 남은 Open: 사내 SSO 프로토콜의 정확한 사양(존재는 확인, 스펙은 사내 확인 중), 브라우저 지원 범위(위 브라우저 지원 매트릭스 제안 참조). 실제 데이터 볼륨은 질문 4에서 추적한다.
6. **상태 근거 서비스** — 수집/파서 지연/coverage 판정의 statusSource·observedAt 공급자가 없으면 모니터링 메뉴를 열 수 없다.
7. **공개 계약 산출물 형식** — 필드명·공집합 표식·assessment enum, OpenAPI/JSON Schema/codegen 중 무엇으로 확정할지, URL `v` sunset 정책.
8. **디자인 바인딩** — 아이콘(Lucide)·CJK 폰트(Noto Sans KR, 망분리라 자체 호스팅)·기간 프리셋(1일/7일/사용자 지정)은 2026-09-22 결정(`docs/05` 참조, 실제 물질화는 구현 시). 다크모드는 Deferred. UI 프리미티브 조합(shadcn/ui+Radix, FeedbackOps 이식)과 차트(ECharts)는 2026-09-25 Decided이며 이 세션 프로토타입(Unit B/C)으로 기본 동작을 검증했다. 실제 디자인 토큰 바인딩·대용량 성능·POC는 아직 없다.
9. **공지·알림** — 배너 위치·노출 조건, 알림 벨의 읽음/집계/권한 의미(벨 자체는 비필수).
10. ~~**메뉴 활용률의 목적과 노출 범위**~~ — 2026-09-22 결정 완료(`docs/05` §메뉴 활용률 계측 참조): v1 범위 포함(커널 범위 기능), 수집은 조회조건·필터값까지, 보존기간 무제한(수동 삭제 가능), 열람권한은 개발자·운영자 + 운영자 개별 승인 계정.
11. **업무 모델 세부** — 필드별 외부/플랫폼 소유권, VOC 담당 조직·상태 전이 예외, 마스터 필드 원천 소유권.
12. **운영 완료 기준** — 가용성·복구 목표(RTO/RPO), 감사 보존기간, 대량 작업 실패 재개 책임.
13. **추가 메뉴 착수 조건** — 알람/이상탐지·리포트 빌더·저장된 뷰를 정당화할 사용자 수요·반복 사례가 실제로 있는가.
14. ~~**Donut/Gauge 허용 경계**~~ — 2026-09-22 결정 완료(`docs/05` §시각화 경계 참조): 기본은 분모 있는 비율에 한해 donut만 허용, gauge/3D/그라디언트는 기본 비허용이나 업무 근거 확인 시 케이스별 예외 가능(전면 금지 아님).
15. **보조기술 사용자 실존 여부** — §26 접근성 기준 자체는 Decided이나 투입 우선순위 조정 여지.

---

## 부록 — 이 문서를 만든 방법과 한계

- 최초 요구사항 수집 당시 세 모델은 기존 문서를 **읽기만** 했다. 이후 인터뷰와 문서 이행 변경은 Git 이력과 [HANDOFF](HANDOFF.md)를 따른다. 이 단락은 현재 문서가 최초 상태 그대로라는 뜻이 아니다.
- 세 원본 리포트(`.agents/reports/requirements-*.md`)에는 이 요약에 없는 세부 근거 인용·문장이 더 있다. 특정 항목을 착수하기 전에는 현행 계약 원문을 먼저 대조하고, 제안 배경이 필요할 때 해당 모델 리포트를 추가로 읽는다.
- **[N/3]** 표기는 "몇 개 모델이 유사한 취지를 지적했는가"를 사람이 판단해 합친 것이지, 자동 집계가 아니다. 문장 표현은 모델마다 달라서 완전히 기계적으로 매칭할 수 없었다.
- 세 모델 모두 사용자가 지정한 범위(디자인 요소, 설비관리/기준정보관리/생산성분석/지표관리/공지/VOC/모니터링 메뉴, 메뉴 간 포워딩, 메뉴 활용률 분석, 개발 편의 컴포넌트·차트·도식·레이아웃) 외에도 자유 판단으로 항목을 추가했다 — 특히 **사용자·조직 모델**, **메뉴 활용률 계측 파이프라인**, **시간역 관리 화면**, **버전 5종 혼동 방지**, **백업/복구 전략**은 문서에 없었는데 세 모델이 독립적으로 필요하다고 판단해 신규 제안한 항목이다.
