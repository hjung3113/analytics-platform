# analytics-platform 구축 요구사항 문서 / 체크리스트

> 작성: zai/glm-5.3 (Orca dispatch worker) — docs/INDEX·00~07 전수 정독 + DESIGN.md(946줄)·와이어프레임 SKILL.md 반영, "플랫폼 커널 우선(Platform before Page)" 관점에서 작성. 2026-09-20. 본 문서는 요구사항 조사 결과이며 구현 승인·일정 확정이 아니다(docs/05의 Phase 표는 non-authoritative 가설).

## 범례

- **출처**: `docs/xx §n (Decided/Candidate/Deferred/Open)` = 기존 문서에 존재. `신규 제안` = 문서에 없는 항목(근거 제시).
- **우선순위**: **Must** = Platform Kernel/첫 메뉴 구현 전 확정 또는 구축 필요(없으면 계약 위반·재작업 발생) / **Should** = 2~3번째 메뉴 전까지 필요(플랫폼 일관성 확보) / **Nice** = 수요·전제 확인 후(문서의 YAGNI·Premature Platformization 원칙 준수).
- 기존 문서의 Decided는 "설계 계약 확정"이지 구현 완료가 아님(docs/05 결정 상태 표 참조).

---

## 1. 디자인 요소

- [ ] **디자인 토큰 체계 확정(radius/spacing/typography/semantic colors)** — 모든 메뉴가 같은 토큰을 소비해야 화면별 스타일 분기가 생기지 않는다. §23은 Candidate, DESIGN.md는 alpha 단계로 아직 "확정" 상태가 아니므로 구현 전 승격이 필요하다. — **Must** — 출처: docs/06 §23 (Candidate), DESIGN.md (alpha, §23과 정합 완료된 부분 명시)
- [ ] **토큰 저장소→코드 배포 파이프라인(DESIGN.md YAML → CSS 변수/Tailwind 설정)** — 토큰이 문서에만 있으면 메뉴마다 하드코딩으로 재현돼 계약이 무너진다. 토큰의 단일 소스에서 코드로 생성하는 경로가 필요하다. — **Should** — 출처: 신규 제안 (docs/06 §4 "Theme/Design Token" 책임은 Decided이나 배포 메커니즘은 문서에 없음)
- [ ] **다크모드 설계** — DESIGN.md가 명시적으로 "미설계, 자체 패스 필요(naive token invert 불가 — 다크 사이드바와 충돌)"로 남겨뒀다. 수요 확인 전 구현하지 않되, 토큰 구조가 이후 확장을 막지 않게 해야 한다. — **Nice** — 출처: DESIGN.md Open Decisions (다크모드 항목)
- [ ] **차트 라이브러리 토큰 바인딩(ECharts 테마 작성)** — semantic/category 색 팔레트 계약은 존재하지만 ECharts 테마 config으로 물화된 적이 없다(DESIGN.md Open). 첫 분석 메뉴의 차트가 이 테마를 소비해야 팔레트가 일관된다. — **Must** — 출처: docs/04 차트 절 (ECharts 추천 Candidate), DESIGN.md Open Decisions (chart library token mapping)
- [ ] **차트 라이브러리 POC(대용량 시계열·다중 차트 브러시 동기화)** — "ECharts가 Plotly보다 유리하다"는 확정 사실이 아닌 검증 가설이다. 대표 화면 실데이터로 줌/팬/브러시/주석 복원을 검증한 뒤 라이브러리를 고정해야 한다. — **Should** — 출처: docs/04 차트/도식 자유도 요구사항 (POC 검증 조건 명시)
- [ ] **아이콘 세트 확정(단일 rounded-outline 패밀리, 예: Lucide)** — 아이콘 라이브러리는 아직 Candidate다. 혼합 아이콘 패밀리는 고밀도 셸의 시각 잡음이 되므로 구현 전 단일 세트로 확정해야 한다. — **Should** — 출처: DESIGN.md Open Decisions (icon set Candidate)
- [ ] **UI 프리미티브 라이브러리 선정(shadcn/ui + Base UI vs Radix 비교)** — primitive 간 합성 API 차이를 실제로 검증하고 채택 조합을 명시하라는 문서 요구가 있다. 모든 Platform Component의 기반이므로 구현 착수 조건이다. — **Must** — 출처: docs/04 프론트엔드 기술 스택 (Candidate)
- [ ] **인터랙션 상태 토큰 바인딩(hover/pressed/selected/focus-visible/disabled/busy)** — DESIGN.md가 컴포넌트군별 상태 바인딩 계약표를 갖고 있으나 코드 바인딩은 구현 단계 과제다. 상태별 동작(예: busy 중복 제출 차단, disabled 사유 표시)이 메뉴마다 달라지면 안 된다. — **Must** — 출처: DESIGN.md interaction.* + Shared interaction and data states 표
- [ ] **모션 토큰 적용(120ms 상태 전이, reduced-motion 0ms, live pulse 조건부)** — 애니메이션은 색/불투명도로만 제한하고 reduced-motion 대응이 계약에 있다. pulse는 원천이 실시간성을 확인할 때만 허용된다. — **Should** — 출처: DESIGN.md motion + live-dot 규칙
- [ ] **접근성 기준 구현(§26 최소 원칙 + 대비 검증)** — 색만 의존 금지, focus trap, 차트 텍스트 요약/동일 데이터 표 접근, icon-only 라벨 등이 Decided 기준이다. 렌더 시 4.5:1/3:1 대비 검증까지 요구된다. — **Must** — 출처: docs/06 §26 (Decided), DESIGN.md (status-badge-accessible, 대비 검증)
- [ ] **반응형 전략 구현(Desktop-first, 1440/1024 경계)** — 1024–1439px 사이드바 접기·Drawer 전환, 1024px 미만 조회 중심 제한이 Decided다. 모바일 재설계를 하지 않는 대신 경계 동작은 구현돼야 한다. — **Must** — 출처: docs/06 §25 (Decided), DESIGN.md (breakpoint 적용)
- [ ] **시맨틱 상태 배지 4종(success/warning/danger/neutral)과 §19 상태 매핑** — 배지 색은 스크린마다 발명하지 않고 §19 근거 규칙으로만 매핑한다. neutral이 confirmed-success와 구분되는 것이 confirmed/unconfirmed 계약의 핵심이다. — **Must** — 출처: DESIGN.md status-badge-* + Semantic 절, docs/06 §19 (Decided)
- [ ] **KPI 카드 행 제한(5–6개) 및 KPI 타이포그래피** — KPI 행이 늘어나면 전용 지표 화면으로 가야 한다는 규칙이 있다. stat-value 32px/600(§23 범위 30–36) 등 토큰도 정해져 있다. — **Should** — 출처: docs/04 (KPI 카드 수 제한), DESIGN.md (stat-card, Cap 규칙)
- [ ] **숫자 표현 규칙(우측 정렬, tabular-nums, ID는 mono, 단위/정밀도 열 정렬)** — 고밀도 표의 가독성 핵심이며 계약으로 존재한다. 모든 숫자를 mono로 만들지 않는 등의 세부 규칙도 정해져 있다. — **Must** — 출처: docs/06 §15 (tabular-nums), DESIGN.md typography.numeric/mono
- [ ] **테이블 밀도 토큰 확정** — docs/06 §15 Baseline(행 40px)과 DESIGN.md table-density(최소 32px, 기준 화면 25px는 compact 시각 목표)가 다르다. 어느 쪽이 기본 밀도인지 구현 전 확정이 필요하다(→ Open Questions). — **Must** — 출처: docs/06 §15 (Candidate Baseline), DESIGN.md table-density — **치수 불일치 미해결**
- [ ] **CJK(한글) 폰트 스택 결정** — 이 플랫폼 사용자 언어는 한국어인데 Inter는 한글 글리프가 없어 폴백 폰트가 행 높이와 밀도를 바꾼다(DESIGN.md도 fallback으로 인한 행 높이 증가를 경고). Noto Sans KR 등 CJK 폰트와 폰트 스택을 명시적으로 결정해야 한다. — **Should** — 출처: 신규 제안 (DESIGN.md가 "font fallback/localization may increase row heights" 경고, 폰트 선택 미정)
- [ ] **시각 안티패턴 금지 목록 적용(Card Soup, Hidden Context, Silent Drill-down, Filter Duplication, Domain Leakage, Premature Platformization, Decorative Visualization)** — 7개 금지 패턴이 Decided 계약이다. 리뷰/거버넌스 체크리스트의 기준으로 직접 소비된다. — **Must** — 출처: docs/06 §24 (Decided)
- [ ] **Empty/Loading/Error 시각 언어(skeleton, 갱신중 표시, correlation ID 노출)** — skeleton은 행/축 형태 유지, 동일 Context 재조회만 이전값 유지 등의 동작 규칙이 정해져 있다. 메뉴별로 다른 오류 UI를 만들지 않도록 공통 컴포넌트화가 필요하다. — **Must** — 출처: docs/04 로딩·빈 상태·오류 절, docs/06 §19 (Decided), DESIGN.md interaction.loading/empty/error
- [ ] **셸 레이아웃 치수 통합(사이드바/탑바)** — docs/06 §7 Baseline(사이드바 240px, 탑 헤더 56px)과 DESIGN.md canonical(270px/54px)이 다르다. 둘 다 Candidate이므로 구현 전 하나로 통합해야 한다(→ Open Questions). — **Must** — 출처: docs/06 §7 (Candidate Baseline), DESIGN.md (270px/54px canonical) — **치수 불일치 미해결**
- [ ] **Elevation 모델 적용(hairline 우선, shadow는 floating surface 한정)** — 평면적인 hairline+표면 대비로 위계를 만드는 방식이 양 문서에 일관된다. 드롭섀도 스태킹 금지가 계약이다. — **Must** — 출처: docs/06 §23 (Shadow 제한), DESIGN.md Elevation & Depth
- [ ] **차트 인코딩 규칙(시리즈 색 바인딩, 분모 명시, unknown≠0%, 클릭으로 전역 Context 조용히 변경 금지)** — donut 색 바인딩(coverage→blue 등), 회색 remainder의 명명된 범주 요구, 결측의 unknown 상태 등이 규칙으로 존재한다. 차트마다 재해석되면 안 된다. — **Must** — 출처: DESIGN.md Reference component bindings (Charts), docs/06 §24 Silent Drill-down (Decided)
- [ ] **주석(Annotation) 시각·저장 모델 최소형(시간구간·데이터 좌표 기반)** — 그린 영역을 화면 픽셀이 아닌 시간구간/occurrence 기준으로 저장하고, 자유 필기와 분석 선택 영역을 구분한다. 최소형 영역 주석 먼저, 고급 편집기는 Deferred 구분이 문서에 있다. — **Should** — 출처: docs/04 주석 저장 모델 절 (설계 과제 명시), docs/02 (Phase 2 가설에 최소형)
- [ ] **라이트 캔버스 단일 액센트 원칙(primary #2563eb 희소 사용, category accent는 차트/태그 전용)** — 두 번째 채도 높은 브랜드 색 추가 금지, accent-purple/teal/amber은 시리즈 구분 전용이라는 규율이 있다. 메뉴 추가 시 임의 색이 들어오는 것을 막는 기준이다. — **Must** — 출처: DESIGN.md Do's and Don'ts, Key Characteristics

## 2. 메뉴 카탈로그

**기존 문서에 정의된 도메인·플랫폼 메뉴 (docs/02 도메인 6종 + docs/06 §9·docs/07 §2의 7그룹 IA):**

- [ ] **운영 개요(랜딩) — 플랫폼 현황(즐겨찾기/최근방문, 내 메뉴 바로가기)** — 셸의 진입 화면으로 navigation IA 7그룹의 일부다. "수집 상태/데이터 최신성" 위젯은 판정 근거 서비스가 생기기 전 노출 금지라는 제약이 함께 정해져 있다. — **Must** — 출처: docs/06 §9 (Decided 7그룹), docs/07 §2 IA 트리
- [ ] **설비관리 — 설비 마스터 목록(유효구간 이력)** — 물리 삭제 대신 유효기간 종료로 이력 보존하고, 설비는 파서 로그에서 발견(import)하며 플랫폼은 business 속성만 부여하는 설계가 채택됐다. 조인 키는 equipment_id 하나뿐이라는 docs/23 계약을 따른다. — **Must** — 출처: docs/02 설비관리 행 (docs/23 §1.2 채택, Decided 방향), docs/07 §2
- [ ] **설비관리 — 설비 상세(속성·유효구간 타임라인·Audit 탭)** — 상세 화면에 Audit을 숨은 메뉴가 아닌 탭/우측 패널로 노출하는 패턴이 정해져 있다. 겹치는 유효구간은 저장 전 차단/경고가 필요하다. — **Must** — 출처: docs/07 §2, docs/04 설비·기준정보 CRUD 패턴
- [ ] **설비관리 — 사용중지/복원(유효기간 종료 기반)** — "사용중지"와 속성 이력 valid_to 종료를 동일 취급하지 않는다는 구분이 있다. 원천 소유자(외부 import vs 플랫폼 수정) 충돌 방지 전제가 붙는다. — **Must** — 출처: docs/02, docs/01 (마스터 데이터 수정 권한의 원천)
- [ ] **기준정보관리 — 공정/레시피/자재 등 마스터 CRUD** — 외부 시스템(MES) 관리 항목과 플랫폼 직접 관리 항목을 구분해야 한다. 필드별 원천 소유자 구분이 Phase 0 과제로 지정돼 있다. — **Should** — 출처: docs/02 기준정보관리 행, docs/01 (필드별 원천 소유자)
- [ ] **생산성 분석 — 개요(물리 점유율/비Process 체류/사이클타임 P50·P95/Job 처리량)** — 파서 데이터만으로 낼 수 있는 지표로 한정됐고, SEMI E10 가동률·수율은 제외하거나 "제한된 정의"임을 화면에 명시해야 한다. 플랫폼 계약을 검증하는 대표 Consumer다. — **Must** — 출처: docs/02 생산성 분석 행 (docs/23 제안 1/2/4 한정, Decided 방향)
- [ ] **생산성 분석 — 사이클타임 상세 → 느린 실행 목록 → 실행(occurrence) 상세(공정 타임라인+품질 표시)** — 대표 검증 시나리오의 핵심 드릴다운 흐름이다. "이 숫자가 어느 실행에서 나왔는지"까지 내려가는 리니지 검증 경로다. — **Must** — 출처: docs/07 §2, docs/05 대표 시나리오 검증 기준 (Candidate)
- [ ] **생산성 분석 — Wafer Journey 이송 분포** — 문서에 명시된 분석 화면이다. Time/Lot Context를 모두 소비하는 Context Capability 사례로 제시돼 있다. — **Should** — 출처: docs/02, docs/06 §6 예시 표
- [ ] **지표관리 — 지표 카탈로그(grain/분자·분모/기간/버전/발행상태) + 지표 상세(버전 이력·사용 중인 대시보드)** — 계산식 저장소가 아니라 grain/분모/커버리지 카탈로그로 설계됐다. 대시보드는 게시 시점의 지표 버전을 고정해야 한다. 최소형은 이후, 정의를 데이터로 승격하는 것은 후속 단계 가설이다. — **Should** — 출처: docs/02 지표관리 행, docs/04 지표 카탈로그 패턴
- [ ] **공지 — 목록/상세(게시기간·대상 메뉴·권한 스코프 설정)** — 기준정보관리와 동일한 패턴(등록/수정+변경 감사 재사용)이며 별도 알림 엔진 없이 로그인 배너/목록 노출로 충분하다. 대상 타게팅은 메뉴 레지스트리+권한 모델에 의존한다. — **Should** — 출처: docs/02 공지 행 (배너 위치·노출 조건은 docs/07 Open)
- [ ] **VOC — 목록/상세(접수→처리중→완료 상태전이, 담당자 배정, 댓글)** — 접수/담당자/상태전이/댓글은 VOC 자체 도메인 모델이고 Audit Trail은 who/when 기록만 겹친다. VOC 열람 권한이 원본 분석 권한을 자동 부여하지 않는 별도 규칙이 필요하다. — **Should** — 출처: docs/02 VOC 행 (2차 리뷰 반영, Decided 방향)
- [ ] **관리·감사 — 권한/역할 관리(메뉴 단위 × 데이터 스코프)** — 7그룹 IA의 관리·감사 그룹에 포함된다. 권한 모델은 코어 셸(전제)이므로 관리 UI도 플랫폼 필수 화면이다. — **Must** — 출처: docs/06 §9 (Decided), docs/07 §2
- [ ] **관리·감사 — 변경 감사 Audit Trail 전역 뷰** — 각 상세 화면의 Audit 탭과 별개로 전역 뷰가 IA에 명시돼 있다. 마스터/기준정보/지표 정의 변경의 who/when/before-after를 조회한다. — **Should** — 출처: docs/07 §2, docs/02 (Audit Trail은 플랫폼 코어 기능)
- [ ] **모니터링 — 수집 상태/데이터 최신성 화면** — 판정 근거 서비스(어느 서비스가 수집 중단·파서 지연을 확정하는지)가 없어 Deferred로 분리됐다. 근거 없이 "0건→수집 중단" 추론이 금지된 계약을 지키려면 이 서비스가 전제돼야 한다. — **Nice** — 출처: docs/07 §2 (Deferred + 노출 금지 조건), docs/03 (근거 소유자 미정)
- [ ] **운영 알림(적재 중단·집계 실패 등 인프라 운영 알림)** — 1차 리뷰 YAGNI 정리가 "범용 알림 엔진 말고 운영 알림부터"라는 순서를 명시했다. mart 파이프라인 운영성 확보 시점에 필요하다. — **Nice** — 출처: docs/00 제외 목록 (순서 명시), docs/02 VOC 비고 (VOC-운영 알림 연계 후속)
- [ ] **공정 이상 알림/이상탐지** — 지표·임계값이 검증된 후에만 검토하도록 명시적으로 뒤로 미뤄진 항목이다. 조기 구현은 문서의 YAGNI 결정과 충돌한다. — **Nice** — 출처: docs/00 제외 목록 (YAGNI), docs/02 VOC 비고
- [ ] **리포트 빌더/스케줄 리포트** — 스케줄 리포트는 1차 리뷰에서 명시적으로 제외됐다. 수요가 확인되면 재검토 대상이며, 그 전에는 CSV 내보내기(동일 조건 차트·표·CSV 일치)로 요구를 흡수한다. — **Nice** — 출처: docs/00 제외 목록 + 신규 제안(재검토 조건부)
- [ ] **메뉴 활용률 대시보드(어떤 메뉴를 누가 얼마나 쓰는지)** — 메뉴가 늘어나는 플랫폼에서 공통 컴포넌트 승격/화면 개선의 우선순위 근거가 될 데이터가 현재 설계에 없다. Audit Trail·최근방문 이력과 별개의 집계 뷰로, 수집 항목·보존·익명화 경계 정의가 전제다(→ Open Questions). — **Nice** — 출처: 신규 제안
- [ ] **시간대/시간역 관리 화면(time domain assertion 데이터 관리)** — 복수 설비 시간축 병합 가드가 (equipmentId, timeDomainId, validFrom, validTo) assertion 데이터를 요구하는데, 이 데이터를 등록·수정하는 주체와 화면이 정의돼 있지 않다. 사업장별 TZ 매핑(Open)이 결정되면 관리 UI가 필요하다. — **Should** — 출처: 신규 제안 (docs/06 §6.3 assertion 계약이 데이터 존재를 전제)
- [ ] **사용자 온보딩(첫 로그인 안내, 기능 가이드, 빈 즐겨찾기 안내)** — 빈 상태 안내는 docs/07에 있으나 신규 사용자의 플랫폼 적응 흐름(어느 메뉴부터 보는지, Context 개념 학습)은 설계에 없다. 플랫폼 특유의 전역 Context/Scope 개념은 학습 비용이 있어 온보딩 가치가 있다. — **Nice** — 출처: 신규 제안 (docs/07 Empty state 안내만 존재)

## 3. 메뉴 간 연결 (딥링크·Context 전파·크로스내비게이션)

- [ ] **필터 포워딩(딥링크) 쿼리 파라미터 계약 고정** — 다른 기능보다 먼저 계약을 고정해야 이후 메뉴가 늘어도 재작업이 없다고 명시돼 있다. 전역 필터 컨텍스트와 동일한 상태로 설계된다. — **Must** — 출처: docs/02 플랫폼 코어 (최우선 명시), docs/06 §6 (Decided)
- [ ] **Context Capability 선언 매트릭스(메뉴별 Time/Equipment/Lot/Metric Version의 O/△/X)** — 모든 메뉴가 전역 Context를 무조건 소비하지 않고 선언적으로 지원 여부를 밝힌다. 메뉴 확장 계약의 핵심 필드다. — **Must** — 출처: docs/06 §6 (Decided), docs/05 Menu Extension (§5)
- [ ] **미지원 Context 조용히 폐기 금지 + "적용되지 않음" 명시 표시** — 전달된 Context를 대상 메뉴가 지원하지 않으면 버리지 않고 표시하며, 지원 메뉴로 복귀 시 재검증 후 적용한다. Context 신뢰의 핵심 규칙이다. — **Must** — 출처: docs/06 §6 규칙 + §6.4 (Decided)
- [ ] **occurrence 식별자와 목적지 객체 ID 분리((equipmentId, entityType, anchor)는 occurrence 전용)** — lotId 같은 업무 ID를 anchor 없는 occurrence 조인에 쓰지 않고, 설비는 equipment_id만으로, VOC는 vocId로 연다. 잘못된 조인은 분석 정확성을 직접 훼손한다. — **Must** — 출처: docs/06 §6.1 (Decided)
- [ ] **URL 소유 상태 목록 구현(scopeId/from/to/집합 키/metricId+metricVersion/탭·저장조건 id/occurrence anchor)** — URL이 소유하는 상태가 정확히 열거돼 있고, 그 외 객체 ID는 목적지 경로 계약이 소유한다. 딥링크 재현 범위의 경계다. — **Must** — 출처: docs/06 §6.1 (Decided)
- [ ] **집합 키 정규화 + 명시적 공집합 표식(equipmentIds 반복 키, selection=none 표식)** — 부재=무제약, 중복 제거·사전식 정렬, 빈 ID·중복 단일값 키는 형식 오류 등 세부 규칙이 확정됐다. 공집합을 미지원 메뉴가 강제 적용하지 않는 규칙도 있다. — **Must** — 출처: docs/06 §6.1 (Decided)
- [ ] **전역 지표 Context metricId+metricVersion 쌍 전파 규칙** — 버전 숫자만 남아 다른 지표로 재해석되는 공백을 막기 위해 확정된 계약이다. 완성/초기화 불변식(둘 다 있음/ID만/버전만/둘 다 없음)을 그대로 구현해야 한다. — **Must** — 출처: docs/06 §6.1 (Decided)
- [ ] **줌 vs 명시적 구간 적용 구분(초 정렬 확인 미리보기)** — 단순 차트 줌은 로컬 상태고, Brush 후 명시적 구간 적용만 URL/전역 Context로 승격한다. 미정렬 경계는 외향 정렬 미리보기로 사용자 확인을 받는다. — **Must** — 출처: docs/06 §6.1 + §11 (Decided)
- [ ] **URL 계약 버전 v + 잘못된 값 거부 + 미등록 키 보존** — 형식 오류는 clamp/보정 없이 거부하고, 미지원 v는 전체 거부, 미등록 키는 URL에 남기되 Context로 승격하지 않는다. 북마크 조회 신원 보호의 핵심이다. — **Must** — 출처: docs/06 §6.4 (Decided)
- [ ] **뒤로가기/셸 메뉴 전환 시 복원 범위(URL이 소유한 상태로 한정)** — 줌/브러시/시리즈 가시성은 복원 보장 밖이며, 셸 사이드바 전환도 Context Link helper와 같은 보존/적용 규칙을 따른다. "지원 키만 골라 쓴다"가 나머지를 지우는 것이 아니어야 한다. — **Must** — 출처: docs/06 §6.4 (Decided)
- [ ] **Context 변경 시 이전 결과 차단 + 동일 Context 재조회에만 갱신중 표시** — 늦게 도착한 이전 요청을 새 조건 결과로 채택하지 않는다. 권한/Scope 전환 시 이전 결과를 숨기고 재검증한다. — **Must** — 출처: docs/06 §11 (Decided), docs/04 로딩 권장 동작
- [ ] **Context Link helper 공통 라이브러리(destination/transferable/unsupported/permission)** — 각 메뉴가 서로의 URL 문자열을 직접 조립하지 않는다. 보존할 Context와 적용할 Context를 구분하는 공통 처리가 플랫폼 가치의 핵심이다. — **Must** — 출처: docs/06 §22 (Decided 방향)
- [ ] **대표 드릴다운 흐름 구현(사이클타임 P95 → 느린 실행 목록 → 실행 상세 → 공정 타임라인/품질 → VOC 생성)** — 이 하나의 흐름에서 지표·필터·식별자·권한·리니지·차트 요구를 함께 검증하도록 설계된 대표 시나리오다. — **Must** — 출처: docs/05 대표 분석 시나리오 (Candidate 검증 기준)
- [ ] **차트 클릭 → 필터 칩 생성 → 드릴스루(BI 스타일)** — 분석 화면의 페이지별 UI 패턴으로 정해져 있다. 클릭이 모르게 전역 필터를 바ꄐ다는 §24 안티패턴과 충돌하지 않게 명시적 액션이어야 한다. — **Should** — 출처: docs/04 생산성 분석 패턴, docs/06 §24 (Decided)
- [ ] **VOC ↔ 분석 화면 상호 링크(설비·Lot·지표로부터 VOC 생성, VOC에서 원본 화면 복귀)** — 분석 화면에는 열람 권한 범위 내 관련 VOC 수만 표시한다. VOC 생성 시 현재 Context 첨부가 커맨드 팔레트 후보에도 명시돼 있다. — **Should** — 출처: docs/04 공지·VOC 패턴, docs/06 §10
- [ ] **Breadcrumb 자동 생성(Kernel 소유)** — 메뉴마다 Breadcrumb을 수동 구현하는 것이 금지 목록에 있다. 메뉴 레지스트리에서 자동 생성돼야 한다. — **Must** — 출처: docs/06 §4 (Kernel 책임), §5 금지 목록
- [ ] **Command Palette를 통한 메뉴 탐색(Go to ..., Open recent/saved view)** — 메뉴 이동이 기본 책임이고 Entity Search/Action Command는 수요 검증 후 Deferred다. 메뉴 수 증가 대응의 플랫폼 공통 기능이다. — **Should** — 출처: docs/06 §10
- [ ] **교차 메뉴 숫자 일치 검증(동일 조건의 차트·상세 표·CSV 일치)** — 설계 검증 기준의 첫 항목이다. 지연 완료 후 재집계 반영까지 일치해야 메뉴 간 신뢰가 성립한다. — **Must** — 출처: docs/05 검증 기준 (Candidate)
- [ ] **Scope 단일 원칙 + 매 요청 서버 재검증(딥링크 전파 전제)** — scopeId는 URL에 담지만 권한 증명이 아니며 접근 불가 Scope는 조용히 대체하지 않는다. 크로스내비게이션의 보안 경계 원칙이다. — **Must** — 출처: docs/06 §6.2 (Decided)

## 4. 플랫폼 공통 기능

- [ ] **App Shell 구현(헤더·사이드바·Breadcrumb·전역 Context Bar·페이지 액션·하단 Data Trust 영역)** — 플랫폼 Kernel의 첫 책임이며 구체 배치가 docs/07에 설계돼 있다. 모든 메뉴가 이 골격 위에 올라간다. — **Must** — 출처: docs/06 §4/§7/§8, docs/07 WIREFRAME (Candidate 배치)
- [ ] **Menu Registry(선언적 등록: 식별자·그룹·권한·지원 Context·페이지 유형·선택 기능)** — 신규 메뉴 추가 시 셸 코드 수정이 없어야 한다는 최종 기준의 전제다. 코드 내부 선언으로 시작(외부 플러그인은 별개 요구). — **Must** — 출처: docs/06 §5 (Decided), docs/02
- [ ] **전역 필터 컨텍스트(기간/설비/Lot 등 메뉴 간 유지 상태)** — 여러 메뉴가 재사용하는 플랫폼 코어 기능이다. 상태 4층 분리(전역/페이지 필터/시각화 상태/영속 주석)를 지켜야 한다. — **Must** — 출처: docs/02, docs/06 §6/§11 (Decided)
- [ ] **권한/역할 관리(메뉴 단위 + 데이터 스코프, 캐시·내보내기·저장 뷰·공유 링크에 동일 적용)** — 권한은 메뉴 노출만이 아니라 조회 결과·Export·드릴스루·Context Link 전 구간에 적용된다. 권한 없음과 데이터 없음의 Empty State 구분도 필수다. — **Must** — 출처: docs/02, docs/06 §17 (Decided)
- [ ] **Data Trust 표시 표준(freshness/계산 기준시각/coverage/provisional/지표 버전/lineage)** — "숫자의 상태"가 숫자만큼 중요하며 공통 Vocabulary로 표시한다. 상세는 Popover 확장, 정상 시 한 줄 압축 패턴이 제시돼 있다. — **Must** — 출처: docs/06 §18 (Decided)
- [ ] **Loading/Empty/Error Taxonomy + 2층 응답 스키마(outcome + assessments[])** — 11개 상태 분류와 confirmed/clear/unknown 평가 구조가 확정됐다. 0건≠수집 중단이며 원인 주장은 근거 있을 때만 허용된다. — **Must** — 출처: docs/06 §19 (Decided), docs/04 상태 세분화
- [ ] **변경 감사 Audit Trail 기록 모델(who/when/before-after)** — 마스터/기준정보/지표 정의 변경 이력이며 유효기간 이력과 별개 기능이다. 공지·기준정보·VOC 화면이 공유한다. — **Must** — 출처: docs/02 플랫폼 코어
- [ ] **Toast/Confirm/Modal 인프라 + 전역 Error Boundary + Correlation ID 표시** — Kernel 책임 목록에 명시돼 있다. 오류 화면의 Query ID 제공은 사용자 지원 동선의 기본이다. — **Must** — 출처: docs/06 §4 (Decided), docs/04
- [ ] **Theme/Design Token 관리(Kernel 소유)** — 토큰의 소유자가 Kernel로 지정돼 있다. 메뉴가 토큰을 우회 정의하지 못하게 하는 것이 목적이다. — **Must** — 출처: docs/06 §4 (Decided)
- [ ] **공통 Keyboard Shortcut** — Kernel 책임 목록에 포함된다. 커맨드 팔레트 호출 등 단축키가 메뉴마다 다르면 안 된다. — **Should** — 출처: docs/06 §4 (Decided)
- [ ] **즐겨찾기/최근 메뉴(Favorite/Recent)** — Kernel 책임이자 사이드바 기능(권한 인식 노출)이다. 셸 와이어프레임 하단 배치가 Candidate로 설계돼 있다. — **Should** — 출처: docs/06 §4/§9, docs/07
- [ ] **저장된 조회조건/Saved View(savedViewToken 계약 예약)** — 단순 필터 저장이 아니라 route/Context/컬럼 상태 등을 담는 플랫폼 공통 자산이다. 기능 제공 순서는 Deferred이며 복원 시 서버 Scope 재검증이 전제다. — **Nice** — 출처: docs/02, docs/06 §21/§6.1 (savedViewToken Deferred)
- [ ] **내보내기(CSV) — 권한·범위 명시(필터 결과 vs 선택 행)** — Export scope는 명시적이고 권한 검사를 거치며 적용된 필터를 사용한다. 대규모 내보내기는 별도 작업 프로세스가 담당한다(SQL-first 역할 분담). — **Should** — 출처: DESIGN.md (Export scope 규칙), docs/03 (비동기 배치), docs/05 (Phase 2 가설에 포함)
- [ ] **공지 시스템(로그인 배너/목록 노출, 대상 메뉴·권한 스코프 타게팅)** — 별도 알림 엔진 없이 배너/목록으로 충분하다고 결정됐다. 배너 위치·노출 조건은 Open이다. — **Should** — 출처: docs/02 공지 행 (Decided 방향), docs/07 Open 표
- [ ] **알림 벨/통합 미확인 배지** — 읽음 상태·집계·권한 의미가 미정이며 필수 영역이 아니라고 명시됐다. 도입하면 읽음 모델·권한 의미 설계가 선행돼야 한다. — **Nice** — 출처: docs/07 Open 표 (별도 제안, 필수 아님)
- [ ] **OIDC 인증(day 1 라이브러리 도입)** — 사내 SSO 전환 비용을 피하기 위해 처음부터 라이브러리를 도입하라는 권장이 확정적이다. 실제 SSO 예정 여부는 Open이지만 방향은 정해져 있다. — **Must** — 출처: docs/03 인증 행 (권장), docs/05 Open (SSO 여부)
- [ ] **메뉴 활용률 분석(이벤트 수집: 메뉴 진입/Context 사용/기능 사용)** — 플랫폼 성숙에 따라 어떤 메뉴·컴포넌트를 승격하고 어떤 화면을 개선할지 데이터 근거가 필요한데 현재 설계에 관측 체계가 없다. Audit Trail과 목적이 다르고(개인 조회 이력 vs 집계 활용도) 수집 최소화·보존 한계 정의가 전제다. — **Nice** — 출처: 신규 제안
- [ ] **사용자·조직 모델(플랫폼 메타 DB)** — VOC 담당자 배정과 권한 스코프가 이 모델을 전제한다(Phase 1 전제로 명시). 사용자 관리 UI는 관리·감사 그룹에 속한다. — **Must** — 출처: docs/02 VOC 행 (Phase 1 전제 명시), docs/01 (플랫폼 메타 DB)
- [ ] **다국어 대비 문자열 외부화(번역 자체는 YAGNI)** — 다국어는 제외됐으나 문자열 외부화만은 저비용 사전 준비로 남겨뒀다. UI 문구 하드코딩을 피하는 수준으로 충분하다. — **Should** — 출처: docs/00 제외 목록 (외부화 준비 명시)

## 5. 개발 편의 (메뉴 개발을 쉽게 만드는 공통 자산)

- [ ] **Canonical Page Archetype 5종 제공(Overview/Analysis Workspace/Management/Catalog/Workflow)** — 초기 화면을 자유롭게 만들게 하지 않고 아키타입을 조합하게 한다. 새 Page Type은 기존 패턴으로 표현 불가한 근거 기록이 전제다. — **Must** — 출처: docs/06 §12 (Decided)
- [ ] **Shell Slot 결합 규칙(title/primaryAction/contextExtension/content/dataTrustSummary)** — 슬롯 외 위치에 전역 UI 직접 삽입 금지. Action·Filter·Export 위치 불일치를 막는 계약이다. — **Must** — 출처: docs/06 §8 (Decided)
- [ ] **Platform Component 스타터셋(GlobalContextBar, PageHeader, DataTrustIndicator, AnalysisChartFrame, PlatformDataTable, DetailDrawer, AuditTimeline, EmptyState, PermissionGuard, SavedViewSelector)** — 3층 컴포넌트 구조(Primitive/Platform/Domain)의 중간층이 메뉴 개발 속도를 결정한다. 첫 메뉴 구현과 함께 추출한다. — **Must** — 출처: docs/06 §13 (Decided 구조)
- [ ] **Platform Data Table Contract 구현(서버측 정렬·필터, 컬럼 resize/visibility/pin, 멀셀렉트, 가상화, 저장된 컬럼 설정)** — Platform은 interaction/로딩/선택 모델을, Domain은 컬럼 정의/셀 의미를 소유하는 경계가 정해져 있다. 브라우저에 전체 데이터를 내려보내지 않는다. — **Must** — 출처: docs/06 §15 (Decided), docs/04 (TanStack Table Candidate)
- [ ] **Analysis Chart Frame + 공통 Toolbar 어휘(Zoom/Brush/Reset/Compare/Annotate/Export/More)** — 플랫폼은 차트의 비즈니스 정의가 아니라 Frame과 Interaction Contract를 소유한다. 차트마다 도구 아이콘·배치가 달라지는 것을 막는다. — **Must** — 출처: docs/06 §16 (Decided)
- [ ] **Detail Surface Contract(Drawer/Modal/Full Page 사용 규칙)** — 큰 Form을 Modal에 넣지 않고, 딥링크 대상 상세는 Full Page로 하는 등 규칙이 확정됐다. 메뉴별 상세 화면 파편화를 막는다. — **Must** — 출처: docs/06 §20 (Decided)
- [ ] **공개 스키마 정의 + codegen(OpenAPI/JSON Schema, 클라이언트 라우터·서버 검증이 같은 산출물 소비)** — URL·JSON 공개 계약을 Kernel이 소유하고 양쪽이 같은 정의를 소비하도록 구현 형식이 Candidate로 지정돼 있다. 수동 이중 정의는 계약 어긋남의 주 원인이 된다. — **Should** — 출처: docs/06 §6.1 (구현 형식 Candidate)
- [ ] **fixture 기반 뷰·계약 스냅샷 테스트(파서 스키마 버전 상승 시 실제 dump로 구동)** — "테스트 없는 View 계층은 흡수한다는 선언일 뿐"이라고 명시돼 있다. 파서 컬럼 변경이 플랫폼을 조용히 깨는 것을 막는 유일한 안전망이다. — **Must** — 출처: docs/01 대응 절 (Decided 방향)
- [ ] **개발용 파서 dump fixture/목데이터 제너레이터** — 스냅샷 테스트와 화면 개발 모두 실제 데이터 형태(dump 기반)가 필요하다. 생성 도구가 없으면 각 메뉴 개발자가 손으로 흉내 낸 데이터로 검증하게 된다. — **Should** — 출처: 신규 제안 (docs/01의 fixture 요구를 개발 편의로 확장)
- [ ] **공통 차트 타입 바인딩 세트(대용량 시계열, 분포/히스토그램, 점유 스택, 파이프라인 진행, 큐 상태)** — 차트 팔레트·인코딩 규칙은 있지만 재사용 가능한 차트 바인딩 세트는 아직 없다. 2~3개 분석 화면에서 반복이 확인되면 Platform Component로 승격한다(Premature Platformization 방지). — **Should** — 출처: docs/06 §16 + DESIGN.md 차트 바인딩 (승격은 §14 규칙 준수)
- [ ] **도식(다이어그램) 공통 컴포넌트(유효구간 타임라인, Wafer Journey, 공정 타임라인, VOC 상태 타임라인)** — Domain Component 예시로 열거된 타임라인류는 여러 메뉴에서 같은 시각 언어를 필요로 한다. 범용 위젯 프레임워크는 반복 확인 전까지 Deferred다. — **Should** — 출처: docs/06 §13 (Domain Component 예시), docs/02 (위젯 프레임워크 Phase 4 후순위)
- [ ] **메뉴 스캐폴드/코드 생성 도구(레지스트리 등록+아키타입 템플릿+권한/Context 선언 골격)** — "새 메뉴 추가 시 플랫폼 코드를 계속 고쳐야 하면 실패"라는 기준의 역방향 편의다. 다만 실제 메뉴 2~3개 경험 전 도구화는 과도한 선공통화일 수 있어 수요 확인 후 도입한다. — **Nice** — 출처: 신규 제안 (docs/06 §32 기준의 개발 편의 확장)
- [ ] **컴포넌트 갤러리(Storybook 등, 토큰·상태·Empty/Error 시각 포함)** — 디자인 계약의 시각적 준수를 리뷰 없이 확인하게 하는 기준점이 필요하다. 특히 11개 상태 taxonomy의 시각 언어를 팀이 일관되게 볼 통로가 없다. — **Nice** — 출처: 신규 제안
- [ ] **메뉴 PR 거버넌스 체크리스트 운영(Platform Contract/Reuse/Data Trust/Interaction 4개 리뷰 축)** — "예쁜 UI"가 아니라 계약 준수를 리뷰하는 기준이 이미 정의돼 있다. PR 템플릿 등으로 형상화하면 새 기여자도 계약을 지킨다. — **Should** — 출처: docs/06 §28 (Decided)
- [ ] **Platform-first Definition of Done 적용(Domain Done + Platform Done 2층 완료 기준)** — Domain Done만 만족하면 플랫폼 관점 완료가 아니라는 기준이 확정됐다. 작업 완료 판정·리뷰에 직접 적용돼야 한다. — **Must** — 출처: docs/06 §29 (Decided)
- [ ] **저장된 조회조건/최근 이력 공통 저장소** — 여러 메뉴가 같은 저장 메커니즘을 쓰도록 플랫폼 코어 기능으로 지정돼 있다. 메뉴별 로컬스토리지 구현을 방지한다. — **Should** — 출처: docs/02 플랫폼 코어 (저장된 조회조건/즐겨찾기/최근 이력)

## 6. 기타 제안 (위 5개 범위 외)

- [ ] **성능 UX 계약 구현(서버 집계/다운샘플링, 대형 테이블 가상화, timeout/취소, stale 표시, route 전환 중 Context 혼동 방지)** — 원본 로그 전체를 브라우저로 보내고 DataZoom으로 해결하는 방식이 명시적으로 금지됐다. 화면 해상도용 다운샘플링과 지표 계산의 구분도 필요하다. — **Must** — 출처: docs/06 §27 (Decided), docs/01 (확장성), docs/04
- [ ] **조회량 제한·SQL timeout·장기 작업 비동기 실행** — 한 요청이 읽는 행 수와 반환하는 점 수가 확장성을 결정한다고 명시됐다. 초기 설계에 포함할 것이 요구돼 있다. — **Must** — 출처: docs/01 (확장성 절)
- [ ] **mart 재계산 트리거 4종(지연 완료 watermark 감지, 마스터 소급 정정, 설비 재분류, 지표 정의 변경) + 계산 세대 관리** — 여러 mart를 읽는 화면이 서로 다른 갱신 세대를 섞지 않도록 계산 기준시각을 함께 관리한다. pg_cron은 스케줄일 뿐 정합성을 보장하지 않는다. — **Must** — 출처: docs/01 (mart 재계산 트리거, Decided 방향)
- [ ] **집계 가능성 규칙 강제(비율 지표는 분자·분모 각각 합산, P95의 평균 금지)** — 잘못된 재집계는 지표 신뢰도를 직접 훼손한다. 지표 스키마/지표관리 메뉴가 이 규칙을 강제하도록 설계돼 있다. — **Must** — 출처: docs/01 (집계 가능성 계약), docs/02 지표관리 행
- [ ] **지연 완료 정책 메커니즘(lateArrivalAutoHorizon, 진행 경계 R·창 길이 H, 창 밖 정정 후보 보존)** — 메커니즘이 Decided로 확정됐고 구체 숫자·필드명은 Open이다. 설정 없이 자동 재집계를 시작하지 않는 등의 운영 규칙이 함께 정의됐다. — **Must** — 출처: docs/05 지연 완료 절 (Decided, 숫자는 Open)
- [ ] **실시간성 기본 정책(폴링 + 세대 기반 캐시 재검증)** — 원천 watermark 이동을 mart 재집계 완료와 동일시하지 않는다. 웹소켓/SSE는 문서화된 제품 요구가 확인될 때 재평가한다. — **Should** — 출처: docs/05 실시간성 절 (Decided — 메커니즘)
- [ ] **재현성 계약(딥링크는 조회조건·지표 버전 재현만 보장, 결과에 계산 기준시각 표시)** — "같은 숫자의 재현"은 보장하지 않는다는 경계가 핵심이다. 모든 결과 화면의 기본 표기가 된다. — **Must** — 출처: docs/03 재현성 계약, docs/06 §6.1 (Decided)
- [ ] **시간 계약 구현(wall-clock 보존, [from,to) half-open, 날짜-only 변환, TZ 미확인 fallback, 시간역 병합 가드, defaultRangeTo)** — naive wall-clock을 임의 UTC 변환하지 않는 것이 2차 리뷰가 잡은 최대 실수 방지 항목이다. 병합 가드는 서버 소유 assertion이 있을 때만 허용한다. — **Must** — 출처: docs/03 시간 계약, docs/06 §6.3 (Decided)
- [ ] **상태 판정 근거 소유자 API 계약(어느 서비스가 수집안됨/지연/0건을 확정하는지)** — 근거가 없으면 "원인 미확인"으로 남기는 규칙이 있다. §19 assessments의 statusSource/observedAt이 이 소유자를 전제한다. — **Should** — 출처: docs/03 (근거 소유자 명시 요구), docs/06 §19
- [ ] **파서 DB 접근 정책(같은 인스턴스·read-only 역할·플랫폼 전용 스키마, API는 원본 테이블 직접 조회 금지)** — 소비 계층(view/mart) 경유가 아키텍처 원칙이다. replica/분리는 실제 요구 확인 시에만 평가한다. — **Must** — 출처: docs/05 (Decided), docs/01, docs/03
- [ ] **데이터 볼륨/보존 기간 정책 수립** — Open Question으로 등록돼 있으나 조회 제한·마이그레이션·다운샘플링 설계가 이 숫자에 의존한다. 정책 결정 없이 성능 계약의 매개변수를 확정할 수 없다. — **Should** — 출처: docs/05 Open Questions (결정 필요)
- [ ] **백업/복구 전략(플랫폼 메타 DB·mart)** — 문서에 언급이 없다. 감사·지표 버전 이력이 메타 DB에 단일 저장되므로 유실 시 복구 불가능한 자산이 된다. — **Nice** — 출처: 신규 제안
- [ ] **의존성 라이선스/유료 기능 검토 프로세스(AG Grid Enterprise 기능 경계 등)** — AG Grid는 피벗·행그룹화·서버사이드 Row Model이 전부 Enterprise 유료라는 확인된 제약이 있다. 도입 전 실제 로그 cardinality·CJK POC가 필요하다고 기록돼 있다. — **Should** — 출처: docs/04 (AG Grid 유료 경계 + POC 요구)
- [ ] **E2E 검증 자동화(딥링크 왕복, 권한 변경 후 비노출, 지연 완료 후 일치, 유효구간 경계 귀속, 동일 조건 차트·표·CSV 일치)** — 5개 검증 기준이 Candidate로 정의돼 있으나 이를 실행하는 회귀 스트레치 장치가 없다. 수동 검증으로는 계약이 지속 준수되는지 확인할 수 없다. — **Should** — 출처: docs/05 검증 기준 (기준 존재) + 신규 제안(자동화)
- [ ] **브라우저 지원 매트릭스 정의** — Desktop-first·Canvas 차트·대용량 가상화를 전제로 지원 브라우저/버전이 정의돼 있지 않다. ECharts 렌더링 성능·폰트 스택 검증 대상이 브라우저에 의존한다. — **Should** — 출처: 신규 제안
- [ ] **API 오류 코드·사용자 메시지 카탈로그(outcome enum 기반)** — outcome/too_large/timeout 등 배타값은 확정됐으나 사용자Facing 메시지·안내 문구의 단일 소스가 없다. 메뉴마다 오류 문구가 갈라지는 것을 막는다. — **Should** — 출처: 신규 제안 (docs/06 §19 enum은 Decided, 메시지 체계는 미정)
- [ ] **멀티테넌시 대비 행 스코핑(site/plant 차원 내장, RLS는 요구 시)** — 초기엔 단일 테넌트+행 스코핑이 가장 싼 미래호환 설계로 결론이 나 있다. 모든 분석 grain에 차원을 넣는 작업은 나중에 넣을 수 없으므로 초기 스키마에 반영해야 한다. — **Should** — 출처: docs/01 (멀티테넌시/확장성)

---

## Open Questions

확신이 없거나 문서가 미결로 남긴 항목. 구현 착수 전 답이 필요한 순서로 정렬.

1. **셸 치수 불일치**: docs/06 §7 Baseline(사이드바 240px·탑 헤더 56px·컨텍스트 바 48px) vs DESIGN.md canonical(사이드바 270px·탑 바 54px). 둘 다 Candidate라 우열이 없다 — 어느 쪽을 확정할지 결정 필요. (DESIGN.md는 "docs가 치수를 고정하지 않는다"고 서술했지만 docs/06 §7에 권장 Baseline 수치가 실제로 존재한다.)
2. **테이블 밀도 불일치**: docs/06 §15(행 40px·셀 패딩 12px) vs DESIGN.md table-density(최소 32px·기준 화면 25px는 compact 목표). 기본 밀도 확정 필요.
3. **백엔드 언어/스택**: FastAPI 권장이나 팀 언어(C#/TS)에 따라 ASP.NET Core/NestJS로 확정 가능 — docs/05 Open.
4. **인증**: 사내 SSO 예정 여부(OIDC day 1 권장은 확정적) — docs/05 Open.
5. **멀티테넌시/다중 사업장 지원 여부**: 초기 행 스코핑으로 충분한지 — docs/05 Open.
6. **배포 환경(사내 서버 vs 클라우드), 동시 사용자 규모, 데이터 볼륨/보존 기간** — docs/05 Open. 성능 계약 매개변수의 전제.
7. **Scope 계층(사이트→공장→라인), 복수 Scope 선택, 상속 규칙** — docs/06 §6.2 Open. 셸은 고정 3단 선택기를 요구하지 않는다.
8. **사업장별 원천 시간대 실제 값·다중 사업장 "같은 날짜" 의미**: fallback 메커니즘은 Decided, 실제 매핑 값은 미정 — docs/06 §6.3 Open, docs/05 Open.
9. **지연 완료 허용 시간의 구체 숫자**(lateArrivalAutoHorizon/H 값) — docs/05 Open.
10. **공지 배너 위치·노출 조건**: docs/07 Open. 권한 스코프 타게팅과 배너 우선순위 미정.
11. **알림 벨/통합 배지의 읽음 상태·집계·권한 의미** — docs/07 Open(필수 요소 아님).
12. **Date preset 의미(7D/30D/90D가 rolling 기간인지 역일 포함인지)** — DESIGN.md Open. URL 물질화 전 결정 필요.
13. **다크모드 수요 여부** — DESIGN.md Open(미설계, 자체 패스 필요).
14. **아이콘 라이브러리 최종 선택** — DESIGN.md Open(Lucide Candidate).
15. **ECharts vs Plotly 최종 확정**: 다중 차트 브러시 동기화 우위는 "확정 사실이 아니라 POC로 검증할 가설" — docs/04. POC 결과 전 확정 불가.
16. **메뉴 활용률 분석의 프라이버시/보존 경계**(신규 제안 관련): 수집 항목 최소화, 개인 조회 이력과의 구분, 보존 기간, 익명화 수준 — 미정.
17. **수집 상태 판정 서비스의 소유자·구현 주체**: docs/03이 "상태마다 판정 근거의 소유자를 API 계약에 명시"를 요구하나 실제 서비스는 미정. 모니터링 메뉴의 전제.
18. **CJK 폰트 선택·라이선스(셀프호스팅 여부)**: 신규 제안 관련 — Inter는 한글 미지원이므로 폴백 폰트가 밀도·행 높이에 영향. 폰트 결정과 행 높이 검증의 순서 의존.
19. **보조기술 사용자 실존 여부**: §26 기준은 Decided이나 리소스 투입 우선순위(차트 키보드 구간 선택 등)는 실사용자 확인 전 조정 여지 있음 — 불확실.
20. **VOC 열람 권한과 분석 권한의 구체 스코프 모델**: "별도 권한 규칙 필요"까지만 Decided(docs/02), 세부 모델 미정.
