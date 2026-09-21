# 문서 단일 책임 감사 — Grok 4.6

작성: 2026-09-21. 범위: `docs/INDEX.md`, `docs/00`~`07`, 루트 `DESIGN.md`, `.agents/skills/analysis-platform-wireframe/SKILL.md`, `PLATFORM_REQUIREMENTS.md`, `HANDOFF.md`, `AGENTS.md`/`CLAUDE.md`. 읽기 전용 분석이며 이 파일만 신규 작성한다.

이 감사는 **값이 무엇인가**가 아니라 **어느 문서가 무엇을 소유해야 하는가**다. 이미 확정된 계약은 유지한다.

- `docs/06`이 전역 UX/Scope/Context/URL/Menu Extension/Shell Slot/navigation IA의 authoritative source (`docs/INDEX.md` L38, `docs/06` L7–9, `AGENTS.md` L9).
- `docs/05`가 결정 상태와 미결 질문을 추적 (`AGENTS.md` L15, `HANDOFF.md` L11).
- 셸 치수 사이드바 270px · 헤더 54px, 테이블 행 밀도 최소 32px(25px는 compact 시각 목표)는 2026-09-21에 `DESIGN.md` canonical 값으로 확정 (`docs/05` L14, `docs/06` L301–314 · L630–638, `PLATFORM_REQUIREMENTS.md` L25–26). 이 숫자를 바꾸거나 소유자를 `DESIGN.md`에서 빼자는 제안은 하지 않는다.

---

## 1. 현재 책임 지도

의도된 소유권은 `docs/INDEX.md` L36–38과 `docs/06` L7–9에 이미 있다. 실제 파일 내용은 그 표보다 넓고, `DESIGN.md`는 INDEX 소유권 표에 **아예 없다**.

### 1.1 문서별 실제 내용 vs 의도된 책임

| 문서 | 줄 | 의도된 책임 (INDEX / 06 머리말) | 지금 실제로 담고 있는 것 | 단일 책임 판정 |
| --- | ---: | --- | --- | --- |
| `docs/INDEX.md` | 42 | 역할별 진입점, 문서 목록, 소유권/tooling 경계 | 00–07 카탈로그와 소유권 문장. `DESIGN.md`·`PLATFORM_REQUIREMENTS.md`·`HANDOFF.md` 미등재 | 카탈로그가 불완전. 책임 원칙은 맞으나 시각 시스템 원본이 빠져 있음 |
| `docs/00_overview.md` | 35 | 목적/범위, 리뷰 핵심 발견, YAGNI | 목적/범위/YAGNI **plus** 1·2차 교차 리뷰 회의록, 파서 `docs/23` 인용 정정 내역, 딥링크 UTC 오류 경위 | 개요 + 리뷰 로그가 한 파일. 리뷰 로그는 `docs/reviews/` 성격 |
| `docs/01_architecture_and_data_contract.md` | 65 | 아키텍처, 파서-플랫폼 데이터 계약 | view/mart 계층, 버전 5종 구분, 재계산 트리거, 집계 가능성, 마스터 원천 소유권, 멀티테넌시 Open | 대체로 준수. Phase 0 일정 언어와 프론트 표현 포인터가 경계 밖 |
| `docs/02_domain_menus.md` | 30 | 도메인 capability catalog | 플랫폼 코어 기능 목록 + 6도메인 표 + IA 관계. Phase 1/2/4 배치와 Kernel 기능이 재서술됨 | catalog는 준수. 코어 기능·Phase는 06/05 중복 |
| `docs/03_backend_stack.md` | 37 | 백엔드/DB/인증 스택, 재현성·시간 계약 | 스택 Candidate + SQL-first + 재현성 + wall-clock 시간 + 상태 근거 소유자 | 스택은 준수. 재현성/시간/상태 규칙의 **제품 계약 본문**이 06과 겹침 |
| `docs/04_frontend_ui_ux.md` | 118 | 구현 후보, 리서치, 전역 계약 참조, 페이지 패턴, 차트/주석 | 제품 제약 재서술, 스택 Candidate, SaaS 리서치, 소유권 포인터, 도메인별 UI 패턴, 로딩 택소노미, 차트 4층 상태, **주석 저장 모델**, 최종 권장안 | 가장 혼재. 구현 후보와 리서치는 맞음. 패턴·상태·주석·딥링크는 06 계약과 겹침 |
| `docs/05_roadmap_and_open_questions.md` | 73 | 결정 상태 / Open Questions / Deferred Phase 가설 | 상태 표 + 검증 기준 + Open 체크리스트 + **실시간성·DB 접근·지연완료 메커니즘 본문** + Phase 표 | 인덱스 역할은 준수. Decided 메커니즘 전문이 06/01/03과 이중 정의 |
| `docs/06_platform_ui_contract.md` | 1141 | 전역 UX 계약 (Kernel, Registry, Context, Shell Slot, Archetype, Data Trust, IA) | 위 계약 **plus** Product Design Direction, 시각 토큰(§23), 셸 픽셀(§7), 테이블 픽셀(§15), shadcn 기반 선언, 구현 계획 경계, 셸 산출물 포인터 | 계약 원본으로서는 맞음. 시각 레시피·픽셀·라이브러리 채택이 DESIGN/04로 새야 할 자리에 남아 있음 |
| `docs/07_app_shell_wireframe.md` | 140 | 06을 소비하는 App Shell 화면 설계 | USER TASK / IA / Spec / Wireframe / Component map / Data / 시나리오 / Open. IA 트리가 02 카탈로그를 재수록. Open 표가 06/05의 Decided를 아직 Open으로 둠 | 화면 설계 역할은 준수. 도메인 화면 목록 복제 + stale Open |
| `DESIGN.md` | 946 | (INDEX에 없음) SKILL.md step 5 시각 시스템 | YAML 토큰 + Overview + Sources + 색/타입/레이아웃/컴포넌트 스펙 + **레퍼런스 대시보드 재구성** + **제품 Open Decisions** + 리뷰 정정 로그 | 토큰·시각 스펙은 맞음. 제품 요구·도메인 화면·결정 로그·URL 규칙이 대량 혼입 |
| `PLATFORM_REQUIREMENTS.md` | 189 | (INDEX에 없음) 3-모델 교차 검증 체크리스트 | §0 수치 충돌 결정, 구축 백로그 전체, Open 15항 재수록 | 작업용 종합본. 04/05/06/DESIGN의 네 번째 복사본. 계약이 아님 |
| `HANDOFF.md` | 43 | (명시) 일회성 세션 인계 | 2026-09-21 결정 요약과 다음 세션 할 일 | 준수. 휘발성. 계약 원본 아님 |
| `AGENTS.md` / `CLAUDE.md` | 31 | 에이전트 운영 요약, 06/05 포인터 | 플랫폼 목적, Platform-first DoD, 문서 진입점, 와이어프레임 스킬 | 준수. `DESIGN.md` 미언급 |
| 와이어프레임 `SKILL.md` | 77 | 화면 설계 워크플로 시퀀서 | 단계·스킬 경계·출력 템플릿. L76이 「루트 DESIGN.md 없음」으로 남아 있음 | 절차 문서로서 준수. 제품 사실 한 줄이 stale |

### 1.2 `DESIGN.md` 안에서 UI 디자인 시스템이 아닌 내용 (라인 단위)

목표 책임: 디자인 토큰 · 컴포넌트 시각 스펙 · 레이아웃 치수 · 시각 스타일 · 인터랙션 **시각** 상태. 아래는 그 밖이다.

#### 제품 목적 / 프로세스 / 권위 재서술

| 위치 | 내용 | 가야 할 곳 |
| --- | --- | --- |
| L561–567 | 플랫폼이지 화면 모음이 아니다, SKILL step 5 산출물, 06/07 범위 | `AGENTS.md` / `docs/06` §1. DESIGN은 한 줄 포인터만 |
| L615–623 | 운영자 과제(로그가 어디서 멈췄는지), collection→validation 체인 | 해당 화면이 제품이면 화면 스펙. 아니면 레퍼런스 부록 |
| L625–633 | 스크린샷 추출 P0/P1/P2 리뷰 채점 | `docs/reviews/` 성격의 결정/리뷰 로그 |
| L941–943 | §23 정렬 Resolved, 270/54 Resolved, 스크린샷 그룹 ≠ §9 | 결정 로그 → `docs/05`. 값은 YAML에 남김 |

#### 도메인 화면 · 메뉴 IA (docs/02 / 06 §9에 없는 레퍼런스 대시보드)

| 위치 | 내용 | 가야 할 곳 |
| --- | --- | --- |
| L569–575, L203–219 `layout.reference-dashboard` | KPI 5칸, 파이프라인 스테퍼, 도넛/게이지, 알림 목록, lifecycle 표, 설비 상태 표 | **시각 레퍼런스 부록**. 제품 IA가 아님 |
| L719–722, L939 | pipeline-status를 1차 focal region으로 두는 제품 판단 | 화면 스펙 또는 `docs/05` Candidate. 플랫폼 DS 기본값이 아님 |
| L763 | 사이드바 그룹: Equipment / Data Management / Processing Pipeline / Monitoring & Operations / Quality & Analytics / System | 06 §9 7그룹과 **불일치**. 스크린샷 이름을 레지스트리로 쓰지 말라는 Don't(L926)와 본문이 모순 |
| L776–777 | 알림 목록 상한, 전체 Alerts 화면으로 링크, SoR이 아님 | 제품 IA. `docs/07` L86은 알림 벨을 필수 영역에 넣지 않음 |
| L514–518 `donut-chart.seriesColors` | coverage / traceability / consistency | 스크린샷 도메인 지표. 플랫폼 토큰이 아님 |
| L527 `bar-chart.unit: defects` | Parser Defects 단위 | 도메인 |
| L528–560 `scheduler-panel`, `queue-status`, `lifecycle-cell`, `pipeline-stage-progress` | 스케줄러·큐·라이프사이클 시각 레시피 | 미등록 화면의 도메인 컴포넌트. 플랫폼 primitive 승격 전(06 §14) |
| L416 `date-range-segments.labels: [7D, 30D, 90D, Custom]` | 프리셋 제공 자체 | 시각 컨트롤 스펙은 유지 가능. **의미**(rolling vs 달력일)는 제품 Open (`docs/05`) |
| L461–466 `notification-count` | 알림 배지 시각 | 07이 비필수. 시각 레시피 ≠ 제품 요구 |

#### 데이터 계약 · URL · 권한 · 상태 택소노미 (docs/06 소유)

| 위치 | 내용 | 가야 할 곳 |
| --- | --- | --- |
| L36, L660–667 | §19 confirmed/unconfirmed를 색이 미러링. 배지 매핑 소유는 06/04 | 포인터는 유지. 매핑 규칙을 DESIGN이 해석하지 않는다는 문장은 맞음. 택소노미 본문은 06만 |
| L765 | top-bar가 Context display를 **owns** per §11 | 잘못됨. 시각만 소유. Context 규칙은 06 §11 |
| L808–813 | URL wall-clock `[from,to)`, 달력 포함→다음날 exclusive, 브라우저 now 금지, 프리셋 앵커 Open | 06 §6.3 재서술. 컨트롤 **생김새**만 남기고 물질화 규칙은 06 |
| L821 | 검색창 외관이 entity search(§10 Deferred)를 승인하지 않음 | 06 §10. Don't 한 줄 포인터로 충분 |
| L831–833 | Export 범위·권한·Context 변경 시 선택 해제 | 06 §15/§17 행동 계약 |
| L847–848 | 차트 클릭이 전역 Context를 조용히 바꾸지 않음 | 06 §24 Silent Drill-down |
| L880–887 | Context/Scope 변경 시 stale 숨김(§11), §19 상태 붕괴 금지 | 06 본문 |
| L900–902 | Breadcrumb 규칙, Context 보존 내비게이션 | 06 §4/§5, 07 |

#### 우선순위 · 미결 · 라이브러리 채택 (docs/05 / 04)

| 위치 | 내용 | 가야 할 곳 |
| --- | --- | --- |
| L929–934 | Dark mode / ECharts 테마 / 아이콘 / shadcn 바인딩 Open | Dark mode·아이콘·테마는 DESIGN Open으로 유지 가능. 라이브러리 채택은 `docs/04` + `docs/05` Candidate |
| L936–940 | P0.1 네 번째 도넛, P0.2 칩, P1.5/1.6, P1.8 focal, P2 breadcrumb/pulse | 리뷰 정정 → 부록. P1.8 focal은 제품 판단 → 05/화면 스펙 |
| L944 | 7D/30D/90D rolling vs 달력일 | `docs/05` Open (PLATFORM_REQUIREMENTS L178과 동일 항목) |
| L945 | 큐 분모·lifecycle 마커의 도메인 의미 | 도메인 정의 전 생산 사용 금지 — `docs/02` 또는 해당 화면 스펙 |
| L946 | 프로필/벌크 액션 인벤토리 | 06 권한 UX / 07 헤더. 스크린샷에서 발명 금지 |

YAML 프론트매터의 **색·타이포·radius·spacing·interaction·sidebar-shell 270px·top-bar 54px·table-density 32px** 는 디자인 시스템 본분이며 옮기지 않는다.

### 1.3 `docs/04` · `docs/06` · `DESIGN.md` 겹침 (UI 삼중 정의)

세 문서가 모두 “UI”라서 경계가 흐리다. 주제별 canonical은 아래가 현재 사실에 가깝다. 문제은 **같은 숫자를 세 곳에서 정의**하는 지점이다.

| 주제 | `docs/04` | `docs/06` | `DESIGN.md` | 지금 문제 |
| --- | --- | --- | --- | --- |
| 셸 치수 | 없음 | §7 L301–314 Decided 270/54, DESIGN canonical 명시. **그러나** L16은 §7을 아직 Candidate로 분류 | `sidebar-shell` L256–259 width 270px, `top-bar` L275–278 height 54px | 값은 정렬됨. 06 머리말 상태 태그가 stale. 06이 픽셀을 **재정의**하는 형태 |
| 테이블 밀도 | 없음 | §15 L630–638 Decided 32px, 25px compact 목표 | `table-density` L486–490 rowMinHeight 32px; L218–219 레퍼런스 25/26px | 값은 정렬됨. 정의 위치가 둘 |
| Radius / spacing / type | 없음 | §23 L910–941 `sm 4 / md 6 / lg 8`, 4px spacing, Page Title 24/32/600, KPI 30–36 등 **추상 스케일**. 시맨틱 변수명 `--background`… | YAML + prose가 **구체 hex·px**. L941이 §23과 Resolved로 정렬했다고 기록 | 스케일이 두 원본. 에이전트가 어느 쪽을 고칠지 모호 |
| 시맨틱 색 | 없음 | §23 `--success/--warning/--danger/--info` 이름만 | `#16a34a` 등 실제 값 + 배지 컴포넌트 | 이름은 06, 값은 DESIGN이어야 하는데 06이 스케일까지 적음 |
| Loading/Empty/Error | L68–79 원인 목록 + Skeleton/갱신중 UX | §19 L776–820 **authoritative** 택소노미 + `outcome`/`assessments[]` | L239–248, L863–887 시각 상태 바인딩 | 04가 택소노미를 다시 씀. 06이 규칙, DESIGN이 페인트여야 함 |
| 페이지 패턴 / Archetype | L50–66 CRUD·분석·카탈로그·VOC | §12 다섯 Archetype | 레퍼런스 대시보드 구성 L708–731 | 04 패턴은 06 Archetype의 도메인 예시. 세 번째 레이아웃이 DESIGN에 있음 |
| 차트 | L81–107 라이브러리 비교, 4층 상태, 주석 모델 | §16 Chart Frame + Toolbar + 4층 상태, ECharts를 04 candidate로 인용 | 도넛/바 인코딩, 시리즈 색, 클릭 규칙 | Frame/상태=06, 라이브러리=04, 페인트=DESIGN. 04 L105–107 주석 **저장 모델**은 데이터 계약 |
| 딥링크 / URL | L44–48 06에 위임. L48은 아직 「Open 결정 후 구현」 | §6 전부 Decided(메커니즘) | L808–813 기간 컨트롤이 URL 규칙을 재서술 | 04·DESIGN의 문장이 06보다 stale |
| KPI 상한 5–6 | L56 | 없음 | L705, L911 | 제품 규칙이 04와 DESIGN에만 있고 06에 없음 |
| 반응형 1440 / 1024 | 없음 | §25 | L724–731 동일 경계를 레이아웃 레시피로 재서술 | 정책=06, 그리드 붕괴 방법=DESIGN이면 충분 |
| 내비 IA | 06에 위임 | §9 7그룹 Decided | L763 스크린샷 6그룹을 §9와 같다고 기술 | DESIGN 본문이 06을 침범 |
| 제품 인상 | L111 셸=운영, 분석=BI, 차트=옵스, 마스터=CRUD | §2 동일 표 | Overview Key Characteristics | 세 번. 06 §2가 방향, DESIGN이 시각 번역이어야 함 |
| UI 라이브러리 | L17 shadcn + Base UI/Radix **Candidate** | §13 L534 「shadcn/ui + Base UI를 기반으로 한다」 | L934 바인딩은 Prototype 단계 Open | 06이 Candidate를 기정사실처럼 씀 |

`docs/06` §23은 DESIGN.md를 **직접 가리키지 않는다**. 교차 참조는 반대 방향이다: DESIGN.md L604, L671, L941이 §23에 맞춰 정렬했다고 쓰고, 06 §7/§15만 DESIGN 토큰명을 인용한다. 토큰 canonical이 DESIGN인데 스케일 원본은 06 §23으로 남아 있는 것이 핵심 모호성이다.

### 1.4 00–03, 05, 07 쪽 잘못된 배치

| 위치 | 무엇이 잘못 놓였는가 | 근거 |
| --- | --- | --- |
| `docs/00` L11–27 | 교차 리뷰 회의록·인용 정정이 개요를 잠식 | 목적/YAGNI는 00. 경위는 `docs/reviews/` |
| `docs/00` L23 | UTC 오류 정정을 「`04` 딥링크 절」로 안내 | 04 L44–48은 이미 06에 소유권을 넘김. 죽은 절 포인터 |
| `docs/01` L59 | 마스터 필드 원천 소유자를 「Phase 0에서」 구분 | Phase 표는 05 Deferred 가설 (`docs/05` L63–65) |
| `docs/02` L3–15 | Kernel 기능(레지스트리, 전역 필터, 딥링크, 위젯 프레임워크, 권한, Audit)을 기획 catalog가 재정의 | 상세는 06. 02는 「이런 공통 기능이 필요하다」목록 + 도메인 표만 |
| `docs/02` L9, L25–26 | Phase 1에 딥링크 고정, 공지 Phase 1–2, VOC Phase 2 | 구현 순서 → 05 Deferred 표. 02는 능력만 |
| `docs/03` L20–22 | 재현성 계약 본문 + 「상세는 `04`의 딥링크 절」 | 본문은 06 §6.1 (`딥링크는 조회조건·지표 버전만 재현`). 04에 그 절이 원본으로 없음 |
| `docs/03` L24–33 | 시간 계약 결정 목록(TZ, 변환 책임, `[from,to)`, 같은 날짜) | 원천 의미(wall-clock, TZ 없음)는 03이 맞음. URL/UI 메커니즘은 06 §6.3이 이미 Decided. 03이 Phase 0에서 전부 결정하라고 하면 06과 충돌 |
| `docs/03` L35–37 | 상태 근거 소유자 — 역할은 맞음. 프론트 표현을 04로만 안내 | 표시 규칙은 06 §19, 시각은 DESIGN, 원천 제약은 03 |
| `docs/04` L5–7, L111–114 | 06 제품 제약을 재서술하고 「최종 권장안」으로 다시 요약 | 04는 후보·리서치·바인딩. 권장 제품 규칙은 06 |
| `docs/04` L50–66 | 도메인별 UI 패턴 | 06 §12 Archetype의 예시이거나 02를 소비하는 화면 스펙. 04에 원본으로 두면 세 번째 IA |
| `docs/04` L96–107 | 차트 4층 상태 + 주석을 시간구간·occurrence 좌표로 저장 | 4층은 06 §6/§16. 주석 저장 모델은 플랫폼 데이터 계약(06 또는 01) |
| `docs/05` L49–61 | 실시간성·파서 DB·지연완료 **메커니즘 전문** | 05는 상태 표 + 포인터. 본문은 06/01/03. 지금은 05가 두 번째 원본 |
| `docs/06` L16 | 「화면 배치와 시각 토큰(§7, §23, §25, §31)은 Candidate」 | §7 Baseline은 L301에서 Decided. §31은 07 포인터일 뿐. 머리말이 본문보다 stale |
| `docs/06` L534 | Primitive를 shadcn+Base UI 기반으로 단정 | 04 L17 Candidate, DESIGN L934 Open |
| `docs/07` L18–45 | 7그룹 아래 전체 도메인 화면 트리 | 06 §9 + 02 catalog 복제. Candidate 예시로는 가능하나 「07이 메뉴 목록 원본」으로 읽힘 |
| `docs/07` L135–136 | URL 버전·우선순위·잘못된 값·시간 경계를 Open | 06 §6.3/§6.4 · 05 L12에서 메커니즘 Decided. 07 Open 표가 결정 인덱스를 배신 |
| `docs/07` 전체 | DESIGN.md를 한 번도 인용하지 않음 | 셸 시각 토큰의 소비자인데 링크가 없음 |
| `PLATFORM_REQUIREMENTS.md` L166 vs L25 | Open Q 1 「셸 치수·테이블 밀도 — 즉시 결정 필요」 | §0는 이미 체크 완료. 작업본이 자기 결정을 되돌림 |
| `SKILL.md` L76 | 「No product prototype or root DESIGN.md is checked in」 | `DESIGN.md` 946줄이 존재. 팔레트 추론 금지 안내가 반대로 작동 |
| `docs/INDEX.md` L17–38 | 문서 목록·소유권에 DESIGN.md 없음 | 2026-09-21 이후 시각 canonical이 카탈로그 밖 |

`docs/01`·`docs/02`의 도메인 사실(equipment_master, 가동률 제외, VOC 자체 모델)은 잘 배치되어 있다. 문제는 그 사실의 **반복**과 **Phase 언어**다.

---

## 2. 목표 문서 구조 제안

기존 원칙을 확장한다: **`docs/06` = 전역 행동/구조 계약**, **`docs/05` = 결정 상태 인덱스**, **파일명 `00`–`07`은 참조 안정성을 위해 유지** (`docs/05` L3). 새 번호 문서(`08_design_tokens.md` 등)를 만들어 DESIGN.md와 이중 원본을 만들지는 않는다. SKILL.md step 5가 이미 루트 `DESIGN.md`에 쓰라고 되어 있다.

값을 옮기더라도 **270px / 54px / 32px canonical은 `DESIGN.md` `sidebar-shell` / `top-bar` / `table-density`에 남긴다.** 06은 그 토큰을 인용만 한다(현재 §7/§15가 이미 그 방향으로 갱신됨).

### 2.1 목표 소유권 표 (INDEX에 넣을 문장)

| 문서 | 단일 책임 | 넣지 말 것 |
| --- | --- | --- |
| `AGENTS.md` | 에이전트 운영 요약. 상세는 문서 포인터 | 계약 본문, 토큰 값 |
| `docs/INDEX.md` | 카탈로그 + **소유권 표** + 역할 진입점 | 리뷰 경위, 요구 체크리스트 |
| `docs/00_overview.md` | 제품 목적, 범위, YAGNI 제외 | 교차 리뷰 회의록, 인용 정정 로그 |
| `docs/01_…` | 파서-플랫폼 데이터/아키텍처 계약 | 화면 패턴, Phase 일정 |
| `docs/02_…` | 도메인 capability catalog (6그룹) | Kernel 재정의, navigation IA, Phase 배치 |
| `docs/03_…` | 백엔드 스택 Candidate + 백엔드가 소유하는 원천 의미(wall-clock, statusSource) | URL 직렬화, 딥링크 절, 프론트 빈 화면 카피 |
| `docs/04_…` | 프론트 **구현 후보** + SaaS 리서치 + 라이브러리 비교 | 전역 계약 재정의, Archetype 원본, 주석 저장 스키마, 딥링크 원본 |
| `docs/05_…` | Decided/Candidate/Open/Deferred **인덱스** (한 줄 + 원본 포인터) | 메커니즘 전문, 픽셀 값, 체크박스 백로그 전체 |
| `docs/06_…` | Platform Kernel 행동 계약: Registry, Context/URL/Scope, Shell **Slot**, IA, Archetype, 승격 규칙, Data Trust, 권한 UX, 상태 택소노미 | hex/px 레시피, shadcn 채택, 레퍼런스 대시보드, 리뷰 로그 |
| `docs/07_…` | App Shell 화면 스펙/와이어프레임 (06을 소비) | 도메인 메뉴 원본, 이미 Decided인 항목을 Open으로 재선언, 토큰 재정의 |
| `DESIGN.md` | 시각 디자인 시스템: 토큰 YAML, 컴포넌트 시각 스펙, 밀도/치수, 인터랙션 페인트 | 제품 요구, 메뉴 IA, URL 규칙, 권한, 주석 모델, 결정 로그, 미등록 화면의 업무 의미 |
| `PLATFORM_REQUIREMENTS.md` | 구축 작업 체크리스트 (비권위). 05가 인덱싱 | 새 계약 원본. Open Q를 05와 다르게 유지 |
| `HANDOFF.md` | 휘발성 세션 노트 | 영구 계약 |
| 와이어프레임 `SKILL.md` | 설계 단계 시퀀서 | 제품 사실의 캐시 (DESIGN.md 존재 여부 등) |
| `docs/reviews/` | 인터뷰/그릴링/교차검증 합의록 | authoritative source (`INDEX` L34가 이미 이렇게 말함) |

### 2.2 이동 — 섹션 단위

**A. `DESIGN.md` → 남김 (DS)**

- YAML `colors` / `typography` / `rounded` / `spacing` / `interaction` / `motion`
- `components.sidebar-shell` (270px), `top-bar` (54px), `table-density` (32px) 및 범용 primitive(`button-*`, `data-table-*`, `status-badge-*`, `search-input`, `focus` 등)
- Colors / Typography / Layout(그리드·밀도) / Elevation / Shapes / 범용 Components / Shared interaction **시각** 표 / Do's and Don'ts 중 시각 규율
- Open: Dark mode, icon set, chart **theme** 매핑 (라이브러리 선택은 04로 포인터)

**B. `DESIGN.md` → 부록 또는 `docs/reviews/` (제품이 아님을 제목에 명시)**

- Overview의 스크린샷 재구성 (L569–575)
- `layout.reference-dashboard` (L207–219)
- Reference component bindings 중 pipeline / donut-chart 시리즈 / bar-chart defects / scheduler / queue / lifecycle (L835–861, YAML L495–545)
- P0–P2 리뷰 정정 (L625–633, L936–940)
- Sources 표는 DS 근거이므로 본문 유지. 스크린샷 경로·운영자 과제 문단은 부록

부록 제목 예: 「Reference dashboard visual recipe (non-IA)」. 06 §14 승격 전까지 플랫폼 primitive가 아니다.

**C. `DESIGN.md` → `docs/05` (결정/미결만 한 줄)**

- Date preset 7D/30D/90D 의미 (L944)
- Queue/lifecycle 도메인 의미 (L945)
- Profile/bulk 액션 인벤토리 (L946)
- P1.8 focal choice (L939)
- 「Sidebar/top-bar width — Resolved」 / 「Reference vs platform baseline — Resolved」 (L941–942) — 값은 YAML에 남고, 결정 한 줄은 05 L14에 이미 있음. DESIGN Open에서 결정 로그를 빼 중복을 줄임

**D. `DESIGN.md` → `docs/06` 포인터만 남김 (본문 삭제)**

- URL 물질화·달력 변환 (L808–813) → §6.3 인용
- Context 소유 문장 (L765) → 「top-bar는 Scope/검색 **시각**. 규칙은 §11」
- Silent drill-down, export 권한, stale 숨김, breadcrumb (L831–833, L847–848, L880–887, L900–902)
- L763 그룹명을 §9 표시명으로 교체하거나 「그룹 라벨은 레지스트리가 공급, 이 파일은 색/타이포만」

**E. `docs/06` → 얇게**

| 섹션 | 조치 |
| --- | --- |
| 머리말 L16 | §7 Baseline·§15 밀도를 Decided로 고침. §23은 「스케일 제약, 값의 canonical은 DESIGN.md」. §31은 소유권 포인터이지 Candidate 토큰이 아님 |
| §2 Product Design Direction | **유지**. 행동 원칙(Platform before Page 등)은 계약. 시각 인상 문장은 DESIGN Overview로 한 줄 위임 가능 |
| §7 픽셀 블록 L303–312 | 구조 ASCII·Slot 관계는 유지. 270/54 숫자는 「`DESIGN.md` `sidebar-shell`/`top-bar`」 인용만 (지금 L314와 중복 정의 해소). **숫자는 바꾸지 않음** |
| §13 L534 | 「Primitive 구현은 04 Candidate (shadcn/Base UI/Radix 비교)」로 강등 |
| §15 픽셀 L630–638 | 행동 계약(서버 정렬, 가상화, Platform vs Domain) 유지. 32px는 DESIGN `table-density` 인용 |
| §23 전체 | **제약만 남김**: 4px 기반, radius sm/md/lg = 4/6/8, weight ≤600, 컴포넌트는 Tailwind primitive를 의미로 쓰지 않음, shadow는 floating만. hex·type ramp 표는 「값은 DESIGN.md」. `--background` 이름 vs `colors.canvas` 매핑 표 한 개만 06 또는 DESIGN 한쪽에 |
| §25 | 정책 유지 (Desktop-first, 세 구간). 구체 그리드 붕괴는 DESIGN Layout이 소비 |
| §31 | 유지 (07 포인터) |

06을 여러 파일로 쪼개지 않는다. 1141줄의 대부분은 URL/시간/상태 계약이며 그건 한 Kernel 문서에 있는 편이 맞다.

**F. `docs/04` → 얇게**

| 섹션 | 조치 |
| --- | --- |
| L5–7 제품 제약 | 「06이 소유. 이 문서는 구현 후보」 3줄 |
| L11–23 스택 표 | **유지** (단일 책임) |
| L25–42 리서치 | **유지** |
| L44–48 소유권 | 유지하되 L46 「시간 의미와 Open」, L48 「Open 결정을 해결한 뒤」를 06 현재 Decided에 맞게 고침 (마이그레이션 1단계) |
| L50–66 페이지 패턴 | 06 §12 + 02로 이동/축소. 04에는 「Archetype 적용 메모」만 |
| L68–79 로딩 | 06 §19 포인터 + 「시각은 DESIGN interaction.*」 |
| L81–103 차트 라이브러리 비교 | **유지** (04 본분) |
| L96–103 4층 상태 | 06 §16 포인터. 04에서 재정의하지 않음 |
| L105–107 주석 저장 모델 | **06 또는 01로 이동** (데이터 계약). 04는 「편집 UI는 차트 라이브러리 POC 범위」 |
| L109–114 최종 권장안 | 삭제 또는 06 §2와 중복이니 포인터 |

**G. 기타 문서**

- `docs/00` L11–27 → `docs/reviews/2026-09-17-cross-model-review.md` (신설은 실행 단계에서). 00은 목적/범위/YAGNI/INDEX 링크만. L23 포인터는 06 §6.3으로
- `docs/02` L3–15 → 「상세 06」 불릿만 남기고 Kernel 규칙을 재서술하지 않음. Phase 문장 삭제 또는 05 포인터
- `docs/03` L20–22 → 06 §6.1 포인터로 교체 (04 딥링크 절 삭제)
- `docs/03` L24–33 → 「원천은 wall-clock, TZ 없음」만 03. 구간 경계·URL·defaultRangeTo는 06
- `docs/05` L49–61 메커니즘 전문 → 06/01/03 포인터 + 상태 한 줄. 본문 이관은 한 번에 하지 말고 포인터를 먼저 (마이그레이션 순서)
- `docs/07` §2 화면 트리 → 「06 §9 + 02를 소비하는 Candidate 예시」임을 유지하되 원본이 아님을 더 세게. §8 Open에서 이미 Decided인 URL/시간을 제거
- `docs/INDEX.md` — DESIGN.md를 「UI/UX — 시각 시스템」 행으로 추가. 소유권 문단에 `DESIGN.md` = 토큰/치수 canonical, `06` = 행동 계약 추가
- `PLATFORM_REQUIREMENTS.md` — 상단에 「비권위 작업 목록. 충돌 시 06/05/DESIGN」. Open Q1을 §0 완료에 맞게 삭제/각주. **06과 합치지 않음**
- `SKILL.md` L76 — DESIGN.md가 존재하고 시각 SoT임을 명시. 팔레트는 DESIGN에서 읽고, 없으면 만들지 말고 보고
- `AGENTS.md` — 문서 절에 DESIGN.md 한 줄 (시각 SoT). 계약 SoT는 계속 06

### 2.3 합치지 말 것 / 새로 쪼개지 말 것

- `docs/04`와 `docs/06`을 합치지 않는다. 후보 스택과 Kernel 계약은 독자가 다름.
- `DESIGN.md`를 `docs/06` §23으로 흡수하지 않는다. YAML 토큰 파일과 1141줄 행동 계약은 별개 책임.
- `PLATFORM_REQUIREMENTS.md`를 05에 붙여 넣지 않는다. 체크리스트 vs 결정 인덱스. 05가 「작업 목록은 PLATFORM_REQUIREMENTS, 권위는 06/DESIGN」이라고만 가리키면 된다.
- 새 `docs/08`을 만들지 않는다. 파일명 안정성 + SKILL.md 경로.
- `docs/07`을 06에 합치지 않는다. INDEX L38이 이미 소비 관계.

### 2.4 책임 경계 한 줄 (에이전트용)

> 픽셀·색·타입·컴포넌트 생김새 → `DESIGN.md`.  
> 메뉴가 지켜야 할 행동·URL·권한·상태 이름 → `docs/06`.  
> 그 결정이 Decided인지 → `docs/05`.  
> 라이브러리/프레임워크 후보는 → `docs/04` / `docs/03`.  
> 도메인에 무엇이 있는가 → `docs/02`.  
> 파서 데이터 의미 → `docs/01`.  
> 화면 배치 스케치 → `docs/07` 또는 해당 화면 스펙.

---

## 3. 깨질 수 있는 참조 목록

grep 기준. 이동 후 **반드시 고칠 곳**과 **건드려야 하는 상대 경로**를 구분한다. `.agents/reports/requirements-*.md`는 당시 스냅샷이므로 재작성하지 말고 「2026-09-20 시점, 치수 충돌은 09-21에 DESIGN canonical로 해소」주석만 고려한다.

### 3.1 `DESIGN.md` 토큰명·섹션을 밖으로 인용하는 곳

| 파일:라인 | 인용 | 이동 시 |
| --- | --- | --- |
| `docs/06` L301, L314 | `DESIGN.md` canonical, `sidebar-shell`/`top-bar` 270px/54px | 토큰이 DESIGN에 남으면 **유지**. YAML 키 이름만 바꾸면 여기도 |
| `docs/06` L630, L638 | `table-density`, 25px 레퍼런스 행 | 동일 |
| `docs/05` L14 | `DESIGN.md` `sidebar-shell`/`top-bar`/`table-density`, 06 §7/§15, `PLATFORM_REQUIREMENTS.md` §0 | 키 이름·섹션 번호 유지 필요 |
| `PLATFORM_REQUIREMENTS.md` L25–26, L32–33, L41 | DESIGN canonical, table-density, Open Decisions, §23 정렬 | §0는 결정 기록으로 유지. Open Decisions 항목이 05로 옮겨지면 포인터 갱신 |
| `HANDOFF.md` L8–9, L17 | 동일 결정 서술 | 휘발성. 다음 세션이 흡수 후 삭제 가능 (`HANDOFF.md` L3) |
| `DESIGN.md` 내부 `{colors.primary}`, `{component.sidebar-shell}` 등 | 다수 (YAML L256+, prose L589+) | 파일 내부. 키 리네임 시에만 |

`{colors.primary}` 문자열은 **DESIGN.md 밖에서 쓰이지 않는다** (grep). 밖의 인용은 파일명 + `sidebar-shell` / `top-bar` / `table-density` 키와 「270px/54px/32px」 설명이다.

### 3.2 `docs/06` §23 ↔ `DESIGN.md`

| 파일:라인 | 방향 | 비고 |
| --- | --- | --- |
| `DESIGN.md` L36 | 06 §19 | 상태 색 미러. 유지(포인터) |
| `DESIGN.md` L595 | 06 §§6, 9, 11, 18–19, 23–26 | Sources 표. §23가 제약만 남으면 「스케일 제약은 06 §23, 값은 이 파일」로 수정 |
| `DESIGN.md` L604, L671, L678–680, L941 | §23 스케일에 맞춘 기록 | §23 표를 지우면 이 Resolved 문단이 거짓이 됨. 06에 제약 스케일을 남기거나 Resolved를 05로 옮김 |
| `DESIGN.md` L660, L667, L909 | §19 | 유지 |
| `DESIGN.md` L703 | 07 collapse | 07은 collapse를 명시하지만 64px는 06 §7. 포인터 정확도 점검 |
| `DESIGN.md` L724 | §25 | 유지 |
| `DESIGN.md` L765, L808–813, L821 | §11, §6.3, §10 | 본문 이관 후 한 줄 포인터로 |
| `DESIGN.md` L838, L847 | §24 | 유지 가능 |
| `DESIGN.md` L942 | 「06/07이 픽셀을 고정하지 않는다」 | **이미 거짓** (06 §7 Decided). 마이그레이션 전에 고쳐야 하는 stale 참조 |
| `docs/06` §23 L910–963 | DESIGN을 **비인용** | 값을 DESIGN으로 모으면 이 섹션이 고아 원본이 됨. 반드시 「canonical: DESIGN.md」를 넣음 |
| `PLATFORM_REQUIREMENTS.md` L32 | 「06 §23 Candidate, DESIGN은 정렬」 | 06 §23를 제약으로 강등하면 문구 갱신 |
| `.agents/reports/requirements-*.md` | 다수 §23/DESIGN 이중 권위 | 역사 문서. 링크 깨짐보다 **치수 충돌 서술이 구버전** (omp L29, L33, L153–154는 240/56 vs 270/54, 행 40px vs 32px — 09-21에 해소됨) |

### 3.3 `PLATFORM_REQUIREMENTS.md` · `docs/05` · 와이어프레임 SKILL → DESIGN / 04 / 06

**PLATFORM_REQUIREMENTS.md**

| 라인 | 대상 | 갱신 |
| --- | --- | --- |
| L3 | `docs/00`~`07`, `DESIGN.md`, SKILL.md | INDEX가 DESIGN을 공식 등재하면 그대로 |
| L7–9 | `.agents/reports/requirements-*.md` **상대경로** | 이 파일이 `docs/`로 옮겨지면 깨짐. 루트 유지 권고 |
| L11 | 06 §29 | 유지 |
| L25–26 | DESIGN + 06 §7/§15 | 유지 (결정 기록) |
| L32–49 | 06 §23/§18/§26, DESIGN Open, 04 | Open 항목이 05로 모이면 여기 체크박스는 05 포인터 |
| L53 | 06 §9, 02 | 유지 |
| L80 | 00 YAGNI | 00이 리뷰 로그를 잃어도 YAGNI 절은 남김 |
| L86+ | 06 §22/§5/§6.1 등 | 06 섹션 번호 유지가 전제. 06을 쪼개지 않는 이유 |
| L146 | 01 | 유지 |
| L166 | Open Q1 셸 치수 | **지금 stale**. 이동 전이라도 수정 대상 |
| L178 | 디자인 바인딩 (다크모드, 아이콘, 프리미티브, ECharts, CJK, 프리셋) | DESIGN Open / 04 / 05와 삼중 |

**docs/05**

| 라인 | 대상 | 갱신 |
| --- | --- | --- |
| L3, L9–16 | 06, 04, 03, DESIGN, PLATFORM_REQUIREMENTS §0, reviews 그릴링 | 05가 인덱스로 남으면 유지. 메커니즘 본문(L49–61)을 06으로 옮기면 이 줄들이 원본이 됨 |
| L47 | 06 §6.3 | 유지 |
| L70 Phase 1 | 06 §6 | Deferred 표 안의 포인터. 06 섹션 안정성에 의존 |

**SKILL.md / wireframe-rules.md**

| 파일:라인 | 대상 | 갱신 |
| --- | --- | --- |
| `SKILL.md` L23, L25, L41, L45–46 | 프로젝트 `DESIGN.md` 생성/SoT | 경로 유지. 「create if it doesn't exist」는 이제 존재하므로 문구만 |
| `SKILL.md` L74 | 01 | 유지 |
| `SKILL.md` L75 | 06 Context/딥링크/확정·미확정 | 유지 |
| `SKILL.md` L76 | DESIGN.md 없음 | **필수 수정**. 미수정 시 이후 화면이 팔레트를 무시 |
| `SKILL.md` L77 | 06 IA, 07 소비 | INDEX와 동일. 유지. DESIGN 소비 한 줄 추가 권고 |
| `references/wireframe-rules.md` L21 | 06 §9, 02, 07 | 유지 |
| `references/wireframe-rules.md` L86–93 | DESIGN.md sourcing, 존재 시 SoT | 이미 올바름. SKILL L76과 **모순** — rules는 맞고 SKILL 각주가 틀림 |

**AGENTS.md** L9, L13, L15, L20 — 06/05/INDEX. DESIGN 미인용. 소유권 표 확장 시 한 줄 추가.

### 3.4 죽은 포인터 · stale 상태 (이동 전에 깨져 있음)

| 파일:라인 | 문제 |
| --- | --- |
| `docs/00` L23 | `04` 딥링크 절 — 04는 소유권을 06에 넘김 |
| `docs/03` L22 | 동일 |
| `docs/04` L46, L48 | §6 시간/URL을 Open으로 서술. 06/05는 메커니즘 Decided |
| `docs/06` L16 | §7 Candidate vs L301 Decided |
| `docs/07` L105 | 「§6.4의 Open 결정」 — 직렬화는 Decided, 필드명만 Candidate |
| `docs/07` L135–136 | URL/시간을 Open |
| `DESIGN.md` L942 | 06/07이 픽셀 미고정 |
| `PLATFORM_REQUIREMENTS.md` L166 | 셸 치수 「즉시 결정」 vs L25 완료 |
| `SKILL.md` L76 | DESIGN.md 없음 |

### 3.5 상대경로 링크 (파일 이동 시 깨짐)

지금 마크다운 링크는 거의 같은 디렉터리 파일명 또는 루트 기준이다.

| 링크 | 위치 | 위험 |
| --- | --- | --- |
| `[../.agents/README.md](../.agents/README.md)` | `docs/INDEX.md` L38 | INDEX가 루트로 올라가면 깨짐. INDEX는 `docs/`에 유지 |
| `[references/standard-log-lifecycle/README.md](references/standard-log-lifecycle/README.md)` | `docs/INDEX.md` L42 | 상대 `docs/references/…`. INDEX 유지 시 안전 |
| `[06_platform_ui_contract.md](../../06_platform_ui_contract.md)` 등 | `docs/references/standard-log-lifecycle/README.md` L26 | 06/07/02 파일명 변경 시 깨짐. **파일명 유지**로 회피 |
| `[requirements-*.md](.agents/reports/…)` | `PLATFORM_REQUIREMENTS.md` L7–9 | 루트 기준. 이 파일을 `docs/reviews/`로 옮기면 `../.agents/reports/…`로 고쳐야 함 |
| `docs/INDEX.md` 본문의 `` `00_overview.md` `` 등 백틱 | 하이퍼링크 아님 | 파일명 변경 시에만 검색 교체 |
| `CLAUDE.md` → `AGENTS.md` 심링크 | `AGENTS.md` L28 | 문서 구조와 무관 |

06 섹션 번호(§6, §7, §9, §15, §19, §23, §29)는 AGENTS, 02, 04, 05, 07, DESIGN, PLATFORM_REQUIREMENTS, SKILL, reviews 그릴링, INDEX에 퍼져 있다. **06을 장 단위로 쪼개거나 번호를 재매기면 최대 피해**. 이번 재구조화는 06 번호를 고정하는 것이 전제다.

### 3.6 06을 가리키지만 DESIGN을 가리켜야 하는 시각 항목

구현자가 「색/간격」을 06 §23에서 찾고 hex가 없어 Tailwind primitive로 새는 경로가 있다 (`PLATFORM_REQUIREMENTS.md` L32가 그 공백을 요구로 적음). 마이그레이션 후 INDEX 진입점에 「시각 → DESIGN.md」를 넣지 않으면 04/06만 읽는 프론트 경로가 계속 토큰을 놓친다.

현재 INDEX 플랫폼 행 (`INDEX` L12–14)은 06 → 04 → 02 / 07이며 DESIGN이 없다.

---

## 4. 단계별 마이그레이션 순서

한 커밋에 본문을 옮기지 않는다. 참조를 먼저 고정하고, 값은 복사-삭제하며, 마지막에 grep으로 닫는다. **어느 단계에서도 270/54/32를 재논의하지 않는다.**

### 0단계 — 소유권 선언만 (내용 이동 없음)

1. `docs/INDEX.md`에 §2.1 소유권 표를 넣는다. DESIGN.md 행, PLATFORM_REQUIREMENTS 비권위 표시.
2. `docs/06` 머리말 L7–16에 「시각 값 canonical = DESIGN.md, 이 문서는 행동 계약」을 한 블록으로 추가하고, L16 Candidate 목록에서 이미 Decided인 §7/§15를 뺀다.
3. `AGENTS.md` 문서 절에 DESIGN.md 한 줄.
4. 이 시점에서 본문 중복은 그대로. 이후 커밋의 충돌 해결 기준이 생긴다.

완료 조건: 새 에이전트가 INDEX만 읽고 「픽셀은 DESIGN, URL은 06, 상태는 05」를 말할 수 있다.

### 1단계 — 이미 깨진 포인터만 수정 (이동 없음)

순서 고정. 내용 이관보다 **거짓 안내를 먼저 죽인다.**

1. `SKILL.md` L76
2. `docs/00` L23, `docs/03` L22 → 06 §6.1/§6.3
3. `docs/04` L46–48 Open 문구 → 06 현재 Decided + 필드명 Candidate
4. `docs/07` §8에서 Decided URL/시간 행 제거, DESIGN.md 소비 한 줄
5. `DESIGN.md` L942 stale 「06이 픽셀 미고정」
6. `PLATFORM_REQUIREMENTS.md` L166 Open Q1

완료 조건: §3.4 표가 모두 사라진다. 본문 중복은 남아도 된다.

### 2단계 — canonical 인용 형태로 06 픽셀/토큰을 강등 (값 불변)

1. `docs/06` §7 픽셀 블록을 DESIGN 키 인용으로 바꾸고, ASCII 레이아웃은 유지.
2. `docs/06` §15 32px를 `table-density` 인용으로 통일 (지금 L630은 이미 그 방향).
3. `docs/06` §23를 제약 + 「값: DESIGN.md」로 축소. `--background` ↔ `colors.canvas` 매핑 표만 남긴다.
4. `DESIGN.md` L941 Resolved 문단을 05 포인터로 줄인다 (값은 YAML에 남음).

완료 조건: 픽셀/스케일의 **정의 문장**이 DESIGN YAML(+대응 prose) 한곳. 06은 인용. 숫자 동일.

### 3단계 — DESIGN.md에서 제품 Open/결정 로그를 05로

1. 05 표에 행 추가: 프리셋 의미, 큐/lifecycle 의미, 프로필 액션 인벤토리, dark mode 수요, 아이콘, CJK 폰트 (PLATFORM_REQUIREMENTS Open 8·14와 정렬).
2. DESIGN Open Decisions에서 위 항목을 「추적: docs/05」로 교체. 시각 Open(dark mode **설계 패스**, icon set, chart theme file)만 남김.
3. PLATFORM_REQUIREMENTS Open 목록을 「상세는 05」로 접지 않아도 된다. 단 05와 모순이면 05가 이긴다.

완료 조건: DESIGN Open이 시각 결정만 남는다.

### 4단계 — DESIGN.md 레퍼런스 대시보드를 부록으로 격리

1. 본문 Components는 범용 셸/표/배지/폼만.
2. pipeline / donut series / defects bar / scheduler / lifecycle / `layout.reference-dashboard`를 문서 하단 부록으로 이동. 제목에 non-IA, 06 §14 승격 전.
3. L763 그룹명을 삭제하거나 §9 표시명으로 교체.
4. Don't (L926)와 본문 모순 해소.

완료 조건: 새 메뉴 에이전트가 DESIGN 본문만 읽고 Processing Pipeline을 레지스트리에 넣지 않는다.

### 5단계 — 04에서 계약 본문 제거

1. 페이지 패턴 → 06 §12 포인터.
2. 로딩 택소노미 → 06 §19.
3. 차트 4층 → 06 §16.
4. 주석 저장 모델 → 06(플랫폼 도메인 객체) 또는 01. 04는 라이브러리 POC만.
5. 최종 권장안 → 06 §2 포인터.

스택 표와 리서치 표는 04에 남긴다.

### 6단계 — 00 리뷰 로그, 02/03 중복, 05 메커니즘 전문

이 단계는 의존이 04/06 경계가 안정된 다음.

1. 00 L11–27을 `docs/reviews/`로. 00은 목적/YAGNI.
2. 02 Kernel 불릿을 한 줄 포인터로.
3. 03 재현성/시간 본문을 원천 의미만 남김.
4. 05 L49–61 전문을 「원본 06/01/03, 여기는 Decided 한 줄」로. **먼저 포인터를 넣고 다음 커밋에서 본문 삭제** (그릴링 리뷰 `docs/reviews/2026-09-18-…`가 05를 원본처럼 인용하므로 삭제 전 그 문서 머리말 L7과 대조).

### 7단계 — 참조 일괄 갱신

`rg` 쿼리 최소셋:

```text
DESIGN\.md
sidebar-shell|table-density|top-bar
docs/06 §23|06_platform_ui_contract.md §23
04_frontend_ui_ux.md.*딥링크
No product prototype or root DESIGN.md
neither `docs/06_platform_ui_contract.md` nor `docs/07
즉시 결정해야 하는 문서 충돌
```

고칠 파일 우선순위: INDEX, AGENTS.md, SKILL.md, 06 머리말/§23, 04 소유권, 05 표, 07 §8, PLATFORM_REQUIREMENTS Open, DESIGN 부록 헤더, `docs/references/standard-log-lifecycle/README.md`(파일명 안 바꾸면 손대지 않아도 됨).

`requirements-*.md`는 날짜가 박힌 산출물이므로 본문 재작성하지 않는다.

### 8단계 — 검증

- INDEX 역할 표: 플랫폼/프론트에 DESIGN.md가 있는가.
- 06 L16 상태 태그가 본문 Decided와 일치하는가.
- 07 Open 표에 06 Decided가 재등장하지 않는가.
- DESIGN 본문에 §9와 다른 그룹명이 없는가.
- 270/54/32가 DESIGN YAML과 05 L14과 06 인용이 같은가.
- SKILL.md가 DESIGN.md를 존재하는 SoT로 가리키는가.

### 하지 말 것 (이 순서 전체)

- 06 섹션 번호 재부여, 04+06 병합, DESIGN을 docs/로 옮기기 (SKILL·루트 관례·기존 grep 비용).
- PLATFORM_REQUIREMENTS를 계약으로 승격.
- 레퍼런스 대시보드 컴포넌트를 06 Platform Component 목록에 승격 (Premature Platformization, 06 §24).
- 셸 치수/테이블 밀도를 06 숫자로 되돌리거나 재Open.

---

## 부록 — 읽은 파일과 의도적으로 안 고친 것

읽음: `docs/INDEX.md`, `docs/00`–`07`, `DESIGN.md` (YAML L1–557 + prose L559–946), `PLATFORM_REQUIREMENTS.md`, `HANDOFF.md`, `AGENTS.md`, `CLAUDE.md`(심링크), `.agents/skills/analysis-platform-wireframe/SKILL.md`, `references/wireframe-rules.md` 해당 절, `.agents/README.md` 머리, `README.md`. 교차 검색에 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md`, `.agents/reports/requirements-*.md`, `docs/references/standard-log-lifecycle/README.md`가 걸렸다.

이 감사는 제안만 한다. 위 파일은 수정하지 않았다.
)
