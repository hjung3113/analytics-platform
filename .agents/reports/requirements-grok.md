# 분석 플랫폼 구축 요구사항 / 체크리스트

작성 관점: **Grok 4.6 · Platform Kernel 우선** — 개별 메뉴 완성보다 App Shell · Menu Registry · 전역 Context · 딥링크/URL · 권한/Scope · Audit · Data Trust 계약을 먼저 검증한다. 본 문서는 구현 지시가 아니라 구축 시 필요한 요구의 목록이며, 기존 `docs/*.md` · `DESIGN.md` · `.agents/**`는 읽기만 했다.

읽는 법:

- **Must** — Kernel 또는 첫 Consumer 메뉴가 계약을 깨지 않고 동작하려면 필요.
- **Should** — 두 번째·세 번째 메뉴가 붙을 때 재작업 비용이 커지는 것.
- **Nice** — 있으면 운영/개발이 편하지만 없어도 Kernel 계약은 성립.
- **출처** — `Decided` / `Candidate` / `Deferred` / `Open`은 원문 상태를 그대로 옮긴다. 문서에 없는 항목만 **신규 제안**.
- **명시적 비범위**는 `docs/00_overview.md` YAGNI를 재제안하지 않기 위해 따로 적는다.

관련 권위 문서: `docs/06_platform_ui_contract.md`(전역 UX 계약), `docs/07_app_shell_wireframe.md`(셸 화면), `docs/02_domain_menus.md`(도메인 catalog), `docs/05_roadmap_and_open_questions.md`(결정 상태), `DESIGN.md`(시각 토큰). Phase 0~4 표는 Deferred 가설이며 일정 승인이 아니다.

---

## 0. 명시적 비범위 (YAGNI — 재제안하지 않음)

아래는 `docs/00_overview.md`가 1차 리뷰 공통으로 제외한 것이다. Must로 올리지 않는다. 규제·수요가 확인되면 플랫폼 결정으로 격상한다.

- [ ] 승인 워크플로 UI — 감사+버전 관리로 대체. **우선순위:** 비범위. **출처:** Decided 제외 `docs/00` YAGNI; 지표 초안/발행/폐기는 상태 필드로 `docs/04`에 별도 존재.
- [ ] 다국어 UI — 문자열 외부화만 저비용 준비. **우선순위:** 비범위(외부화는 §6 Nice). **출처:** Decided 제외 `docs/00`.
- [ ] 범용 알림/알람 룰 엔진 — 공정 이상 탐지 엔진은 지표·임계값 검증 후. **우선순위:** 비범위. **출처:** Decided 제외 `docs/00`. 운영 알림(적재 중단·집계 실패)은 예외적으로 §2·§4에 최소형으로만 다룬다.
- [ ] 외부 BI 연동 — mart/view를 SQL 질의 가능하게 문서화하면 나중에 붙인다. **우선순위:** 비범위. **출처:** Decided 제외 `docs/00`; Phase 4 가설 `docs/05`.
- [ ] 스케줄 리포트 빌더 — 예약 배포 리포트. **우선순위:** 비범위. **출처:** Decided 제외 `docs/00`.
- [ ] 자유 SQL/코드 지표 DSL — 감사 불가·주입 위험. 제약 표현식/AST부터. **우선순위:** 비범위. **출처:** Decided 제외 `docs/00`.
- [ ] 외부 설치형 플러그인 SDK · 자유 배치 위젯 엔진 · 저코드 대시보드 빌더 — 메뉴 2~3개 반복 확인 전 금지. **우선순위:** 비범위(현 단계). **출처:** Deferred `docs/06` §14/§24 Premature Platformization, `docs/05` Phase 4.
- [ ] SEMI E10형 가동률·수율 메뉴 — 설비 상태 이력·외부 라벨이 전제되며 파서 데이터만으로 불가. **우선순위:** 비범위. **출처:** Decided 범위 한정 `docs/00` 리뷰 반영, `docs/02` 생산성 분석.
- [ ] 전역 알림 벨·통합 미확인 배지를 셸 필수 영역으로 배치 — 필수 아님. **우선순위:** 비범위(셸 필수). **출처:** Open·비필수 `docs/07` §4/§8; `DESIGN.md`의 `notification-count`는 시각 레시피일 뿐 제품 요구가 아님.

---

## 1. 디자인 요소

시각 계약의 권위는 이중이다. **의미·상태·접근성**은 `docs/06`이 이기고, **색·면·밀도 레시피**는 `DESIGN.md`가 이긴다. 둘이 충돌하면 계약을 격상해 해결한다(아래 긴장 항목).

- [ ] **토큰 3층(primitive → semantic → component)을 CSS 변수로 물질화** — 컴포넌트가 Tailwind primitive 색을 직접 의미로 쓰지 못하게 해야 메뉴가 늘어도 상태가 흔들리지 않는다. **우선순위:** Must. **출처:** Candidate `docs/06` §23; `DESIGN.md` Colors/Components가 개념적으로 대응. 실제 CSS/Tailwind theme 바인딩은 미작성.
- [ ] **Radius/Spacing/Typography를 §23 스케일에 고정** — `sm 4 / md 6 / lg 8`, 4px spacing, Page Title 24/32/600 등. 화면마다 roundness·타입 스케일을 다시 고르지 않는다. **우선순위:** Must. **출처:** Candidate `docs/06` §23; `DESIGN.md` Open Decisions에서 §23과 **Resolved**로 정렬됨.
- [ ] **Light-canvas + 고정 다크 사이드바 극성** — 콘텐츠는 밝은 캔버스, 내비만 의도적 반전. 콘텐츠 카드를 다크 서프로 재사용하지 않는다. **우선순위:** Must(현재 시각 방향). **출처:** Candidate `DESIGN.md` Overview/Surfaces; Desktop-first는 Decided `docs/06` §7/§25.
- [ ] **다크모드 설계 패스** — 사이드바가 이미 다크라 단순 invert는 충돌한다. 요청 전까지 기본 제품에 넣지 않는다. **우선순위:** Nice(지금은 설계하지 않음). **출처:** Open `DESIGN.md` Open Decisions 「Dark mode: not designed」.
- [ ] **상태 배지 4종 + §19 매핑 표** — success/warning/danger/neutral만 쓰고, `empty`/`forbidden`/`unknown`/미수집 등을 화면이 임의 색으로 해석하지 않게 **outcome·assessment → 배지** 표를 하나 둔다. **우선순위:** Must. **출처:** Candidate `DESIGN.md` Status & Badges(팔레트); Decided 상태 어휘 `docs/06` §19. **매핑 표 자체는 문서에 없음 → 신규 제안(공백 메움).**
- [ ] **Data Trust 표시 표준(Updated / Data through / Coverage / Metric version / Provisional)** — 숫자만큼 숫자의 상태를 같은 vocabulary로 보여야 분석이 재현된다. **우선순위:** Must. **출처:** Decided `docs/06` §18, Kernel 책임 `docs/06` §4.
- [ ] **로딩·빈·오류 taxonomy를 한 Empty로 합치지 않기** — 0건 ≠ 미수집 ≠ 권한없음 ≠ 파서 지연. 근거 서비스가 없으면 Unknown. **우선순위:** Must. **출처:** Decided `docs/06` §19, `docs/03` 근거 소유자, `docs/04` 권장 동작.
- [ ] **인터랙션 상태 계약(hover/pressed/selected/focus/disabled/busy)** — 정적 카드에 가짜 hover를 주지 않고, Context 변경 중 이전 결과를 새 조건처럼 보여주지 않는다. **우선순위:** Must. **출처:** Candidate `DESIGN.md` Shared interaction; Decided 이전 결과 차단 `docs/06` §11.
- [ ] **모션: 120ms 상태 전환 + reduced-motion 0ms** — live pulse는 원천이 live freshness를 확인한 위젯에만, Candidate. 폴링 기본 정책과 “Live” 배지를 혼동하지 않는다. **우선순위:** Should(전환), Nice(pulse). **출처:** Candidate `DESIGN.md` motion; 실시간성은 Decided 폴링 `docs/05` §실시간성.
- [ ] **차트 라이브러리 후보 Apache ECharts + Chart Frame 계약** — 플랫폼은 차트 비즈니스 정의가 아니라 Frame·Toolbar(Zoom/Brush/Reset/Compare/Annotate/Export)·4층 상태를 소유한다. **우선순위:** Must(Frame/상태 분리), Should(라이브러리 확정은 POC 후). **출처:** Decided Frame `docs/06` §16; Candidate 라이브러리 `docs/04`; ECharts theme 매핑은 Open `DESIGN.md`.
- [ ] **ECharts(또는 채택 라이브러리) 테마를 토큰에 바인딩** — `chart-blue/teal/green/purple/remainder/grid`를 라이브러리 theme로 내려야 메뉴마다 시리즈 색이 갈라지지 않는다. **우선순위:** Should. **출처:** Open `DESIGN.md` 「Chart library token mapping」; 팔레트 자체는 Candidate `DESIGN.md` colors.
- [ ] **차트 접근성: 제목/단위/텍스트 요약 + 동일 데이터 표 + 키보드 구간 선택 + 색 외 선/아이콘** — Canvas 차트만으로 판단을 닫지 않는다. **우선순위:** Must. **출처:** Decided `docs/06` §26, `docs/04` 차트 절.
- [ ] **장식 시각화 금지(Gauge/Gradient/3D)** — 판단에 기여하지 않는 게이지는 쓰지 않는다. `DESIGN.md`의 donut은 coverage 등 **분모가 있는 비율**에만 쓰고, 장식 게이지로 확대하지 않는다. **우선순위:** Must. **출처:** Decided `docs/06` §24 Decorative Visualization; donut 바인딩은 Candidate `DESIGN.md` Charts. **긴장:** 레퍼런스 대시보드의 donut/gauge vocabulary vs §24 금지 — 구현 전 사용 허용 범위를 한 문장으로 확정할 것(Open).
- [ ] **아이콘 세트 단일화** — rounded-outline 한 패밀리, decorative는 숨기고 icon-only는 accessible name. 라이브러리(Lucide 등)는 미정. **우선순위:** Should. **출처:** Candidate `DESIGN.md` Open Decisions 「Icon set」; 접근성 라벨은 Decided `docs/06` §26.
- [ ] **컴포넌트 라이브러리 바인딩(shadcn/ui + Base UI/Radix)** — 토큰 이름은 디자인 의도이지 컴포넌트 props가 아니다. Prototype 단계에서 매핑한다. **우선순위:** Should(구현 착수 시 Must). **출처:** Candidate `docs/06` §13, `docs/04` 스택; Open `DESIGN.md` 「Component library binding」.
- [ ] **테이블 시각/밀도 계약** — 숫자 우측 정렬·`tabular-nums`, 플랫폼 테이블 interaction은 Kernel, 컬럼 의미는 Domain. **우선순위:** Must. **출처:** Decided 책임 경계 `docs/06` §15; 밀도 수치는 Candidate(`docs/06` row 40px vs `DESIGN.md` table-density 32px / 레퍼런스 25px — **미정렬, Open**).
- [ ] **셸 치수 단일 소스** — 사이드바/탑바 숫자를 문서마다 다시 쓰지 않는다. **우선순위:** Should. **출처:** Candidate `docs/06` §7 Baseline(expanded 240 / header 56) vs Resolved `DESIGN.md`(270 / 54, 스크린샷 실측). **계약 충돌은 아님(§7은 권장 Baseline)이나 구현 기본값을 하나로 고를 것.**
- [ ] **KPI 타일 상한 5~6** — KPI 행이 지표 화면을 대체하지 않게 한다. **우선순위:** Should. **출처:** Candidate `DESIGN.md` Do, `docs/04` 생산성 분석 「KPI 카드 수 제한」.
- [ ] **포커스 링·명암비 검증 게이트** — 본문 4.5:1, 의미 있는 컨트롤/포커스 3:1. faint 텍스트는 필수 라벨에 쓰지 않는다. **우선순위:** Must. **출처:** Decided 원칙 `docs/06` §26; 수치 검증은 Candidate `DESIGN.md` (렌더 전 미검증).
- [ ] **반응형: ≥1440 full / 1024–1439 collapse / <1024 조회·간단관리** — 복잡한 Analysis Workspace를 억지 모바일화하지 않는다. **우선순위:** Must(정책), Nice(실제 모바일 구현). **출처:** Decided Desktop-first + Candidate 구간 `docs/06` §25, `DESIGN.md` Layout.
- [ ] **한국어/CJK 타이포** — Inter 단일 패밀리는 라틴 기준이다. 한글 폴백(시스템 고딕 등), 줄높이·테이블 행 증가, 숫자/ID 혼용을 토큰에 명시해야 그리드가 깨지지 않는다. **우선순위:** Should. **출처:** 신규 제안. `DESIGN.md`는 localization이 행높이를 키울 수 있다고만 언급; `docs/04` 확인 한계에 CJK 그리드 POC 필요.
- [ ] **z-index / 오버레이 스택** — Dropdown/Popover/Drawer/Modal/Command Palette/Toast가 서로 가리지 않게 층 계약을 둔다. **우선순위:** Should. **출처:** 신규 제안. `DESIGN.md` dropdown `zIndex: 40`만 있고 전역 스택은 없음. Kernel이 Toast/Modal을 소유(`docs/06` §4).
- [ ] **기간 프리셋(7D/30D/90D) 의미** — rolling wall-clock vs 달력일, 앵커, 당일 포함 여부를 고른 뒤 §6.3 half-open URL로 물질화한다. 브라우저 now로 기본 구간을 만들지 않는다. **우선순위:** Must(프리셋을 제공할 경우). **출처:** Open `DESIGN.md` Date preset meaning; Decided 물질화 시계 `docs/06` §6.3 `defaultRangeTo`.
- [ ] **Shadow 대신 Hairline** — floating surface(Popover/Drawer/Modal) 외 그림자를 쌓지 않는다. **우선순위:** Should. **출처:** Candidate `docs/06` §23, `DESIGN.md` Elevation. (두 문서 표현은 대체로 일치; floating 예외는 §23.)
- [ ] **프린트/PDF 스타일** — 분석 화면 인쇄·첨부 수요는 문서에 없다. CSV 내보내기가 1차 증거 경로다. **우선순위:** Nice. **출처:** 신규 제안. 내보내기 자체는 Candidate/가설 `docs/05` Phase 2 CSV.

---

## 2. 메뉴 카탈로그

내비게이션 IA의 단일 기준은 `docs/06` §9의 **7그룹**이다. `docs/02`의 6개 도메인과 개수를 맞추지 않는다. 하위 화면은 `docs/07` Candidate 예시이며 구현 승인이 아니다.

### 2.1 이미 catalog된 그룹·화면

- [ ] **운영 개요 → 플랫폼 현황** — 즐겨찾기/최근방문/내 메뉴 바로가기 랜딩. 수집 성공률·파서 지연 KPI는 근거 서비스 없이 노출 금지. **우선순위:** Must(랜딩 그룹). **출처:** Decided 그룹 `docs/06` §9; Candidate 하위 `docs/07` §2; 수집 위젯 Deferred `docs/07` §2/§8.
- [ ] **설비관리 → 설비 마스터 목록/상세** — `equipment_id` 단일 조인, 유효구간 이력, 사용중지=물리삭제가 아님, 속성 타임라인+Audit 탭. **우선순위:** Must(첫 Consumer). **출처:** Decided capability `docs/02`; Candidate 화면 `docs/07` §2; 필드 원천 소유는 Open/Phase0 `docs/01`.
- [ ] **기준정보관리 → 공정/레시피/자재 등 엔티티별 목록·상세** — 외부 MES 관리 vs 플랫폼 직접관리를 필드별로 나눈다. **우선순위:** Must. **출처:** Decided `docs/02`; Candidate `docs/07` §2.
- [ ] **생산성 분석 → 개요(물리 점유율/비Process 체류/사이클타임 P50·P95/Job 처리량)** — 파서만으로 계산 가능한 범위로 이름을 맞춘다. **우선순위:** Must(대표 분석 Consumer). **출처:** Decided 범위 `docs/02`; Candidate 화면 `docs/07` §2; 검증 시나리오 Candidate `docs/05`.
- [ ] **생산성 분석 → 사이클타임 상세 → 느린 실행 → occurrence 상세(공정 타임라인+품질)** — 요약→증거→원본 grain까지 한 흐름으로 계약을 검증한다. **우선순위:** Must(검증 경로). **출처:** Candidate `docs/07` §2, `docs/05` 대표 시나리오; Context Link 예 `docs/06` §22.
- [ ] **생산성 분석 → Wafer Journey 이송 분포** — 설비·Lot Context를 들고 이동하는 두 번째 분석 화면 후보. **우선순위:** Should. **출처:** Decided capability `docs/02`; Candidate `docs/07` §2.
- [ ] **지표관리 → 카탈로그/상세(grain·분자분모·버전·발행·사용처·diff)** — 계산식 저장소가 아니라 카탈로그. 대시보드는 게시 시점 버전을 고정한다. **우선순위:** Must(거버넌스). **출처:** Decided `docs/02`; UI 패턴 Candidate `docs/04`; Catalog archetype `docs/06` §12.4.
- [ ] **공지 → 목록/상세 + 로그인 배너** — 대상 메뉴·권한 스코프 타게팅은 레지스트리+권한 모델 이후. 별도 알림 엔진 없음. **우선순위:** Should(배너는 셸 이후). **출처:** Decided `docs/02`; 배너 위치 Open `docs/07` §8.
- [ ] **VOC → 큐/상세(접수→처리중→완료, 담당, 댓글, 관련 Context)** — Audit이 VOC 도메인을 대체하지 않는다. VOC 열람이 분석 권한을 부여하지 않는다. **우선순위:** Should(인증·사용자 모델 전제). **출처:** Decided `docs/02`; Workflow archetype `docs/06` §12.5; UI `docs/04`.
- [ ] **관리·감사 → 권한/역할(메뉴×데이터 스코프)** — 메뉴 숨김만이 아니라 조회·내보내기·링크에도 동일 규칙. **우선순위:** Must. **출처:** Decided 그룹 `docs/06` §9, 권한 UX `docs/06` §17; Candidate 화면 `docs/07` §2.
- [ ] **관리·감사 → 전역 Audit Trail 뷰어** — 마스터/기준정보/지표 정의의 who/when/before-after. 유효기간 이력과 별개. 상세 화면 탭과 전역 뷰를 공유 모델로. **우선순위:** Must. **출처:** Decided 기능 `docs/02` 코어; Candidate 화면 `docs/07` §2; Platform component 예 `AuditTimeline` `docs/06` §13.

### 2.2 레퍼런스 Candidate (플랫폼 계약을 대체하지 않음)

- [ ] **모델 표준 로그(설비관리 하위)** — 독립 제품의 Model/Validate/Defect/Spec/Report를 최상위 그룹으로 복사하지 않고 로컬 탭으로 수용. **우선순위:** Nice/수요 확인 후. **출처:** Candidate `docs/references/standard-log-lifecycle/README.md` §2. 기존 7그룹을 깨지 말 것.
- [ ] **설비 진행 간트(생산성 분석 하위)** — occurrence 구간을 시간축에 올리는 화면 시안. 실시간 센서 전제를 가져오지 않는다. **우선순위:** Nice. **출처:** Candidate 동 레퍼런스 §2/§3.

### 2.3 신규 제안 메뉴 (7그룹 안에 수용)

새 최상위 그룹을 만들지 않는다. Premature Platformization을 피하고, 반복이 확인되기 전에는 화면이 아니라 **운영 과업**으로 적는다.

- [ ] **사용자/조직 디렉터리(관리·감사)** — VOC 담당 배정·감사 주체·권한 부여의 전제. 인증만으로는 조직 모델이 생기지 않는다. **우선순위:** Must. **출처:** 도메인 전제는 Decided `docs/02` VOC 「플랫폼 메타 DB의 사용자/조직 모델」; **전용 화면은 catalog 없음 → 신규 제안.**
- [ ] **운영 이벤트 뷰어(적재 중단·mart 실패·워커 중단)** — 범용 룰 엔진이 아니라 플랫폼 운영 사건 목록. Overview에 근거 없는 “수집 상태 위젯”을 올리는 대신, 원천이 확인한 사건만 보여 준다. **우선순위:** Should. **출처:** 방향은 `docs/00`(운영 알림부터); 수집 대시보드 Deferred `docs/07`. **화면은 신규 제안.**
- [ ] **지연완료·정정/backfill 후보 목록(관리·감사 또는 운영 개요)** — 창 밖 지연완료를 버리지도 자동 재개방하지도 않고 식별·조회 가능하게 둔다는 정책의 UI Consumer. 새 승인 워크플로는 만들지 않고 기존 권한·감사를 쓴다. **우선순위:** Should. **출처:** Decided 메커니즘 `docs/05` §지연 완료; **전용 화면은 없음 → 신규 제안.**
- [ ] **시간역(timeDomain) 매핑 관리** — 복수 설비 병합 가드의 assertion `(equipmentId, timeDomainId, validFrom, validTo)`을 사람이 조회·수정할 곳이 없다. TZ 실제 값은 Open이지만 모델 화면은 병합 분석을 여는 전제다. **우선순위:** Should(복수 설비 병합을 제공할 때 Must). **출처:** Decided assertion 계약 `docs/06` §6.3; TZ 값은 Open `docs/05`. **관리 UI는 신규 제안.**
- [ ] **설비그룹 / `module_class_map` 관리** — 재분류가 mart 재계산 트리거다. 기준정보 또는 설비관리 하위에 둔다. **우선순위:** Should. **출처:** 트리거 Decided `docs/01` mart 재계산; **화면은 신규 제안.**
- [ ] **마스터 필드 원천 소유권 설정** — 외부 import와 플랫폼 수정이 같은 필드를 덮어쓰지 않게, 필드별 source-of-truth를 보여 주고 잠근다. **우선순위:** Must(정책), Should(전용 UI). **출처:** 요구 Decided `docs/01` 마스터 원천; **관리 화면은 신규 제안.**
- [ ] **메뉴 활용률(관리·감사)** — 누가 어떤 메뉴·저장된 조회·내보내기를 얼마나 쓰는지. 권한 설계·온보딩·Premature 메뉴 정리의 근거가 된다. 분석 숫자와 같은 Data Trust를 요구하지 말고, 플랫폼 메타 감사로 취급한다. **우선순위:** Should. **출처:** 신규 제안. Kernel 이벤트(메뉴 진입, Context 적용, export)를 전제로 함.
- [ ] **비동기 작업 모니터(내보내기·재집계)** — 긴 계산/대규모 CSV는 별도 프로세스(`docs/03`). 사용자가 작업 상태·취소·권한 재검증을 볼 화면이 없다. **우선순위:** Should. **출처:** 백엔드 역할 Decided `docs/03`; **UI는 신규 제안.**
- [ ] **주석 목록/검색** — 영속 주석은 도메인 객체(작성자·구간·대상 occurrence·권한·Audit). 차트 위 편집기와 별개로 조회·딥링크가 필요하다. **우선순위:** Nice(최소 영역 주석 이후). **출처:** 모델 방향 Decided `docs/04` 주석 저장; 고급 편집기 Deferred `docs/06` §14. **카탈로그 화면은 신규 제안.**
- [ ] **지표 리니지/사용처 뷰** — “이 숫자는 어떤 정의·mart 세대·원천 뷰에서 왔는가”. 지표 상세의 Usage와 Data Trust lineage entry를 한 화면으로 묶는다. **우선순위:** Should. **출처:** 개념 Decided `docs/06` §18 lineage entry, `docs/07` 지표 상세 「사용 중인 대시보드」; **독립 화면 범위는 신규 제안.**
- [ ] **Unmapped/커버리지 모니터** — occurrence 조인 실패·미매핑을 숨긴 채 점유율을 보여 주면 Data Trust가 거짓이 된다. **우선순위:** Should. **출처:** 원칙은 `docs/00`이 파서 `docs/23` Unmapped를 authoritative 입력으로 채택; **전용 화면은 신규 제안.**
- [ ] **내 계정/세션(프로필 메뉴)** — 표시명, 접근 가능 Scope 목록, 로그아웃, 키보드 도움말. 스크린샷에서 액션을 발명하지 말라는 `DESIGN.md` 제약 준수. **우선순위:** Should. **출처:** Candidate 셸 헤더 `docs/07` 사용자 메뉴; 액션 인벤토리 Open `DESIGN.md`. **최소 항목은 신규 제안.**
- [ ] **도움말/계약 변경 공지** — URL `v` sunset, 지표 버전 폐기, 시간 계약 변경은 별도 공지 정책. 제품 Help 슬롯은 셸 Candidate. **우선순위:** Nice. **출처:** `v` sunset은 결정 밖 `docs/06` §6.4; Help는 Candidate `docs/06` §7.
- [ ] **비교 전용 메뉴를 새로 만들지 않고 Compare를 Analysis Workspace 능력으로** — Toolbar vocabulary에 Compare가 있다. 별도 최상위 “비교 메뉴”는 중복이다. **우선순위:** Should(능력), Nice 아님(새 그룹). **출처:** Decided toolbar `docs/06` §16; 별도 메뉴 금지에 가까운 **신규 가드레일 제안.**

---

## 3. 메뉴 간 연결

핵심 가치는 메뉴 수가 아니라 **문맥과 함께 이동**하는 것이다(`docs/06` §22). 각 메뉴가 서로의 URL 문자열을 조립하지 않는다.

- [ ] **Platform Context Link helper** — destination · transferable context · unsupported context · permission을 공통 처리. 메뉴가 쿼리스트링을 손대지 않는다. **우선순위:** Must. **출처:** Decided `docs/06` §22, §6.4 셸 전환도 동일 규칙.
- [ ] **목적지 객체 ID와 분석 Context 분리** — occurrence 키 `(equipmentId, entityType, anchor)` vs `vocId` / `equipment_id` / `metricId+metricVersion`. 도메인 객체에 occurrence 키를 강제하지 않는다. **우선순위:** Must. **출처:** Decided `docs/06` §6.1.
- [ ] **공개 필드 camelCase, DB snake_case, 매핑은 서버 소비 계층** — 클라이언트와 서버가 같은 공개 스키마를 소비. 컬럼 1:1 가정 금지. **우선순위:** Must. **출처:** Decided `docs/06` §6.1 URL/JSON 케이싱.
- [ ] **집합 키·명시적 공집합 표식의 왕복** — 키 부재=무제약, `equipmentSelection=none` 등은 공집합. 미지원 메뉴는 공집합을 미적용 보존만 하고 자기 결과를 강제 empty로 만들지 않는다. **우선순위:** Must. **출처:** Decided `docs/06` §6.1.
- [ ] **전역 지표 Context는 `metricId`+`metricVersion` 쌍** — 한쪽만 있는 입력을 최신 버전으로 대체하지 않는다. 다른 지표 상세로 갈 때 목적지 ID로 전역 쌍을 덮어쓰지 않는다. **우선순위:** Must. **출처:** Decided `docs/06` §6.1.
- [ ] **미지원 Context는 폐기하지 않고 칩으로 표시** — “Lot: A1023 · Not used on this page”. 지원 메뉴로 복귀 시 재검증 후 적용. **우선순위:** Must. **출처:** Decided `docs/06` §6 규칙, §6.4, `docs/07` 시나리오.
- [ ] **Global Context / Page Filter / Visualization / Persistent Annotation 4층 분리** — 차트 줌은 로컬, Brush 후 명시적 적용만 URL. 같은 Chip 스타일로 혼용 금지. **우선순위:** Must. **출처:** Decided `docs/06` §6/§11/§16, `docs/04`.
- [ ] **사이드바 전환도 Context Link와 동일** — 전달 집합은 등록된 전역 Context뿐. page-owned·미등록 키는 자동 복사하지 않는다. “지원 키만 골라 쓰기”가 URL에서 나머지를 지우는 뜻이 되면 안 된다. **우선순위:** Must. **출처:** Decided `docs/06` §6.4.
- [ ] **뒤로가기 복원 범위 = URL 소유 상태** — 줌/브러시/시리즈 가시성은 제품 복원 계약 밖. **우선순위:** Must. **출처:** Decided `docs/06` §6.4.
- [ ] **URL이 세션/최근방문보다 이긴다** — 없는 키를 세션으로 채우지 않는다. 적용하는 순간 URL에 기록. **우선순위:** Must. **출처:** Decided `docs/06` §6.4.
- [ ] **Scope는 권한이 아니다** — `scopeId` 단일, 서버 매 요청 재검증, 무단 Scope 조용한 대체 금지, 전체 실패는 `outcome=forbidden`. **우선순위:** Must. **출처:** Decided `docs/06` §6.2/§17.
- [ ] **대표 드릴다운: Cycle Time P95 → 느린 실행 → occurrence → 공정 타임라인 → 현재 Context로 VOC 생성** — 이 한 경로가 식별자·권한·리니지·차트를 함께 검증한다. **우선순위:** Must(설계 검증), 구현 일정은 Deferred. **출처:** Candidate 예 `docs/06` §22, `docs/05` 검증 질문, `docs/07` 시나리오.
- [ ] **분석 화면의 관련 VOC 수(열람 권한 범위 내) + VOC에서 원본 분석으로 복귀** — 권한 승격 없음. **우선순위:** Should. **출처:** Decided 규칙 `docs/02` VOC; UI `docs/04` 공지·VOC.
- [ ] **차트 클릭 → 페이지 필터 칩** — 조용히 Global Filter를 바꾸지 않는다(Silent Drill-down 금지). **우선순위:** Must. **출처:** Decided `docs/06` §24; UI `docs/04` 생산성 분석.
- [ ] **공유 가능한 정규 URL 복사 액션** — 딥링크가 계약이면 “현재 조회 복사”는 셸 Page Action이어야 한다. 상대적 “최근 기간” URL은 재현 링크가 아님을 고지. **우선순위:** Must. **출처:** 계약 Decided `docs/06` §6.4; **버튼/슬롯은 명시 없음 → 신규 제안.**
- [ ] **Command Palette: 메뉴 이동은 기본, Entity Search·Action은 Deferred** — `Create VOC from current context`는 수요 검증 후. 스크린샷 검색창이 entity search를 승인하지 않는다. **우선순위:** Must(메뉴 이동), Nice(엔티티/액션). **출처:** Decided/Deferred `docs/06` §10; `DESIGN.md` top-bar-search 주의.
- [ ] **Breadcrumb은 Kernel이 생성** — 메뉴가 수동 구현 금지. 중첩 페이지에서만 선택적으로, Context를 유지한 채 조상 링크. **우선순위:** Must. **출처:** Decided `docs/06` §4/§5 금지; Candidate 표시 `DESIGN.md`/`docs/07`.
- [ ] **저장된 뷰 복원 시 Scope 재검증** — 권한 우회 금지. `savedViewToken`은 예약, 구현 전 비활성 버튼을 셸에 두지 않음. **우선순위:** Should(기능 채택 시 Must). **출처:** Deferred `docs/06` §6.1/§21, `docs/07` §4.
- [ ] **권한 변경·Scope 전환 시 이전 결과 숨김** — 캐시가 권한을  Ignored하지 않는지 검증 기준에 포함. **우선순위:** Must. **출처:** Decided `docs/06` §11/§17, Candidate 검증 `docs/05`.
- [ ] **미등록 쿼리 키는 URL에 남기되 조회조건·전역 Context로 승격하지 않음** — 새 키가 의미를 바꾸면 `v` breaking change. **우선순위:** Must. **출처:** Decided `docs/06` §6.4.
- [ ] **공지 타게팅 → 대상 메뉴 딥링크** — 공지가 특정 분석 화면·Context를 가리킬 수 있으면 helper를 재사용. 임의 URL 허용은 권한 우회 위험이 있다. **우선순위:** Nice. **출처:** 타게팅 의존은 Decided `docs/02` 공지; **딥링크 결합은 신규 제안.**

---

## 4. 플랫폼 공통 기능

Kernel이 소유하는 책임(`docs/06` §4)과, 메뉴가 선언하고 셸이 소비하는 확장 계약(`docs/06` §5)을 구현 가능한 기능으로 풀어 적는다.

- [ ] **선언형 Menu Registry** — 식별자·그룹·이름·경로·아이콘·권한·지원 Context·페이지 유형·선택 기능. 사이드바 JSX 직접 수정 금지. 초기엔 코드 내부 선언, 외부 플러그인 아님. **우선순위:** Must. **출처:** Decided `docs/06` §5, `docs/02` 코어.
- [ ] **레지스트리 관리 UI** — 운영자가 메뉴를 GUI로 켜고 끄는 화면. **우선순위:** Nice. **출처:** Deferred `docs/07` §2/§8.
- [ ] **전역 Context Bar + 헤더 Scope 선택기 중복 금지** — Time/Equipment/Group/Lot/Process/Metric Version/Scope. Scope는 헤더만. **우선순위:** Must. **출처:** Decided 규칙 `docs/06` §11; Candidate 배치 `docs/07` §4.
- [ ] **딥링크/URL 계약 코덱(클라이언트=서버 동일 산출물)** — `v`, from/to naive datetime, 집합 키, 공집합 표식, 형식 오류는 clamp하지 않고 거부. 구현 형식(OpenAPI/JSON Schema/codegen)은 Candidate. **우선순위:** Must. **출처:** Decided `docs/06` §6.1/§6.3/§6.4.
- [ ] **Auth: day-1 OIDC** — 로컬 인증 후 SSO 전환 비용이 크다. 사내 SSO 여부는 Open. **우선순위:** Must(라이브러리 도입 방향), 방식은 Open. **출처:** Candidate/권고 `docs/03`; Open `docs/05`.
- [ ] **Permission-aware UX 전 구간** — Menu, Route, Filter option, Query result, Saved View, Export, Drill-through, Context Link, VOC 관련 분석 링크. **우선순위:** Must. **출처:** Decided `docs/06` §17.
- [ ] **권한없음 vs 데이터없음 분리** — 같은 Empty를 쓰지 않는다. **우선순위:** Must. **출처:** Decided `docs/06` §17/§19.
- [ ] **Scope 계층(사이트→공장→라인), 상속, 복수 Scope, 설비 소속 규칙** — 셸이 고정 3단 선택기를 요구하지 않음. **우선순위:** Open(도메인 결정) — 구현 기본값은 단일 `scopeId`. **출처:** Open `docs/06` §6.2, `docs/05`.
- [ ] **Audit Trail 공통 모델** — 유효기간 이력(언제 값이 유효했는지)과 감사(누가 바꿨는지)를 섞지 않는다. **우선순위:** Must. **출처:** Decided `docs/02` 코어.
- [ ] **Toast / Confirm / Modal / 전역 Error Boundary / Correlation ID** — 오류 화면에 Query ID를 제공한다. **우선순위:** Must. **출처:** Decided Kernel `docs/06` §4, §19 규칙, `docs/04`.
- [ ] **공통 키보드 숏컷 레지스트리** — ⌘K 팔레트, 포커스 이동. 메뉴가 전역 키를 삼키지 않게 한곳에서 선언. **우선순위:** Should. **출처:** Kernel 책임 Decided `docs/06` §4; **레지스트리 형식은 신규 제안.**
- [ ] **Favorite / Recent Menu** — 사용자별 목적지, 복원 전 Scope·권한 재검증. 마지막 조건 저장 여부는 Candidate. **우선순위:** Should. **출처:** Decided Kernel `docs/06` §4/§9; Candidate `docs/07` §6.
- [ ] **Saved View** — route+지원 Context+page filter+컬럼 상태. hover/줌/modal은 저장하지 않음. **우선순위:** Nice(지금은 Deferred). **출처:** Deferred `docs/06` §21, `docs/05`.
- [ ] **Data Trust + 지연완료 재집계 정책** — `lateArrivalAutoHorizon` 없이 자동 재집계 시작 금지. 창 `[R-H, R)`, 창 밖은 정정 후보. 마스터 소급·재분류·지표 변경은 별 트리거. **우선순위:** Must(메커니즘), 숫자 H는 Open. **출처:** Decided `docs/05` §지연 완료, `docs/01` 트리거.
- [ ] **실시간성: 폴링 + 완료된 계산 세대 기반 캐시 재검증** — watermark 이동 ≠ mart 완료. 웹소켓/SSE는 문서화된 초단위 갱신/presence 요구가 있을 때. **우선순위:** Must. **출처:** Decided `docs/05` §실시간성.
- [ ] **조회 세대/요청 레이스 가드** — Context가 바뀌면 늦은 응답을 새 결과에 채택하지 않음. 동일 Context 재조회만 Refreshing+이전값. **우선순위:** Must. **출처:** Decided `docs/06` §11.
- [ ] **성능 UX: timeout/취소, 가상화, 서버 집계·다운샘플링, 원본 로그 전체 금지** — DataZoom으로 대용량을 풀지 않는다. **우선순위:** Must. **출처:** Decided `docs/06` §27, `docs/01` 확장성, `docs/04` 차트.
- [ ] **내보내기(CSV) + 권한·적용 필터·선택 행 범위 명시** — 차트·표·CSV가 같은 세대·정의를 쓰는지가 검증 기준. **우선순위:** Should. **출처:** Candidate 검증 `docs/05`; 테이블 Export `docs/06` §15; 선택 범위 Candidate `DESIGN.md` Tables.
- [ ] **공지 배너 인프라** — 게시기간·대상 메뉴·스코프. 위치·노출 조건 Open. **우선순위:** Should. **출처:** Decided 기능 `docs/02`; Open `docs/07` §8.
- [ ] **메뉴 활용률 계측 파이프라인** — 레지스트리 진입, Context 적용, export, VOC 생성, 권한 거부. PII·조회 조건 원문을 로그에 넣지 않는 최소 스키마. **우선순위:** Should. **출처:** 신규 제안(§2 활용률 화면의 원천).
- [ ] **검색: 메뉴 검색은 셸 기본, 전역 Entity Search는 Deferred** — 헤더 검색을 Grafana식 만능 검색으로 키우지 않는다. **우선순위:** Must(메뉴), Nice(엔티티). **출처:** Decided `docs/06` §9/§10.
- [ ] **사용자 온보딩(첫 Scope 선택, 지원 Context 설명, 딥링크 vs 보안)** — `scopeId` 부재는 선택 상태다. 빈 셸을 “버그”로 보이게 두지 말고, 접근 가능 메뉴 0건은 별도 안내(`docs/07` Empty). **우선순위:** Should. **출처:** 선택 상태 Decided `docs/06` §6.2; Empty Candidate `docs/07` §3; **온보딩 흐름은 신규 제안.**
- [ ] **환경 배너(staging/prod) + 메타 데이터 쓰기 경고** — 마스터·지표 발행을 잘못된 환경에서 하지 않게. **우선순위:** Should. **출처:** 신규 제안. 배포 환경 자체는 Open `docs/05`.
- [ ] **Feature flag로 메뉴 점진 노출** — 레지스트리 권한과 별개로, 미검증 메뉴를 일부 역할에만 연다. Kernel이 플래그를 모르고 도메인이 숨기면 §5 금지와 충돌하므로 **레지스트리 필드**로 둔다. **우선순위:** Should. **출처:** 신규 제안. 권한 숨김을 페이지가 직접 구현하는 것은 금지 `docs/06` §5.
- [ ] **세션 유휴/만료 UX** — OIDC 토큰 갱신 실패를 조회 0건으로 위장하지 않음. **우선순위:** Should. **출처:** 신규 제안. 인증 방식 Open `docs/05`.
- [ ] **문자열 외부화(i18n 준비)** — UI 카피는 코드에 박지 않되 번역 파이프라인은 만들지 않는다. **우선순위:** Nice. **출처:** `docs/00` 「문자열 외부화만 저비용」.
- [ ] **집계 가능성 규칙을 지표 스키마에 강제** — 비율은 분자·분모 각각 합산. 화면 해상도 다운샘플 ≠ 지표 계산. **우선순위:** Must. **출처:** Decided `docs/01` 집계 가능성, `docs/02` 지표관리.
- [ ] **재현성: 딥링크는 조회조건+지표 버전만, 숫자는 계산 기준시각과 함께** — 지연완료·마스터 정정으로 숫자는 변할 수 있다. **우선순위:** Must. **출처:** Decided `docs/03` 재현성, `docs/06` §6.1.
- [ ] **파서 DB 접근 토폴로지** — 같은 인스턴스, 파서 read-only, 플랫폼 스키마. API는 원본 테이블 직접 조회 금지. replica는 경합/격리 확인 시. **우선순위:** Must. **출처:** Decided `docs/05` §파서 DB, `docs/01`/`docs/03`.
- [ ] **상태 원천 서비스(미수집/파서 지연/커버리지) API 계약** — taxonomy 존재가 원천 구현을 뜻하지 않음. 없으면 `unknown`. **우선순위:** Should(원천), Must(UI가 추론하지 않기). **출처:** Decided 표시 규칙 `docs/06` §19; 원천 구현 Open; `docs/03` 근거 소유자.
- [ ] **조회량 가드: 기간·반환 점수·SQL timeout·too_large** — 프로토타입 무제한 조회 거부. **우선순위:** Must. **출처:** Decided `docs/06` §6.4 마지막 항, `docs/01` 확장성, outcome `too_large` `docs/06` §19.

---

## 5. 개발 편의

새 메뉴가 플랫폼 코드를 고치지 않게(`docs/06` §32) 하려면, 계약과 같은 산출물을 개발자가 복사-붙여넣기하지 않고 재사용해야 한다. 범용 위젯 엔진은 만들지 않는다.

- [ ] **5개 Page Archetype 템플릿(Overview / Analysis Workspace / Management / Catalog / Workflow)** — 새 화면은 조합이 기본, 새 타입은 이유를 기록. **우선순위:** Must. **출처:** Decided `docs/06` §12.
- [ ] **Shell Slot 준수 레이아웃 키트** — title, description, primaryAction, secondaryActions, contextExtension, content, dataTrustSummary 외 전역 UI 삽입 금지. **우선순위:** Must. **출처:** Decided `docs/06` §8.
- [ ] **UI Primitive → Platform Component → Domain Component 층 + 승격 규칙** — 2개 이상 메뉴 확인 후 공통화. 한 화면 전용을 프레임워크로 올리지 않음. **우선순위:** Must. **출처:** Decided `docs/06` §13/§14.
- [ ] **Platform 컴포넌트 최소 세트 구현** — GlobalContextBar, PageHeader, DataTrustIndicator, AnalysisChartFrame, PlatformDataTable, DetailDrawer, AuditTimeline, EmptyState, PermissionGuard. SavedViewSelector는 기능 채택 시. **우선순위:** Must(목록의 계약 해당분). **출처:** Candidate 예 `docs/06` §13; 플랫폼 소유 책임 `docs/06` §14.
- [ ] **메뉴 스캐폴드(레지스트리 매니페스트 → 라우트·권한·지원 Context 스텁·archetype 뼈대)** — 사이드바를 만지지 않고 메뉴를 추가하는 개발 경로가 있어야 §5 금지가 지켜진다. **우선순위:** Must. **출처:** 계약 Decided `docs/06` §5; **코드젠 도구는 신규 제안.**
- [ ] **공개 스키마 단일 산출물 + codegen** — URL/JSON 필드·카디널리티·버전. 클라이언트 라우터와 서버 검증이 같은 파일을 소비. **우선순위:** Must. **출처:** Decided 소유 `docs/06` §6.1; 형식 Candidate(OpenAPI/JSON Schema/codegen).
- [ ] **Context Link helper의 테스트 가능한 API** — 보존 vs 적용 집합, 공집합, 지표 쌍, 미지원 칩. URL 문자열 스냅샷 테스트. **우선순위:** Must. **출처:** Decided 행동 `docs/06` §6/§22; **테스트 하네스는 신규 제안.** `docs/05` 딥링크 왕복은 검증 기준 Candidate.
- [ ] **§19 응답 픽스처 생성기** — `outcome` + 선언된 kind의 `assessments[]` 누락/중복을 클라이언트가 보정하지 못하게 서버·MSW 픽스처를 공유. **우선순위:** Should. **출처:** Decided 스키마 `docs/06` §19; **생성기는 신규 제안.**
- [ ] **파서 dump 기반 뷰·계약 스냅샷 테스트** — View가 rename을 “흡수한다”는 선언은 테스트 없이는 보장이 아님. **우선순위:** Must. **출처:** Decided 대응 `docs/01`.
- [ ] **차트 타입 카탈로그(허용 목록)** — 시계열 occupancy, 분포/히스토그램(사이클타임), 공정 타임라인, 유효구간 타임라인, 이송 분포, 버전 diff, 선택적 간트. Gauge/3D/장식 히트맵은 기본 금지. **우선순위:** Should. **출처:** 요구는 `docs/04`/`docs/02`/`docs/06` §16/§24에 흩어짐; **허용 목록 문서는 신규 제안.**
- [ ] **도식(다이어그램) 최소형** — EquipmentValidityTimeline, WaferJourneyTimeline, VOCStatusTimeline, MetricVersionDiff는 Domain Component로 남긴다. 범용 다이어그램 편집기는 Deferred. **우선순위:** Should(도메인 컴포넌트), Nice 아님(범용 엔진). **출처:** Candidate 예 `docs/06` §13; Deferred Annotation Editor `docs/06` §14.
- [ ] **주석: 픽셀이 아니라 시간구간·데이터 좌표·occurrence 기준 저장** — 영역 주석 최소형과 자유 필기 편집기를 분리. 대표 화면 하나에서 줌 후 위치 유지·저장 복원까지 검증한 뒤 라이브러리 고정. **우선순위:** Should(최소형), Nice(고급). **출처:** Decided 문제 정의 `docs/04` 주석; Deferred 범위 `docs/05` Phase 2/4 가설.
- [ ] **테이블 스택: TanStack Table+Virtual 기본, AG Grid는 초대형·피벗 유료 여부 확인 후** — 피벗은 SQL-first mart가 우선. **우선순위:** Should. **출처:** Candidate `docs/04`.
- [ ] **고정 조회 레이아웃은 CSS Grid, react-grid-layout은 사용자 편집 채택 시에만** — 레이아웃 라이브러리와 대시보드 저장 모델(`layoutVersion`/`owner`/`scope`)을 분리. **우선순위:** Should. **출처:** Candidate/Deferred `docs/04`.
- [ ] **프론트 상태 역할 분리 후보** — TanStack Query(서버) + Zustand(UI) + URL 동기화. 전역 필터는 URL이 기준. **우선순위:** Should(착수 시). **출처:** Candidate `docs/04`. 제품 제약이 프레임워크를 강제하지 않음.
- [ ] **라우팅 후보 TanStack Router** — 타입 있는 search params. 버전·폐기 필드·미지원 필터는 라우터가 자동 설계하지 않음. **우선순위:** Should. **출처:** Candidate `docs/04`.
- [ ] **Storybook(또는 동등)에서 Platform Component + §19 상태 전수** — 메뉴 개발자가 Empty/Forbidden/Too large를 재발명하지 않게. **우선순위:** Should. **출처:** 신규 제안. 컴포넌트 층은 `docs/06` §13.
- [ ] **시각 회귀 + 토큰 린트** — primitive 색 직접 사용, 5번째 상태색, 장식 게이지를 PR에서 거부. **우선순위:** Nice. **출처:** 신규 제안. Governance 체크리스트는 Decided `docs/06` §28.
- [ ] **메뉴 PR 템플릿 = Platform Done 체크리스트** — Registry 등록, Context 선언, Slot, 딥링크, Scope, Data Trust, 상태 분리, 과도한 일반화 여부. Domain Done만으로 머지하지 않음. **우선순위:** Must. **출처:** Decided `docs/06` §28/§29.
- [ ] **화면 설계 워크플로 강제** — 새 화면은 Requirements→IA→Screen Spec→Wireframe→Open Decisions. Prototype은 별도 구현 요청 후. **우선순위:** Should. **출처:** Decided 절차 `.agents/skills/analysis-platform-wireframe/SKILL.md`.
- [ ] **공유 URL 코덱 골든 테스트** — 잘못된 날짜, `Z` 접미사, 한쪽만 있는 from/to, 중복 단일키, 공집합+ID 동시, 미지원 `v`. **우선순위:** Must. **출처:** Decided 거부 규칙 `docs/06` §6.4; **테스트 스위트는 신규 제안.**
- [ ] **로컬 개발: 파서 dump 픽스처 + 플랫폼 스키마 마이그레이션 + MSW 셸** — 런타임 코드가 없어도, 착수 시 셸을 파서 실DB 없이 띄울 경로가 필요하다. **우선순위:** Should(착수 시 Must). **출처:** 마이그레이션 도구 Candidate `docs/03` Alembic; **MSW/dev 경로는 신규 제안.**
- [ ] **비동기 작업 API 패턴(export/recalc)** — 상태 머신, 권한 재검증, correlation id, 취소. 메뉴마다 다른 job UI 금지. **우선순위:** Should. **출처:** 역할 Decided `docs/03`; **패턴 라이브러리는 신규 제안.**
- [ ] **키보드·포커스 트랩을 Primitive에서 해결** — Dialog/Drawer focus trap, 사이드바 접힘 플라이아웃. 도메인이 재구현하지 않음. **우선순위:** Must. **출처:** Decided `docs/06` §26; Candidate `DESIGN.md` sidebar/dropdown.

---

## 6. 기타 제안 (플랫폼이 메뉴 없이 실패하는 것들)

- [ ] **분석 계약 버전 ≠ 파서 SnapshotSchema ≠ DB 마이그레이션 ≠ 지표 정의 버전 ≠ URL `v`** — 다섯 버전을 한 숫자로 묶지 않는다. **우선순위:** Must. **출처:** Decided 구분 `docs/01` 리스크, `docs/06` §6.4 `v` 별개 선언.
- [ ] **얇은 호환 뷰 vs materialized mart를 한 계층으로 뭉뚱그리지 않기** — 갱신 모델이 다르다. **우선순위:** Must. **출처:** Decided `docs/01` 아키텍처.
- [ ] **mart 세대 정합: 한 화면의 차트·표·CSV가 서로 다른 갱신 세대를 섞지 않음** — `pg_cron`은 스케줄일 뿐. watermark 감지→재집계가 별도. **우선순위:** Must. **출처:** Decided `docs/01` mart 재계산, `docs/05`.
- [ ] **`defaultRangeTo`와 진행 경계 `R`을 같은 값으로 취급하지 않음** — `R`이 있을 때만 `defaultRangeTo ≤ R`이면 자동 물질화. **우선순위:** Must. **출처:** Decided `docs/06` §6.3, `docs/05` 지연 완료.
- [ ] **단일 테넌트 + grain에 site/plant 행 스코핑** — 풀 멀티테넌시(스키마/DB 분리)와 RLS는 요구 확인 시. **우선순위:** Should(초기 기본값 후보). **출처:** Open 질문 + 권고 `docs/01` 멀티테넌시, `docs/05`.
- [ ] **백엔드 SQL-first** — 집계는 Postgres, API는 권한·계약·전달, 긴 작업은 별도 프로세스. 요청 경로 DataFrame 금지. 언어는 Open. **우선순위:** Must(역할 분담), 언어 Open. **출처:** Decided 원칙 `docs/03`; 언어 Open `docs/05`.
- [ ] **플랫폼 메타 DB 백업·복구 런북** — 사용자/권한/지표 정의/레지스트리는 파서 DB와 수명이 다르다. **우선순위:** Should. **출처:** 신규 제안. 메타 DB 존재는 `docs/01` 아키텍처 그림.
- [ ] **쿼리/감사 로그 보존·조회 권한** — 활용률·Audit와 겹치되, 분석 원천 데이터 보존 기간(Open)과 정책을 분리. **우선순위:** Should. **출처:** 신규 제안. 볼륨/보존 Open `docs/05`.
- [ ] **브라우저 지원 매트릭스** — Desktop-first라도 Chromium-only를 암묵 기본으로 두지 말고 명시. 키보드·가상화·ECharts Canvas 차이를 본다. **우선순위:** Should. **출처:** 신규 제안.
- [ ] **제품 용어집(한글 UI 카피)** — Scope, Coverage, Provisional, occurrence, wall-clock, 미적용 Context를 화면마다 다른 말로 쓰지 않음. **우선순위:** Should. **출처:** 신규 제안. vocabulary는 `docs/06` §18/§19에 있으나 UI 카피 가이드는 없음.
- [ ] **접근성 릴리스 게이트** — 분석 UI라는 이유로 후순위 금지. 색만으로 상태 구분 금지. **우선순위:** Must(원칙), 감사 도구는 Should. **출처:** Decided `docs/06` §26.
- [ ] **보안: URL 필터는 보안 경계가 아님을 위협 모델에 명시** — export 파일, 공유 링크, 캐시 키에 권한을 넣는다. **우선순위:** Must. **출처:** Decided `docs/06` §6.2/§17; 참고 `docs/04` Power BI 인용.
- [ ] **지원 가장(impersonation)은 기본 제공하지 않음** — 감사·권한 모델을 우회하기 쉽다. 수요가 있으면 Audit이 남는 별도 결정. **우선순위:** Nice(지금은 하지 않음). **출처:** 신규 제안(하지 말 것).
- [ ] **문서 정합 부채: `docs/07` §8이 URL/시간을 여전히 Open으로 적음** — `docs/06` §6.3/§6.4와 `docs/05`에서 이후 Decided. 구현자가 07만 읽으면 후퇴한다. **우선순위:** Should(문서 작업, 이번 소유권 밖). **출처:** 관찰. 원본 수정은 본 태스크 금지.
- [ ] **`DESIGN.md` 레퍼런스 대시보드 ≠ 제품 IA** — 스크린샷 그룹명(Processing Pipeline 등)을 레지스트리로 쓰지 않음. 알림 뱃지·Live 점·큐 분모는 픽셀에서 추론하지 않음. **우선순위:** Must(가드레일). **출처:** Candidate/주의 `DESIGN.md` Reference review, Do/Don't.
- [ ] **대표 시나리오 설계 검증 5항을 수용 테스트로 승격할 준비** — 차트·표·CSV 일치, 지연완료 후 일치, 딥링크 왕복, 권한 변경 후 비노출, 유효구간 귀속. 현재는 Candidate이며 POC 의무 아님. **우선순위:** Should(착수 시 Must). **출처:** Candidate `docs/05`.

---

## Open Questions

확신이 없거나 원문이 Open이거나, 문서 간 긴장이 있어 구현 전에 결정이 필요한 것.

1. **Scope 계층·복수 선택·설비 소속 규칙** — `docs/06` §6.2 Open. 셸은 추상 선택기만.
2. **사업장별 원천 TZ 실제 값, 다중 사업장의 “같은 날짜”, 교대일/영업일** — `docs/06` §6.3 / `docs/03` / `docs/05` Open. naive 단일 설비 조회는 계속 허용.
3. **지연완료 창 길이 `H` / `lateArrivalAutoHorizon` 숫자, 폴링 주기** — 메커니즘 Decided, 숫자는 Open `docs/05`.
4. **인증 방식(사내 SSO 여부), 백엔드 언어, 배포(온프렘/클라우드), 동시 사용자, 데이터 볼륨/보존, 멀티테넌시** — `docs/05` Open.
5. **공개 URL 필드명·enum 문자열·공집합 표식 필드명·assessment kind 어휘** — 행동 Decided, 이름은 Candidate `docs/06` §6/§19.
6. **상태 원천 서비스의 실제 구현** — taxonomy ≠ 구현 `docs/06` §19, `docs/03`. Overview에 수집 위젯을 넣을 수 있는 시점.
7. **공지 배너 위치·노출 조건, 알림 벨의 읽음/집계/권한 의미** — `docs/07` Open. 벨은 필수 아님.
8. **다크모드를 제품 요구로 올릴지** — `DESIGN.md` not designed. 본 체크리스트는 Nice로만 둠.
9. **아이콘 라이브러리, shadcn vs Base UI/Radix 조합, ECharts 확정(POC)** — Candidate/Open `docs/04`, `DESIGN.md`.
10. **기간 프리셋 7D/30D/90D 앵커** — `DESIGN.md` Open. 잘못 짜면 `defaultRangeTo` 계약을 우회한다.
11. **셸 기본 치수 240/56 vs 270/54, 테이블 행 40 vs 32** — 둘 다 Candidate. 구현 기본값 미선택.
12. **Donut 사용 허용 범위 vs §24 Gauge 금지** — 분모 있는 비율 링만 허용할지 미문서화. Open으로 표시.
13. **즐겨찾기/최근이 마지막 조회조건까지 저장하는지** — Candidate `docs/07` §6.
14. **메뉴 활용률의 보존 기간·개인정보 범위·역할(관리자만?)** — 신규 제안이라 정책 없음. Open.
15. **Feature flag를 레지스트리 필드로 둘지, 별도 시스템인지** — 신규 제안. §5 숨김 금지와 충돌하지 않게 설계해야 함. Open.
16. **표준 로그 라이프사이클 화면을 설비관리 하위에 넣을지** — Candidate 레퍼런스일 뿐 채택 여부 미결정.
17. **비교(Compare)의 카디널리티** — 전역 지표 Context는 v1 단일 쌍. 두 기간 오버레이가 page-owned인지 전역인지 미기술. Open.
18. **`docs/07` Open 목록 중 이후 Decided된 항목의 문서 갱신 시점** — 본 태스크는 기존 docs를 수정하지 않음.

---

## 집계

| 구분 | 체크 항목 수 | 비고 |
| --- | ---: | --- |
| 0. 명시적 비범위 | 9 | YAGNI·셸 비필수. Must로 올리지 않음 |
| 1. 디자인 | 25 | 토큰/상태/차트/a11y + 공백(다크모드·CJK·z-index·매핑 표) |
| 2. 메뉴 카탈로그 | 27 | 기존 catalog + 레퍼런스 Candidate + 7그룹 안 신규 수용 |
| 3. 메뉴 간 연결 | 21 | 대부분 Decided 계약의 구현 요구화 |
| 4. 플랫폼 공통 | 31 | Kernel + 계측/온보딩 등 신규 |
| 5. 개발 편의 | 24 | 스캐폴드·코덱 테스트·차트 카탈로그 등 |
| 6. 기타 | 16 | 버전 혼동 방지, 보안, 문서 부채 |
| **체크리스트 합계** | **153** | 0번 9항 포함 |
| **합계(0 제외 실요구)** | **144** | |
| Open Questions | 18 | 결정 전 구현하지 말 것(체크박스 아님) |

신규 제안으로 명기한 항목은 **38항**. 나머지는 기존 Decided/Candidate/Deferred를 구축 체크리스트로 재진술한 것이다.

이 문서는 구현 승인이 아니다. Platform Done(`docs/06` §29)을 만족하지 않는 메뉴 구현은 이 목록에서 완료로 치지 않는다.
