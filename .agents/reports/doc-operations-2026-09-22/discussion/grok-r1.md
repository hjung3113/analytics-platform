# 문서 운영체제 제안 — Grok R1

작성: 2026-09-22. 참가자: Grok 4.6. 상태: **제안만**. 원본 문서·코드·서브모듈은 변경하지 않았다.

기준: HEAD `2d6fe5ad9f9d610e45ba028930f7c2effdad9d4a` (확인). 작업 트리는 이 보고서 디렉터리만 미추적. FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`. 공유 소스 해시는 `source-snapshot.json`. 웹 조사 없음. 다른 신규 참가자 보고서는 읽지 않음(`discussion/`에 `root-r1.md`가 보였으나 열지 않음).

역사 감사(`.agents/reports/docstructure-grok.md`, `docstructure-codex-astra.md`, 2026-09-21)는 **단서**로만 썼다. 아래 소유권·충돌은 현재 원문으로 재확인했다. 감사 이후 고친 항목은 별도로 표시한다.

---

## 0. 이 제안의 한 줄

필요한 운영체제는 새 폴더·ID·manifest·RAG가 아니라, **이미 있는 파일 위에 섹션 단위 권위/상태/영향 표를 고정하고, 이중 원본과 stale 상태 태그만 막는 것**이다. 00–07 경로와 06의 전역 UX 권위는 유지한다.

---

## 1. 실제 문제, 강점, 경계

### 1.1 이미 맞는 경계 (유지)

| 경계 | 원문 | 왜 충분한가 |
| --- | --- | --- |
| 제품 목적은 Kernel이지 메뉴 전수 구현이 아님 | `AGENTS.md` L3–16, `docs/06` §1 L20–34, §29 | Platform Done / Domain Done 분리, Premature Platformization 금지 |
| 06이 전역 UX/Context/URL/Scope/IA/Extension 원본 | `docs/INDEX.md` L38–40, `docs/06` L7–9, `AGENTS.md` L9 | 역할 진입점도 06을 프론트 작업의 첫 문서로 둔다 |
| 도메인 catalog ≠ navigation IA | `docs/02` L28–30, `docs/06` §9 L351–366 | 6도메인 / 7그룹을 맞추지 말라는 문장이 이미 있다 |
| 07은 06을 소비 | `docs/07` L3–5, L111, L126; `docs/06` §31 | 화면 배치 원본을 06에서 떼려는 시도는 이미 거부됨 |
| Decided ≠ 구현 완료 | `docs/06` L11, `docs/05` L20, `docs/INDEX.md` L3 | 설계 상태와 납품 증거를 문장이 구분한다 |
| Research ≠ 채택 | `docs/INDEX.md` L44–48, `docs/research/…/README.md` L3, `docs/integration/repository-ideas.md` L3–5, `component-contract-candidates.md` L3 | 조사 묶음을 전역 계약으로 쓰지 말라는 선언이 반복됨 |
| 리뷰 합의록 ≠ 원본 | `docs/INDEX.md` L36, `docs/reviews/2026-09-18-…grilling.md` L7 | 그릴링 결과는 06/05에 승격된 뒤에만 규범 |
| FeedbackOps / parser 독립 | `AGENTS.md` L22–27, `docs/00` L7, `docs/01` L19–23, `docs/integration/repository-layout.md` L5–25, FeedbackOps `AGENTS.md` L15–24 | 서브모듈 내부 “Prototype is the spec”은 **그 제품**의 규칙이며 플랫폼 06을 대체하지 않음 |
| `.agents/`는 tooling | `docs/INDEX.md` L40, `.agents/README.md` L3, L31 | 외부 `design-md` 74종은 제품 IA/권한/Scope를 덮어쓰지 않음 |
| 파일명 00–07 유지 | `docs/05` L3 | 참조 안정성을 이미 이유로 적었다 |

### 1.2 현재 소스에서 재확인한 문제

문제는 문서 개수가 아니라 **같은 규칙의 원본이 둘 이상**이고, **섹션 상태가 파일 안에서 갈라지며**, **탐색 지도가 실제 권위 파일을 빠뜨린다**.

**A. 탐색 지도가 불완전하다**

- `docs/INDEX.md` 문서 목록(L19–28)과 소유권(L38–40)에 루트 `DESIGN.md`, `PLATFORM_REQUIREMENTS.md`, `HANDOFF.md`, `AGENTS.md`가 없다. 역할 표는 00–07만 가리킨다.
- 같은 INDEX는 연구/통합/레퍼런스를 올바르게 Candidate로 분류한다(L44–50). 빠진 것은 연구물이 아니라 **시각 canonical과 작업 체크리스트**다.
- `docs/integration/repository-layout.md` L15는 DESIGN/REQUIREMENTS를 “기존 플랫폼 디자인 및 요구사항 자료”로만 적고, 06 vs DESIGN의 값 원본 관계를 말하지 않는다.
- 루트 `README.md` L3은 제품을 설비관리·기준정보·생산성·지표·공지·VOC 나열로 열고, Kernel 우선은 `AGENTS.md`/`06`에만 있다. 신규 합류자가 README만 보면 메뉴 카탈로그가 목적처럼 읽힌다.

**B. 이중 원본 (행동이 갈라지는 지점만)**

| 주제 | 원본이어야 할 곳 | 지금 두 번째 본문 | 증거 |
| --- | --- | --- | --- |
| URL 직렬화·충돌 | `06` §6.1/§6.4 Decided | `07` L105가 아직 “§6.4의 **Open** 결정”; `04` L48이 “Open 결정을 해결한 뒤 구현” | `06` L260–272는 우선순위·`v`·형식오류·복원을 Decided. `05` L12도 동일. 07 표 L135는 이미 `Decided(메커니즘)` — **같은 파일 안에서 표와 본문이 불일치** |
| 시간 메커니즘 | `06` §6.3 | `03` L26–31이 “Phase 0에서 최소한 다음을 결정한다”며 half-open·TZ·같은 날짜를 미결 묶음으로 재제시 | `06` L242–250은 경계/날짜-only/미확인 fallback을 Decided, TZ **값**만 Open. 03은 원천 wall-clock 소유로는 맞지만 결정 범위를 06 이전 언어로 되돌린다 |
| 지연완료 `R`/`H` | 메커니즘은 05 본문 + 06이 인용 | `05` L57–61이 유일한 상세 알고리즘, `06` L256이 05를 가리킴 | 05를 “인덱스만”으로 비우면 06이 빈 포인터가 된다. 역사 감사가 05→01 이동을 말한 이유. **지금은 05가 상태표이자 계약 본문** |
| 셸 치수 270/54, 행 32 | `DESIGN.md` 토큰, `06` §7/§15는 인용 | `DESIGN.md` Open Decisions L941–942가 “06/07은 치수를 고정하지 않는다”고 **옛 설명**을 현재형으로 남김 | `06` L16, L301–314, L630–638, `05` L14는 2026-09-21 Decided. DESIGN L942는 자기 결정 로그가 현행 규범을 배신 |
| UI 라이브러리 | `04` Candidate, `05` Candidate | `06` §13 L534 “shadcn/ui + Base UI를 **기반으로 한다**” | `04` L17은 비교 후보, `DESIGN.md` L934는 Prototype 단계 Open, `SYNTHESIS.md` L11·L33도 상태 정렬이 필요하다고 적음. **연구 합의가 채택이 아니다** |
| 토큰 스케일 | 값=DESIGN, 소비 의무=06 | `06` §23이 radius/spacing/type 숫자를 자체 정의하고 DESIGN을 **링크하지 않음** | `06` L910–941. 역방향만 있다(`DESIGN.md` L604, L941). 역사 Astra 감사 L129와 현재 일치 |
| 상태 택소노미 | `06` §19 | `04` L68–79가 원인 목록을 다시 씀; DESIGN L879–887이 행동 규칙을 재서술 | 04 L70은 06을 가리키므로 완전한 반란은 아님. 다만 원인 목록이 04에 남아 에이전트가 04를 원본으로 고치기 쉽다 |
| Open 질문 대장 | `05` | `PLATFORM_REQUIREMENTS.md` L162–180 15항; `HANDOFF.md` L51–67이 둘을 **함께 갱신**하라고 고정 | REQUIREMENTS L11은 구현 승인이 아니라고 선언. 그러나 HANDOFF가 이중 기록을 운영 규칙으로 만든다 |
| Kernel 기능 목록 | `06` §4/§5 | `02` L3–15가 레지스트리·전역필터·딥링크·위젯·권한·Audit을 재정의 | 02 L9는 상세를 06에 넘기지만 Phase 1에 딥링크를 고정하라고 일정 언어를 섞는다 |
| 내비게이션 그룹 | `06` §9 7그룹 | `DESIGN.md` L763이 스크린샷 6그룹을 “§9와 같다”고 기술 | **같은 파일** L640–641은 생산 내비는 7그룹이며 스크린샷 이름을 쓰지 말라고 정정. 정정과 본문이 공존 |

**C. 섹션 단위 혼합 상태 — 버그가 아니라 계약의 일부인 것 vs stale인 것**

유지해야 하는 혼합:

- `06` 파일 머리 `Status: Draft`(L3) + 절별 Decided/Candidate/Open. 문서 전체를 Decided로 올리면 Open domain(Scope 계층, TZ 값)이 사라진다.
- `06` §6.2 “Decided / Open”, §6.3 “Decided; TZ 값·같은 날짜는 Open”, §6.4 “Decided; 필드명·enum은 Candidate”, §19 “스키마 형태 Decided; 필드명 Candidate”.
- `05` L12 vs L18: URL 메커니즘 Decided, TZ 값 Open.
- `07` 표 L134–136: 배치 Candidate, 계층 Open, 메커니즘 Decided / 값 Open.

stale로 봐야 하는 혼합:

- `07` L105 vs L135 (위).
- `04` L48 (위).
- `DESIGN.md` L942 vs `06` §7.
- `03` L26 “Phase 0에서 결정” vs `05` L63 Phase 표는 non-authoritative.
- `02` L9, L21, L25–26의 Phase 1/2/4 배치. INDEX L40은 Phase 0–4를 가설이라고 했는데 catalog가 일정처럼 읽힌다.
- `01` L59 “Phase 0에서 필드 원천 소유자 구분” — 내용은 Open에 가깝고, 일정 번호가 권위를 빌려 쓴다.

**D. 설계 결정 ≠ 구현/검증 증거가 문장으로는 있으나, 산출물 종류가 섞인다**

- 플랫폼 런타임 코드 없음: `docs/INDEX.md` L3. `PLATFORM_REQUIREMENTS.md` 체크박스는 “구축 시 필요한 작업”이지 완료가 아님(L11).
- `07` L126: 시나리오 표는 “런타임 테스트 통과 기록이 아니다”.
- `05` L22–24: 대표 시나리오 검증 기준은 Candidate이며 현재 POC를 요구하지 않는다.
- 그런데 `PLATFORM_REQUIREMENTS.md`는 `[3/3] Must`로 신규 메뉴(사용자·조직 디렉터리, 메뉴 활용률, 시간역 관리 화면 등 L72–79)를 기존 계약처럼 나열한다. L189는 문서에 없던 항목을 모델이 제안했다고 인정. **합의 횟수가 채택이 아니다.**
- `DESIGN.md`는 스킬 step 5 시각 산출물(L561–567)인데 레퍼런스 대시보드 업무 시나리오(L616–623), URL 물질화(L808–813), 알림 전체 화면 가정(L776)을 포함한다. 07 L86은 알림 벨을 필수 영역에 넣지 않는다.

**E. 외부/독립 경계가 문서 인용에서 흔들린다**

- `docs/00` L15: 파서 `docs/23`을 “이 플랫폼 설계의 authoritative 입력”으로 삼는다. 그 파일은 **이 저장소에 없다**. `01` L37은 `docs/23` 일부가 stale이고 `docs/11`/`09`/`22`를 보라고 한다. 원본 재확인이 필요한 외부 의존이다.
- `01` mermaid L11–16: 프론트를 `React+TS+Tailwind`로 그리고 공지/VOC 노드가 없다. `04` L15는 같은 스택을 Candidate로 둔다. 구조도가 채택처럼 읽힌다.
- `docs/references/standard-log-lifecycle/README.md` L1–3, L24–28: Reference only, 원본 5개 내비 복사 금지. 그러나 L32–37은 “모델 표준 로그”를 설비관리 하위 Candidate 시안으로 넣는다. 참고 사본이 메뉴 제안 통로가 된다.
- FeedbackOps `DESIGN.md`/`docs/frontend/*`는 다른 제품의 토큰 시드다. 루트 `DESIGN.md`와 이름이 같다. 에이전트가 서브모듈 DESIGN을 플랫폼 시각 원본으로 읽을 위험이 있다. `repository-layout.md` L64–66이 진입점을 나누지만 INDEX는 이를 역할 표에 넣지 않는다.

### 1.3 역사 감사 중 현재 원문에서 **거짓이 된** 단서 (보존)

2026-09-21 감사는 이후 수정으로 일부가 닫혔다. 운영체제가 “감사 보고서의 할 일 목록”을 재실행하면 이미 고친 것을 다시 연다.

| 당시 주장 | 현재 |
| --- | --- |
| 와이어프레임 `SKILL.md`가 루트 DESIGN 부재를 단정 | 현재 L76: “Root `DESIGN.md` exists and is the visual source of truth” |
| `00` L23이 정정을 `04` 딥링크 절로 안내 | 현재 L23: `06` §6.3 Decided. `rg`로 “딥링크 절” 0건 |
| `03` 재현성이 `04` 딥링크 절을 가리킴 | 현재 L22: `06` §6.1 |
| `06` 머리말이 §7을 Candidate로 분류 | 현재 L16: §7/§15 Decided, 값 원본 DESIGN |
| REQUIREMENTS Open Q1이 치수를 다시 물음 | 현재 L166 취소선 + §0 체크 완료 |
| `07` Open 표가 URL/시간을 Open으로 둠 | 표 L135–136은 갱신됨. **본문 L105만 남음** |

Astra 감사의 반례도 유효하다: “04/06/DESIGN이 같은 픽셀 표를 세 번 정의”는 과장이다. 04에는 치수 표가 없다. 픽셀 이중 원본은 **06 §7/§15/§23 ↔ DESIGN**이다.

### 1.4 범위 밖 (이 운영체제가 제품 결정을 대신하면 안 되는 것)

백엔드 언어, SSO, 멀티테넌시, TZ 실제 값, Scope 계층, `H`/`Δ` 숫자, ECharts 확정, FeedbackOps 편입, FileGateway 연동, Fastify vs FastAPI. `SYNTHESIS.md` L7–11의 Fastify 우선 검증은 Research/Candidate다. 모델 동의를 채택으로 올리지 않는다.

---

## 2. 권고 구조와 현실적 대안

폴더 재배치를 기본값으로 두지 않는다. 새 번호 문서(`08_…`)도 기본값이 아니다.

### 2.1 권고: 파일은 유지, 운영 층만 추가

네 층만 구분한다. 층은 디렉터리가 아니라 **역할**이다.

```text
A. 권위 원본     규칙이 바뀌는 곳. 한 주제에 하나.
B. 상태 인덱스   Decided/Candidate/Open/Deferred + 원본 포인터. 본문 복제 금지.
C. 소비/예시     원본을 화면에 적용하거나 후보를 비교. 재정의 금지.
D. 연구/역사/도구 채택 전 재료, 합의록, 에이전트 스킬. 인용해도 승격 아님.
```

현재 파일을 층에 올리면:

| 층 | 파일 | 넣는 것 | 넣지 않는 것 |
| --- | --- | --- | --- |
| A | `docs/06` | Kernel, Extension, Context/URL/Scope, IA, Archetype, 승격, Data Trust, 권한 UX, §19, Governance, DoD | hex/px 레시피, 라이브러리 채택 단정, Phase 일정, 레퍼런스 대시보드 |
| A | `docs/01` | view/mart, 다섯 버전, grain, 재계산 트리거, 마스터 필드 원천, 집계 가능성 | URL 직렬화, 픽셀, React 확정 |
| A | `docs/03` | 스택 Candidate, SQL-first 역할, **원천** wall-clock·statusSource 소유 | URL 메커니즘 재결정, Phase 0 일정 |
| A | 루트 `DESIGN.md` | 토큰 YAML, 컴포넌트 시각, 270/54/32, 인터랙션 **페인트** | 메뉴 IA, URL 규칙, 권한, 미등록 화면의 업무 의미 |
| B | `docs/INDEX.md` | 역할 진입 + **권위 행렬** + 변경 영향 (아래 §4) | 리뷰 경위, Must 체크리스트 |
| B | `docs/05` | 상태 한 줄 + 원본 경로/절 + 날짜. Open 질문 | 장기적으로는 알고리즘 전문. **지금은 R/H 본문이 여기 있으므로 이동은 2단계** |
| C | `docs/00` | 목적, 범위, YAGNI | 교차리뷰 회의록(역사로 내려도 됨, 필수는 아님) |
| C | `docs/02` | 6도메인 capability와 데이터 의미, 06 소비 의존 | Kernel 재정의, Phase 배치, 7그룹 재나열 |
| C | `docs/04` | 프론트 후보, SaaS 리서치, 바인딩 비교 | 전역 계약 재작성, “Open이 아직 안 닫힘” stale |
| C | `docs/07` | App Shell USER TASK/배치/시나리오 | 전역 Open 대장, 도메인 메뉴 원본 |
| C | 화면 스펙(미래) | 스킬 산출물, 06/DESIGN 소비 | 새 전역 키 발명 |
| D | `docs/reviews/` | 그릴링/인터뷰 합의록 | 구현 검증 인용 |
| D | `docs/research/`, `docs/integration/*` (layout 제외) | Candidate, 게이트 질문 | 06/01/03 본문 덮어쓰기 |
| D | `PLATFORM_REQUIREMENTS.md` | 구축 백로그. 각 줄이 05 ID/원본 절을 가리킴 | 두 번째 Open 대장, `[N/3]`을 Decided로 읽기 |
| D | `HANDOFF.md` | 세션 연속성. Git 상태 대체 아님(자기 선언 L7) | 영구 계약, 05+REQUIREMENTS 이중 갱신 의무 |
| D | `.agents/` | 스킬·명령·외부 레퍼런스·보고서 | 제품 계약 |
| 독립 | `products/feedbackops/` | 그 제품 AGENTS/ADR/프로토타입 | 플랫폼 06/DESIGN |
| 독립 | parser 레포 | `docs/23` 등 | 이 레포 사본이 없음 — 인용 시 커밋 핀 필요 |
| 참고 사본 | `docs/references/standard-log-lifecycle/` | 고정 커밋 Markdown | 최상위 메뉴·토큰 대체 |

`docs/integration/repository-layout.md`는 D가 아니라 **저장소 운영 원본**(서브모듈 절차)이다. 제품 UX 원본이 아니라는 점만 구분한다.

### 2.2 현실적 대안 (더 작음)

권위 행렬과 파일 이동을 하지 않고, 아래만 한다.

1. INDEX 목록에 DESIGN / REQUIREMENTS / HANDOFF / AGENTS를 넣고 한 줄 역할만 적는다.
2. stale 네 곳만 고친다: `07` L105, `04` L48, `DESIGN.md` L942, `03` L26의 Phase 0 범위.
3. HANDOFF에서 “05와 REQUIREMENTS를 함께 반영”을 제거하고, REQUIREMENTS는 05 포인터 소비만 한다고 적는다.

이 대안은 이중 원본 본문(`05` 지연완료, `06` §23 숫자, `02` Kernel 목록)을 남긴다. **구현 착수 전에 에이전트가 06과 05를 동시에 고치기 시작하면** 권고안(§2.1)으로 올라간다. 지금은 대안만으로도 다섯 과제 중 3개(새 메뉴, URL 변경, 동시 편집)의 오탐을 줄인다.

### 2.3 하지 않는 것

- 00–07 파일명 변경, `docs/platform/` 이동 (`repository-layout.md` L7이 이번 연결에서 하지 않는다고 이미 적음).
- 토큰 JSON/codegen, RAG 인덱스, 전 문서 frontmatter ID 의무화 — 런타임 코드가 없는 상태에서 유지비가 규칙 자체보다 크다.
- 04·06·DESIGN 병합. 독자가 겹쳐도 변경 이유가 다르다 (Astra 감사 L102와 동의).
- 역사 보고서(`.agents/reports/requirements-*.md`, 09-21 감사)를 새 값으로 재작성.
- FeedbackOps 문서 OS(프로토타입=스펙)를 플랫폼에 수입.

### 2.4 역사 감사가 제안한 큰 이동과의 차이

Grok/Astra 09-21 감사는 DESIGN 레퍼런스 대시보드 분리, 05 메커니즘의 01 이관, 00 리뷰 로그 이동을 권했다. 그 방향은 단일 책임에는 맞다. 이 운영체제 제안은 **그 이동을 전제하지 않는다.** 이동은 “해당 원본을 실제로 바꿔야 하는 작업이 생겼을 때”의 산출물이지, OS 설치 비용이 아니다. 05→01 이동은 `06` L256 역의존을 같은 커밋에서 고쳐야 한다.

---

## 3. 소유권, 섹션 상태 vs 납품 증거, 원본/요약/예시

### 3.1 권위 행렬 (INDEX에 넣을 내용의 초안)

상태 약어: D=Decided 설계, C=Candidate, O=Open, Def=Deferred. **어느 것도 코드 존재를 뜻하지 않는다.**

| 주제 | 원본 (A) | 상태 인덱스 (B) | 소비/예시 (C) | 연구/역사 (D) | 지금 섹션 상태 | 납품 증거 |
| --- | --- | --- | --- | --- | --- | --- |
| Kernel 책임·금지 | 06 §4–5 | 05 L9 | 02는 “필요 목록”만, 07 슬롯 | — | D | 없음 (코드 없음) |
| Menu Extension 선언 | 06 §5 | 05 | 미래 메뉴 스펙 | research 01 Kernel | D, 필드명 C | 없음 |
| 식별자·URL 소유 | 06 §6.1 | 05 L12 | 07 시나리오, 04 라우터는 소비자 | grilling §1 | D, 공개형식 C | 없음 |
| Scope 단일 `scopeId` / 재검증 | 06 §6.2 | 05 L18 | 07 L118 | grilling §2 | D | 없음 |
| Scope 계층·복수·설비 소속 | 06 §6.2 | 05 L18, REQUIREMENTS Q2 | 07이 고정 3단을 요구하지 않음 | — | O | 없음 — 인터뷰 |
| 원천 시간 의미(naive wall-clock) | 03 L24–33 | 05 L18 | 06 §6.3이 소비 | 00 L23 경위 | D (의미) | 파서 레포 재확인 필요 |
| 시간 메커니즘 half-open, 미확인, 병합 가드, `defaultRangeTo` | 06 §6.3 | 05 L12 | DESIGN 기간 컨트롤은 페인트 | grilling §3 | D 메커니즘 / O 값 | 없음 |
| URL vs 세션, `v`, 복원 | 06 §6.4 | 05 L12 | 07 L135 표는 맞음, L105는 stale | grilling §4 | D / 필드명 C | 없음 |
| 실시간·DB접근·지연완료 메커니즘 | **현재 05 L49–61** | 05 표 L12 | 01 재계산, 03 토폴로지 | grilling §6 | D 메커니즘 / O 숫자 | 없음 |
| navigation IA 7그룹 | 06 §9 | 05 L9 | 07 L18 소비, 02 L30 구분 | DESIGN L640 정정 | D | 없음 |
| 셸 슬롯 | 06 §8 | — | 07 L89–99 | — | D | 없음 |
| 셸 치수 270/54 | DESIGN `sidebar-shell`/`top-bar` | 05 L14 | 06 §7 인용 | REQUIREMENTS §0 | D | 렌더 구현 없음 |
| 테이블 최소 32px | DESIGN `table-density` | 05 L14 | 06 §15 인용 | REQUIREMENTS §0 | D; 25px는 compact 목표 | 없음 |
| 토큰 스케일·hex | DESIGN YAML | 05는 픽셀만 | 06 §23은 **중복 숫자** | DESIGN Sources | §23 C, 270/54/32 D | CSS 없음 |
| 상태 taxonomy·2층 응답 | 06 §19 | 05 L12 | 04 표현, DESIGN 배지 색, 03 원천 소유 | grilling §5 | D / enum C / 원천 서비스 O | statusSource 없음 |
| 페이지 Archetype | 06 §12 | — | 04 L50–66는 도메인 예시여야 함 | — | 계약 D에 가까움 | 없음 |
| 도메인 capability | 02 표 | — | 04 패턴, 07 트리(예시) | — | 설계 D에 가깝고 Phase 문구는 잡음 | 없음 |
| 프론트/백엔드 스택 | 04 / 03 | 05 L16 | 01 mermaid는 잘못 확정처럼 보임 | SYNTHESIS Fastify는 D층 아님 | C | FeedbackOps 코드는 다른 제품 증거 |
| App Shell 배치 | 07 §4 | 07 §8 Candidate | DESIGN 페인트 | — | C | 프로토타입 없음 (SKILL L76) |
| 공지 배너 위치 | 미정 — 07 L86 Open, 02는 패턴만 | REQUIREMENTS Q9, HANDOFF L59 | — | — | O | 인터뷰 |
| YAGNI 제외 | 00 L29–31 | 05 Def, 06 §14/§24 | REQUIREMENTS L80가 재제안 금지 | — | D (비범위) | — |
| FeedbackOps 편입 범위 | 미정 | integration ideas Q1, layout L70–72 | 서브모듈은 참고 핀 | SYNTHESIS L47–53 | O / C | 서브모듈 코드 ≠ 플랫폼 채택 |
| parser 소비 | 01 | 00 L7 | 02 설비 import | candidates “기준선” | D 경계 / 스키마는 외부 | 이 레포에 parser 없음 |

### 3.2 원본 / 요약 / 예시 관계

에이전트가 자주 뒤집는 관계만 고정한다.

1. **원본**에 규칙을 쓴다. 요약은 포인터+한 줄. 예시의 숫자가 원본을 이기지 않는다.
2. `AGENTS.md`는 06의 **운영 요약**이다(자기 선언 L9). 06과 충돌하면 06.
3. `05`는 상태 **인덱스**여야 한다. 예외: 지금 지연완료 `R` 정의는 05 본문이 원본이고 06이 요약 쪽으로 인용한다(`06` L256). 이 예외를 숨기지 말고 행렬에 “원본=05 지연완료 절”로 적는다. 이동 전에는 06을 고칠 때 05 본문도 같은 작업으로 본다.
4. `07` 시나리오 표는 06의 **적용 예시**다(`07` L111, grilling L157).
5. `DESIGN.md` 레퍼런스 대시보드는 시각 **예시**다. `06` §9가 IA 원본. DESIGN L640이 이미 그렇게 말했으나 L763이 반대로 말한다.
6. `PLATFORM_REQUIREMENTS.md`는 00–07/DESIGN의 **작업 요약**이다. `[3/3]`은 독립 지적 횟수(L13–17, L188)이지 원본이 아니다. 신규 제안(L189)은 05 Open으로만 들어갈 수 있다.
7. `docs/reviews/2026-09-18-…`는 판정 **근거 아카이브**다. 필드명 전체 목록을 여기만 두고 06이 “자세한 근거는 리뷰”라고 가리킨다(`06` L232, L258, L272). 구현 검증에 리뷰를 인용하지 말라는 자기 규칙(grilling L7)을 지킨다.
8. research `01/02/03` 원본 조사는 오류를 포함할 수 있다(`SYNTHESIS.md` §3 정정표). 토론 R1/R2는 상대의 후속 철회를 못 반영할 수 있다(research README L35). **종합이 조사 원본을 대체하지 않고, 종합도 06을 대체하지 않는다.**

### 3.3 구체 분리 샘플 (예외·상태 보존)

큰 이관 없이, **한 덩어리만** 이렇게 나누면 운영 규칙이 보이는지 시험할 수 있다. 값을 새로 고르지 않는다.

**샘플 A — `07` §6의 stale Open (구조만, 상태 보존)**

현재 L105:

> URL에서 복원된 요청 Context와 목적지 객체 ID를 구분해 표시한다(§6.1). 직렬화·충돌 정책은 §6.4의 Open 결정이다.

교체 초안 (구현 아님, 제안):

> URL에서 복원된 요청 Context와 목적지 객체 ID를 구분해 표시한다. **원본** `06` §6.1·§6.4: 메커니즘 Decided, 필드명·enum Candidate. 이 화면은 직렬화 규칙을 재정의하지 않는다. **이 화면의 Open**은 Scope 계층 API와 공지 배너 위치다(§8 표).

예외 보존: 필드명을 Decided로 올리지 않음. TZ 값을 닫지 않음. 07이 URL 원본이 되지 않음.

**샘플 B — `DESIGN.md` Navigation 한 문단 (시각 vs 행동)**

현재 L763은 스크린샷 6그룹을 §9와 같다고 하고, L640–641은 아니라고 한다. 분리 초안:

- 본문 Components/Navigation: 그룹 이름은 “reference recipe labels (non-canonical)”. 생산 그룹은 `06` §9 링크만.
- L808–813 URL 물질화 문장: “렌더링만. 규칙 원본 `06` §6.3.” 브라우저 now 금지는 06 인용으로 축소.
- L942 치수 로그: “2026-09-21 이전 서술. 현행은 `05` L14 / `06` §7. 이 문장은 이력이며 규범이 아니다.”

예외 보존: 270/54 값은 DESIGN canonical 유지. 레퍼런스 대시보드 구성(KPI 5, 파이프라인, 도넛)은 **Candidate 시각 레시피**로 남기고 운영 개요 메뉴로 승격하지 않음. donut 허용 경계는 여전히 Open(`PLATFORM_REQUIREMENTS` Q14, `06` §24 Decorative Visualization).

**샘플 C — 새 파일이 꼭 필요할 때만**

Astra가 제안한 `docs/design/reference_dashboard_recipe.md`는 샘플 B로  sufficiency를 확인한 뒤에만 만든다. 먼저 파일을 만들면 INDEX가 또 불완전해지고, 레시피가 세 번째 IA가 된다.

---

## 4. 최소 발견 / 인덱스 / 변경 영향, 유지비

### 4.1 발견 순서 (새 도구 없음)

1. `AGENTS.md` (목적·금지 한 쪽)
2. `docs/INDEX.md` (역할 + 권위 행렬)
3. 주제 원본 한 파일의 **해당 절만**
4. `docs/05`에서 그 절의 상태
5. 화면이면 `07` 또는 해당 스펙, 시각이면 `DESIGN.md`, 후보면 `03`/`04`/research

금지: REQUIREMENTS나 HANDOFF나 리뷰 합의록을 1번으로 쓰지 않는다. 스킬은 화면 작업일 때만 `analysis-platform-wireframe/SKILL.md`를 연다. 외부 `design-md`는 DESIGN Sources가 가리킬 때만.

### 4.2 변경 영향 표 (최소)

구현은 체크리스트 문장이지 스크립트가 아니다. 첫 버전은 INDEX에 둔다.

| 원본을 바꾸면 | 반드시 읽는 소비자 | 같이 고칠 수 있는 것 | 건드리면 안 되는 것 |
| --- | --- | --- | --- |
| 06 §6/§11/§17/§19 | 05 상태 행, 07 시나리오, 04 소유권 절, DESIGN이 행동을 복제한 문장 | 05 한 줄, 소비자 포인터 | 03의 원천 의미, parser, FeedbackOps |
| 06 §9 IA | 07 IA 트리, 02 L30, DESIGN L640, wireframe-rules L21, standard-log-lifecycle README L30 | 표시명 Candidate | 02 도메인 개수를 7로 “맞춤” |
| DESIGN 270/54/32 | 06 §7/§15 인용, 05 L14, REQUIREMENTS §0 | 인용 숫자 동기화 | 06 행동 규칙, compact 25px를 기본값으로 승격 |
| DESIGN hex/type | 06 §23과 **숫자 드리프트 확인** | §23을 링크로 줄이는 작업이 있으면 그 커밋 | 06 의미 토큰을 hex로 역규정 |
| 01 데이터 계약 | 02 설비/지표 비고, 03 재계산 포인터, 05 지연완료와 정합 | 용어 | 06 URL 키 발명 |
| 05 상태만 | 해당 원본 절의 태그 | 원본 절 머리 한 줄 | 상태만 바꾸고 본문 불일치 방치 |
| research/integration | 없음 (채택 전) | 자기 문서의 “06이 원본” 문장 | 06/01/03/05 Decided |
| FeedbackOps 서브모듈 | layout 절차, ideas의 비교 열 | gitlink | 플랫폼 DESIGN/06 자동 동기화 |
| 파서 계약 인용 | 01, 00의 docs/23 문장 | 핀 커밋 | 파서 내부 로직 흡수 |

### 4.3 유지비 (정직하게)

| 자산 | 예상 비용 | 언제 값인가 |
| --- | --- | --- |
| INDEX 권위 행렬 + 영향 표 (2–3화면) | 최초 작성 중간, 이후 주제 추가 시 한 줄 | 매 에이전트 세션의 오탐을 줄임 |
| 섹션 상태 태그 규약 (이미 06/05/07에 존재) | 낮음. stale Sweep만 | 지금 실패 모드의 핵심 |
| 05를 순수 인덱스로 만드는 본문 이동 | 높음 (06 L256, grilling, 01/03) | URL/시간/지연완료를 **다시** 열 때 |
| DESIGN 레시피 분리 | 중간 (링크 다수, Astra L122–149) | 레퍼런스 대시보드를 화면 스펙으로 쓸 때 |
| 링크 검사 `rg` + 상대경로 존재 | 낮음, 이미 인간이 함 | 파일 이동 시에만 필수 |
| RAG/임베딩/자동 재생성 | 높고, 지금 말뭉치가 섞여 있어 오답 위험 | 비권고 |
| REQUIREMENTS `[N/3]` 재집계 | 높고 의미 없음 (L188 사람 판단) | 중단. 신규 제안은 05 Open 한 줄 |

코드 없는 저장소에서 **의미 검사 자동화는 거의 불가능**하다. 쓸 수 있는 구조 검사는 §5.3.

---

## 5. 변경·리뷰·재생성 트리거, 코드 부재, 의미 vs 구조, 다중 에이전트

### 5.1 변경 트리거 (언제 원본을 여는가)

| 사건 | 여는 원본 | 같이 손대는 것 | 생성하지 않는 것 |
| --- | --- | --- | --- |
| 새 메뉴가 Kernel을 소비 | 06 §5/§8/§12/§28/§29, 02에 capability가 있는지 | 07은 셸 슬롯만, DESIGN은 페인트만 | 06 본문 포크, 사이드바 하드코딩 허용 문구 |
| URL/Context/시간 규칙 변경 | 06 §6, 필요 시 03 원천 의미 | 05 상태 행, 07 시나리오 **포인터**, grilling은 새 합의록일 때만 추가 | 04/DESIGN에 규칙 재서술, REQUIREMENTS Open 복제 |
| Candidate 채택/Defer | **사람 결정 후** 원본 절 + 05 행 | research 문서 상태를 유지 (채택해도 조사본을 재작성하지 않음) | SYNTHESIS/R2 동의로 05를 Decided로 표시 |
| 시각만 변경 (색, 간격, 270/54 제외한 컴포넌트 페인트) | DESIGN | 06 §23 숫자와 드리프트가 있으면 링크화 이슈만 | 06 행동, 02 IA |
| 270/54/32 변경 | DESIGN 토큰 **먼저**, 같은 작업에서 06 인용·05 행 | REQUIREMENTS §0 기록은 이력 | 07 와이어프레임 ASCII를 픽셀 원본으로 승격 |
| 스택 후보 변경 | 03 또는 04 | 05 L16 | 01 mermaid/06 §13을 기정사실로 고침 |
| 서브모듈 핀 갱신 | layout 절차 | ideas는 비교가 바뀔 때만 | 플랫폼 계약 자동 개정 |
| 에이전트 스킬 변경 | `.agents/skills/…/SKILL.md` | `.agents/README.md` 원본 경로 | 06/DESIGN 제품 규칙 |

재생성: 이 레포에는 생성되는 계약 산출물(OpenAPI 실파일, 토큰 CSS)이 없다. `06` L214는 형식 자체가 Candidate. **재생성 트리거는 없다.** 코드가 생기면 그때 공개 스키마 산출물의 원본을 06이 소유하고 생성기는 소비자다.

### 5.2 코드가 없을 때

- 설계 Decided를 “구현됨”으로 체크하지 않는다 (`06` L11, REQUIREMENTS L11, 07 L126).
- 빈 구현을 메우기 위해 예시(07 트리, DESIGN 스크린샷, FeedbackOps 화면)를 원본으로 올리지 않는다.
- 검증 문장은 05 Candidate 기준(L22–35)에 남기고, 통과 기록은 아직 없다.
- 없는 서비스(`statusSource`, timeDomain assertion 공급자)는 화면을 그리지 않는다는 기존 금지(07 L22–24, 06 §19 L798–800)를 유지한다. 운영체제가 그 화면 스펙을 “문서 공백”으로 강제 생성하지 않는다.

### 5.3 구조 검사 vs 의미 검사

**구조 (기계 가능, 지금 도입 가치 있음):**

- INDEX/원본에 적힌 상대 경로 존재.
- `06` 절 번호(`§6.3` 등)가 06 머리에 존재 (번호 재배열 금지 — Astra L133이 이미 이유).
- 금지 패턴: 소비자 문서가 “§6.4의 Open 결정”처럼 **상태가 박힌 문장**을 원본 없이 보유. 허용 패턴: “상태 원본 `05` 표”.
- Phase 0–4 문자열이 05 가설 표 밖에 일정 지시로 쓰이면 경고.
- research/integration 문서 머리 Status가 Research/Candidate가 아니면 경고.

**의미 (사람/에이전트 리뷰만):**

- Decided 문장의 주체·조건·예외·금지가 복제본과 같은가.
- Candidate 필드명이 구현 코드처럼 읽히는가.
- 06과 DESIGN의 숫자 동기화, shadow 허용 범위(`06` L963 floating shadow vs DESIGN L910 no shadows) — **값을 이 OS가 고르지 않음**. 불일치는 05 Open으로 남긴다.
- `[N/3]` 합의와 원문 존재 여부.

### 5.4 다중 에이전트 충돌

현재 실패 모드: 관련 주제를 여러 에이전트가 04/06/DESIGN/05/REQUIREMENTS에 **동시에 본문을 씀**. HANDOFF L67은 그것을 절차로 고정했다.

규칙 제안:

1. **한 주제의 쓰기 잠금은 원본 파일 하나.** 06 §6 작업 중이면 04/07/DESIGN은 포인터만 고친다.
2. 소비자가 원본 부족을 발견하면 원본에 이슈/Open 행을 남기고 **추측으로 채우지 않는다** (SKILL.md L25와 동일 정신).
3. 두 원본이 겹치는 예외(지금: 05 지연완료 본문 ↔ 06 §6.3 인용, DESIGN 치수 ↔ 06 §7 인용)는 행렬에 “쌍 잠금”으로 표시하고 같은 작업에서만 수정한다.
4. 독립 병렬 가능: 02 catalog 문장 vs DESIGN 페인트 vs 03 스택 표 vs FeedbackOps 내부. 교차점은 Kernel/URL/IA/치수.
5. 충돌 발견 시: 원본 문장을 이기고, 복제본을 링크로 줄인다. 둘 다 원본처럼 보이면 **더 구체적인 금지/예외를 가진 쪽**을 임시로 따르고 05에 Open을 올린다. 모델 다수결로 닫지 않는다.
6. 리뷰 합의록과 원본을 같은 PR에서 바꾸면, 원본 절에 Decided로 승격된 문장만 규범이다 (grilling L7, INDEX L36).
7. FeedbackOps와 플랫폼 문서를 한 에이전트가 같이 고치지 않는다. 통합 충돌은 layout L72대로 명시적 결정.

---

## 6. 내용 공백 (결정을 만들지 않음)

문서가 없어서가 아니라, **원본이 ‘모른다’고 한 것**과 **원본이 서로 다른 공백을 가리키는 것**.

사람 도메인 (인터뷰, 05 Open / REQUIREMENTS Q2–15 / HANDOFF L51–65와 대응):

- Scope 계층·상속·복수 Scope·설비 소속
- 사업장 TZ 값, 교대일/영업일, 다중 사업장 같은 날짜
- `H`, `Δ`, 폴링 주기, 조회량/timeout, `v` sunset 날짜
- SSO, 백엔드 언어, 배포, 동시 사용자, 보존기간, 멀티테넌시
- statusSource/observedAt 공급자 존재
- 공개 계약 산출물 형식
- 다크모드 수요, 아이콘, 프리미티브 조합, CJK 폰트, 7D/30D/90D 의미
- 공지 배너 위치/조건, 알림 벨 의미
- 마스터 필드 원천 소유자 (01 L59는 필요만 말하고 답을 없음)
- VOC 담당 조직·전이 예외
- 첫 실제 Consumer 메뉴가 설비관리인지 분석 화면인지 (06 L32는 “대표 Consumer”만)
- FeedbackOps에서 가져올 공통 기반 vs 업무 잔류 (ideas L72–80)
- 보조기술 사용자 실존, Donut/Gauge 허용 경계

엔지니어링 공백 (조사, 채택 아님):

- 파서 `docs/23`/`11`/`09`/`22`의 현재 진실과 00/01 인용의 핀
- `07` L105가 의도적 잔존(필드명 Open을 말하려다 메커니즘까지 Open으로 씀)인지 실수인지
- DESIGN L942를 이력으로 둘지 삭제할지 (값 변경 아님)
- 06 §13 단정 vs 04 Candidate 정렬 방법 — 선택은 하지 않고 **불일치만** 기록
- 06 L963 shadow vs DESIGN no-shadow 범위
- FeedbackOps Fastify/OIDC/pg-boss가 플랫폼 제약과 맞는지는 SYNTHESIS도 미실행 검증(L19)
- FileGateway Seoul 기본 TZ는 06 §6.3과 충돌 후보 (`component-contract-candidates` L61–70). 연동 여부 자체는 Open
- 주석 저장 모델(`04` L105–107)의 데이터 원본이 01인지 02인지 06인지 — 세 감사가 갈림. **지금 결정하지 않음.** 04에 본문이 있는 사실만 적음
- KPI 5–6 상한이 04 L56 / DESIGN L911에만 있고 06에 없음. 제품 규칙인지 시각 가이드인지 미지정

고의로 채우지 않는 것: 메뉴 활용률 화면, 시간역 관리 UI, 리포트 빌더, 저장된 뷰 구현, 외부 플러그인 SDK.

---

## 7. 이 제안의 실패 모드

1. **권위 행렬이 네 번째 복사본이 된다.** INDEX가 06을 요약하기 시작하면 지금 REQUIREMENTS와 같다. 완화: 행렬은 경로+상태만, 규칙 문장 금지.
2. **05 본문을 인덱스로 비우기만 하고 06 L256을 안 고친다.** `R` 정의가 사라진다. 완화: 쌍 잠금, 이동은 별도 작업.
3. **stale 태그 네 곳만 고치고 이중 원본을 영구화한다.** 대안(§2.2)의 실패. 완화: URL/시간 작업이 들어오는 순간 §2.1로 승격.
4. **섹션 혼합 상태를 ‘정리’하느라 Open domain을 Decided로 올린다.** 최악. 완화: 혼합은 기본값, stale만 표적.
5. **레퍼런스 대시보드 분리가 새 IA가 된다.** 07/02/§9와 네 번째 트리. 완화: 샘플 B, 파일 생성은 나중.
6. **구조 검사만 통과하고 의미 드리프트는 남는다.** “§6.4” 문자열은 맞아도 내용이 다름. 완화: 원본 절 리뷰를 사람 게이트로 남김.
7. **쓰기 잠금이 06을 병목으로 만든다.** 모든 화면 작업이 06 대기를  intra. 완화: 소비 작업은 06을 읽기만 하고, 부족분은 Open 행.
8. **독립 제품 경계를 행렬에 너무 자세히 넣어 FeedbackOps OS를 수입한다.** 완화: 플랫폼 행렬은 핀·진입점만.
9. **이 보고서 자체를 원본으로 인용한다.** 라운드 1 제안이다. 채택 전 06/INDEX가 바뀌지 않으면 규범 아님.

반례(이 제안이 틀릴 수 있는 증거): 05에 메커니즘 본문을 남겨 두면 에이전트가 05만 읽고 06 §6.3의 병합 가드·`defaultRangeTo`를 놓친다. 이미 grilling은 두 파일에 나눠 반영했다(grilling §10). “05는 인덱스만”이 항상 맞지는 않다. 그래서 지금 원본을 05로 **명시**하는 쪽이 빈 인덱스보다 안전하다.

---

## 8. 인터뷰 vs 조사, 이관/롤백

### 8.1 먼저 사람 (문서 OS가 답을 만들면 안 되는 것)

우선순위는 HANDOFF L51–65 / 05 Open / grilling §9와 같게 둔다. 새 순서를 발명하지 않음.

1. 첫 Consumer 메뉴와 “Kernel 완성”의 실무 정의 — 문서만으로는 설비관리 vs 분석 화면이 모두 후보
2. Scope 도메인
3. TZ 실제 값·같은 날짜
4. 운영 숫자 `H`/`Δ`/폴링
5. 인증·언어·배포
6. FeedbackOps를 공통 기반 / 첫 업무 모듈 / 단순 참고 중 무엇으로 둘지
7. 공지 배너·알림 벨 수요
8. 다크모드·CJK·프리셋 의미

### 8.2 먼저 조사 (원문이 이 레포 밖이거나 stale 판정이 필요한 것)

1. 파서 `docs/23` 등 — 00/01이 authoritative 입력이라 했으나 부재. **원본 재확인 필수**
2. `07` L105 vs L135, `04` L48, DESIGN L942 — stale vs 의도
3. FeedbackOps 현행 코드와 SYNTHESIS 재사용 주장 — 실행 검증은 아직 없음. 채택 조사이지 문서 OS 설치가 아님
4. Luna 보고서의 vocpage/jira-voc-nexus 차이 — ideas L19–21이 한계를 이미 말함. 전수 재검증은 이 과제의 범위가 아님
5. 06 §23 vs DESIGN 숫자 전수 대조 (L941은 정렬했다고 주장, 독립 표 대조는 이 세션에서 전부 하지 않음) — **원본 재확인 남김**
6. shadow 정책 불일치 범위

### 8.3 이관 순서와 롤백

0. **동결:** 이 HEAD + `source-snapshot.json`. 제품 결정 없음.
1. INDEX에 권위 행렬·영향 표·빠진 파일 목록만 추가. 규칙 문장 복사 금지. 롤백=해당 파일 revert.
2. stale 포인터 4곳(§3.3 샘플 A + 04 L48 + DESIGN L942 + 03 Phase 0 범위 문장). 각 커밋을 주제별로. 롤백=파일 단위.
3. HANDOFF 이중 갱신 문장 제거. REQUIREMENTS 머리에 “05 비원본”을 기존 L11과 맞춰 한 줄. 롤백=두 파일.
4. (요청이 있을 때만) 샘플 B. DESIGN 본문 분리 없이 문장 치환. 롤백=DESIGN.
5. (URL/시간/지연완료를 실제로 바꿀 때) 05 본문 위치 재검토. 06 L256과 한 작업. 그 전에는 이동하지 않음.

중단 조건: 2단계에서 Open domain 값을 채우거나, research 문서를 Decided로 바꾸거나, FeedbackOps/parser를 수정하거나, 00–07을 옮기려 하면 중단.

---

## 9. 다섯 과제에 대한 시험

### 9.1 새 메뉴가 Kernel을 소비

오늘: 에이전트가 02 Kernel 목록, 07 전체 트리, DESIGN 6그룹, REQUIREMENTS 신규 Must, standard-log-lifecycle Candidate 시안을 각각 “메뉴를 어디에 넣을지”의 원본으로 읽는다. 06 §5 금지(사이드바 JSX, 임의 쿼리)를 놓치기 쉽다.

OS 후: INDEX 행렬 → 06 §5 선언 + §28 리뷰 + §29 Platform Done. 02는 그 도메인이 있는지, 07은 슬롯, DESIGN은 페인트. 연구 시안은 D층. **메뉴 등록이 06 변경을 요구하면 그건 Kernel 실패(06 §32)이지 문서 추가가 아니다.**

부족한 내용: 선언 필드명(Candidate), 첫 Consumer 선택(사람).

### 9.2 URL / Context / 시간 변경

오늘: 원본은 06 §6이 맞다. 그러나 04 L48, 07 L105, 03 Phase 0, DESIGN L808, 05 `R` 본문이 동시에 열린다.

OS 후: 쓰기 잠금 06 §6 (+예외적으로 05 지연완료 절). 소비자는 포인터. TZ 값은 05 Open으로 남김. 그릴링 문서는 새 라운드가 아니면 수정하지 않음.

실패 잔여: 05/06 쌍을 모르는 에이전트는 여전히 한 파일만 고친다. 행렬의 “쌍 잠금” 한 줄이 이 과제 때문에 존재한다.

### 9.3 Candidate 채택 / defer

오늘: SYNTHESIS Fastify, 06 §13 Base UI, component-candidates 필드, REQUIREMENTS 신규 메뉴가 채택처럼 읽힐 수 있다. 문서 머리 Status는 이미 방어한다.

OS 후: 채택 트리거=사람 → 원본 절 + 05 행. 조사 문서는 그대로 Candidate. `[3/3]` 금지. defer는 05 Deferred/Open이지 파일 삭제가 아님.

반례 보존: parser 소비는 “후보 3”이 아니라 01 기준선(`component-contract-candidates` L75–79). 채택 절차로 01을 다시 Candidate로 내리면 안 된다.

### 9.4 DESIGN 시각 vs 전역 행동

오늘: 치수는 DESIGN canonical + 06 인용으로 정렬됨(강점). 행동 문장(URL, Context owns, 알림 화면, 6그룹)이 DESIGN에 남아 07/06과 충돌.

OS 후: 시각 PR은 DESIGN만. 행동 문장은 06 링크로 축소(샘플 B). 06은 hex를 소유하지 않음. shadow 불일치는 값을 고르지 않고 Open.

검증: 이 과제는 브라우저가 아니라 문서 충돌 검사다. 런타임 UI 없음.

### 9.5 관련 주제를 여러 에이전트가 동시에 수정

오늘: 05+REQUIREMENTS 이중 쓰기, 04/06/DESIGN 삼중 UI, 06+05 시간 본문.

OS 후: 원본 잠금, 소비자 포인터만 병렬, 쌍 잠금 예외 두 개(치수, 지연완료). 충돌 시 원본 승, 다수결 금지.

남는 실패: 두 에이전트가 같은 06 절을 다른 체크아웃에서 고치면 Git 충돌. 문서 OS가 git을 대체하지 않음. HANDOFF L7과 동일.

---

## 10. 읽은 범위 / 의도적 생략 / 원본 재확인

**본문까지 읽음:** `AGENTS.md`, `docs/INDEX.md`, `README.md`, `HANDOFF.md`, `docs/00`–`05` 전체, `docs/06` 머리·§1–9·§13·§15·§19·§23·§28–32, `docs/07` 전체, `DESIGN.md` Overview/Sources/Open Decisions/Navigation/기간 컨트롤, `PLATFORM_REQUIREMENTS.md` §0–2 및 Open/부록, `docs/integration/*` (candidates는 후보1–2·기준선·제목), research `README.md`+`SYNTHESIS.md` 앞부분, grilling 지위·범위·§7–10, 와이어프레임 `SKILL.md`+`wireframe-rules.md` 앞, `.agents/README.md`, FeedbackOps `AGENTS.md` 앞, standard-log-lifecycle `README.md`, 역사 감사 두 편의 책임 지도·목표 구조, `source-snapshot.json` 머리/꼬리.

**제목·선별 본문만:** `docs/reviews/2026-09-22-component-contract-candidates/*`, research discussion R1/R2, `06` 나머지 절(§10–12, §14, §16–18, §20–22, §24–27은 머리로 존재 확인, 필요한 인용만).

**생략 (커버리지 선언):** `products/feedbackops/` 소스·ADR·프로토타입 전부(독립 제품). `.agents/references/design-md/` 74브랜드 본문(tooling). 범용 디자인 스킬 데이터/스크립트. `.agents/reports/requirements-*.md` 본문(역사, 당시 240/56 값은 재작성하지 않음). Luna 통합 후보 보고서 전문. platform-research 01/02/03 전문. parser 레포. 다른 참가자 `root-r1.md`.

**원본 재확인이 남은 것:** 파서 `docs/23`/`11`/`09`/`22`; 06 §23↔DESIGN 숫자 전수; `07` L105 의도; FeedbackOps 재사용 주장의 코드 대조; DESIGN 스크린샷 파일(사용자 홈 경로 L594, 이식 불가).

이 문서는 라운드 1 독립 제안이다. 라운드 2에서 다른 제안과 교환한다.
