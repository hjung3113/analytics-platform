# Handoff — 2026-09-26 플랫폼 다섯 갈래 전부 병합 (PR #4-9), 첫 실제 화면 검토 완료

## 현재 상태

`main`은 커밋 `bd85079`, `origin/main`과 일치, 작업 트리 clean. 코드 작업은 2026-09-25 세션(PR #4-9)에서 끝났고, 2026-09-26에는 **핸드오프 정리 + 사용자 질문에 답하며 확인 작업만** 했다(코드 변경 없음).

- **병합된 PR 6개**(전부 `--merge`, 2-parent merge commit, 기존 PR #1-3 컨벤션과 동일):
  - **#4** (`e868660`) — Kernel codec + Unit A/B/C 프로토타입(직전 handoff가 넘겨준 브랜치)를 main과 동기화 후 PR로 올려 리뷰·병합
  - **#5** (`7f86127`) — Unit A 디자인 시스템 이식(Tailwind v4 + FeedbackOps shadcn)
  - **#6** (`9411ef2`) — Unit B 디자인 시스템 이식
  - **#7** (`61fc70a`) — Unit C 디자인 시스템 이식
  - **#8** (`8249774`) — Cross-menu Context Link(§22)
  - **#9** (`b4eaca6`) — 5 Page Archetypes(§12)
- **worktree 6개 정리 완료(2026-09-26)**: `kernel-context-url-scope`, `platform-design-system-port`(Unit A), `design-system-port-unit-b`, `design-system-port-unit-c`, `cross-menu-context-link`, `page-archetypes` 전부 `orca worktree rm`으로 삭제. main 병합 상태에는 영향 없음(전부 이미 병합 완료 상태였음).
- **이번 세션 전체를 통틀어 첫 실제 브라우저 시각 검토를 2026-09-26에 수행**(그동안 모든 PR이 "실제 브라우저 시각 검토 미실행"으로 명시해온 것의 첫 실행): `kernel-app-shell`을 로컬 dev server로 띄우고 Playwright(headless Chromium)로 5개 화면(Overview/Analysis Workspace+Selection/Analysis with Context Link detail/Catalog)을 스크린샷. App Shell·Page Archetype 레이아웃·Cross-menu Context Link(Selection 유지 + 목적지 ID 분리 + Back 복원)가 실제로 렌더링·동작함을 육안으로 확인, 콘솔 에러 없음. **중요 — 사용자가 명확히 구분해달라고 요청**: 이 화면들은 실제 제품 화면이 아니다. `docs/06_platform_ui_contract.md`의 플랫폼 계약(Shell Slots·Page Archetype 구조·Context Link 메커니즘)을 증명하는 **합성 fixture**(각 페이지에 "합성 fixture, 실제 메뉴 아님" 명시)이며, 실제 업무 메뉴(Equipment Master 등)는 아직 하나도 없다. 시각 디자인도 최소 Tailwind+shadcn 기본값이라 최종 폴리시가 아니다(`.agents/skills/analysis-platform-wireframe/SKILL.md`가 Design System/Prototype/Visual Polish를 별도 게이트로 둔 이유).

## 이번 세션 전체 요약

**오케스트레이션 패턴**(사용자 지시, 6개 PR 전부 동일하게 적용): 설계·구현은 **Opus 5.5**(`claude-opus-5-5`, effort high, `orca orchestration worker-start`), 리뷰는 **Codex Astra medium**(`gpt-6-astra`)과 **Grok 4.7 max**(`grok-4.7`, reasoning-effort max, `terminal create` + `dispatch --inject`로 저수준 디스패치 — worker-start가 model/effort를 못 넘기는 provider라서) 중 하나 이상, blocking/minor 발견 시 **OMP + GLM-5.3-Flash-Max**(`omp --model glm-5.3-flash --thinking max`)가 보강. 매 라운드 `worker_done` 자체 보고를 신뢰하지 않고 **coordinator(나)가 diff를 직접 읽고 테스트를 직접 재실행**해서 검증 — 이 패턴으로 실제 버그 2건을 self-report 통과 후에 잡아냈다(아래).

1. **PR #4 — 이전 세션이 넘긴 미병합 브랜치 처리**. main을 `41067ab`→`68df7a8`로 rebase(파일 경로 안 겹쳐서 충돌 없음), Unit A work order의 "production stack 채택" 항목을 방금 Decided된 프론트엔드 스택 문서에 맞춰 정리(단 실제로는 TanStack Router/Query/Zustand 대신 Browser History + 자체 adapter를 쓴다는 divergence를 있는 그대로 기록). Astra medium 리뷰 1건(PASS-WITH-MINOR, 표 형식 깨짐 1건 자체 수정), Astra medium + Grok 4.7 max 2차 리뷰(PR 본문·전체 diff 대상, 둘 다 PASS-WITH-MINOR) → **Grok이 진짜 코드 버그 발견**: `App.tsx`에서 다중/미지 Selection을 표시하는 `'__inherited'` sentinel을 사용자가 재선택하면 실제 상태가 리터럴 문자열로 덮어써지는 문제. OMP가 sentinel을 no-op 가드로 수정, 회귀 테스트 추가(수정 전 코드로 되돌려 실패 재현 후 복구해서 검증).
2. **PR #5-7 — 디자인 시스템 이식**. 3개 Unit(A/B/C)을 **별도 worktree 3개에서 병렬로 Opus 5.5 디스패치**(worktree를 분리한 이유: 같은 워크트리에 여러 에이전트를 동시에 넣으면 git index/node_modules/포트가 충돌한다). FeedbackOps(`products/feedbackops` 서브모듈, `b5dd614`)의 shadcn 컴포넌트·cn()·토큰을 **복사**(런타임 import 아님, 서브모듈 경계 유지)하고 Tailwind v3 preset→v4 `@theme` 블록으로 마이그레이션. Astra medium(Unit A) → **FAIL 발견**: Radix Select의 "선택 안 됨" sentinel(`'__absent'`)이 우연히 같은 문자열인 실제 opaque scopeId와 충돌해 두 옵션이 동시에 checked로 표시되고 클리어가 안 되는 버그(앞선 `__inherited` 버그와 같은 클래스 — 고정 sentinel 문자열이 opaque 실데이터 공간과 겹칠 수 있다는 패턴이 이 세션에서 2번 나왔다). OMP가 렌더링마다 실제 값과 충돌하지 않을 때까지 sentinel을 동적으로 늘리는 방식으로 수정. Grok 4.7 max(Unit B/C)는 둘 다 clean PASS(Unit C는 Playwright 5회 연속 재실행까지 직접 수행).
3. **PR #8 — Cross-menu Context Link(§22)**. **핵심 발견**: codec(`codec.ts`, Python 원본 이식)이 이미 `route='equipment'`+`destination`+`contextLink()`를 갖고 있었고 destination ID를 URL 경로 세그먼트로 인코딩해 Selection 쿼리 파라미터와 구조적으로 분리해뒀다 — §22가 요구하는 "목적지 ID로 출발 설비 선택을 안 바꾼다"가 이미 codec 레벨에서 증명돼 있었다(codec.test.ts). 이번 작업은 이 기존 능력을 Unit A App Shell UI에 연결하는 것만 했다(`codec.ts` 자체는 무변경). Opus 5.5가 `/equipment/{id}` 라우팅, "Open detail" 액션, 진입 직전 origin URL을 비등록 쿼리 키(`returnTo`)로 실어보내는 Back 복원, 외부/프로토콜 상대/다른 detail로의 루프/중복 키를 거부하는 `returnTarget()` 검증을 구현. Astra medium 리뷰: **clean PASS**, 자체적으로 sentinel/encoded-destination 36조합 + invalid return target 10개를 추가로 탐침.
4. **PR #9 — 5 Page Archetypes(§12)**. §12 원문이 Overview·Analysis Workspace 목록에만 "Page Header/Global Context/Data Trust"를 적어놔서 나머지 3개(Management/Catalog/Workflow)는 뭘 의미하는지 모호했다 — **Opus 5.5가 §6 Context Capability Contract의 예시 표**(Equipment Master/Metric Catalog/VOC도 "Not used on this page" 같은 inherited Context 미지원 표시를 한다)**를 근거로 5개 전부 이 3가지를 Shell-level(§8/§11)로 취급**하고 자체 region으로 안 갖는다고 판단, 커밋 메시지에 근거를 남겼다. `PlatformPage.tsx`와 같은 exact-key 강제 패턴을 `defineArchetype` 팩토리 하나로 5번 적용. 기존 3개 fixture 메뉴(Overview/Analysis/Catalog pageType)에 연결(Management/Workflow는 컴포넌트·타입 테스트로만 증명, 새 메뉴 미추가). Grok 4.7 max 리뷰: PASS-WITH-MINOR — 해석 판단에 독립 동의(§7/§14/§18/`docs/09`까지 추가 근거 제시) + **CSS 버그 발견**: 1024-1439px 드로어가 `position:fixed; inset-y-0`라 Shell 헤더·Global Context를 뷰포트 최상단부터 덮음. OMP가 `sticky top-0`로 교체(정상 문서 흐름 위치라 스크롤해야 고정되므로 header 안 덮임), 실제 컴파일된 Tailwind CSS를 vitest에서 검사해 증명. `aria-label` 문구도 §12 원문(대소문자·구두점)에 맞춤(14개 수정).
5. **플랫폼 다섯 갈래 전부 완료**: Kernel(#4) / 공통 컴포넌트(#4-7) / 차트 계약(#4·#6) / 메뉴간 연결(#8) / 레이아웃(#9). AGENTS.md의 "메뉴 3개 이상 연속 제작 전 범위 확인" 가드레일을 지켰다 — 메뉴 화면 0개 제작, 이번 세션 내내 전부 플랫폼 공통 갈래 작업.

## 사용자 확인 필요 — 15개 + 버그 1건 (변경 없음, 이번 세션에서 새로 해소된 항목 없음)

각 항목의 원문·근거는 `.agents/reports/kernel-work-order-*-draft.md`(main에 없음 — 병합 전 브랜치에만 있던 리뷰 기록, 필요하면 `git log`로 옛 커밋에서 찾는다)와 아래 요약에 있다. **이미 Decided인 사항(기술 스택, App 스택의 실제 divergence 등)은 여기 없다.**

**인증/권한**
- 실제 SSO·서버 권한/Scope 재검증 연동
- Scope 선택지의 실제 데이터 원천과 계층 상속 규칙
- Registry의 requiredPermissions/requiredScope를 Shell이 소비해 메뉴 노출을 판단할지 (Deferred)
- 권한 밖 EquipmentID를 `not_found`와 `forbidden`으로 구분해 노출할지 — 같은 Site DB enumeration 위험, 06이 정의하지 않음; 보안·권한 정책 담당자 지정 필요

**UX 정책**
- Condition 편집 시 기존 Selection 처리 UX (§6.4가 Candidate로 지정)
- Chart Selection Summary 안의 Pan/Brush/Apply 배치 정리
- Zoom-out/viewport 복귀를 Toolbar vocabulary에 넣을지
- 필터 변경 후 결과 밖으로 벗어난 행의 선택을 유지·표시할지

**후속 구현 범위(Deferred)**
- 전역 검색 인덱스·Command Palette 실검색(cmdk 미도입 — Decided 스택 항목이지만 아직 이식 안 함)
- 기간·지표 등 profile 밖 Context의 codec 구현 범위 — 계약은 Decided, 시간 지원 메뉴 전 반드시 닫아야 함
- Annotation 영구 저장·권한·Audit·편집 모델
- Export 실제 포맷·범위·권한
- DetailDrawer의 실제 Audit 데이터 연동
- 사이드바 자동 collapse(1024-1439px) — Page Archetypes 반응형 작업에서 수동 토글만 구현, 자동 collapse는 미착수(PR #9)

**아키텍처 — 의도적으로 지금 결정하지 않음**
- Chart Interaction Contract를 공통 Frame으로 승격할지 — §14 Promotion Rule(2번째 consumer 전까지 승격 안 함)에 따라 Deferred
- CFG의 다른 메뉴와의 Context Link 연계(§22) — Deferred 유지

**공개 URL 계약**
- 공개 URL 후보 키/표식/Condition JSON 별칭 이행과 공유 스키마 형식 승인 — 플랫폼 계약 담당자 지정 필요 (06 §6.1/6.4, Requirements OQ7)

**버그(결정 아님, 별도 수정 필요, 여전히 미수정)**
- Python codec(`prototypes/kernel-context-url-scope/context_url.py`)의 Unicode 서로게이트 처리 버그 — `\ud800`류 Condition 입력 시 `ContractError` 대신 `UnicodeEncodeError`로 죽음. 작고 독립적이라 아무 때나 스케줄 가능.

## 다음 세션 추천 작업

우선순위 순:

1. **플랫폼 다섯 갈래가 전부 끝났다 — 다음 자연스러운 단계는 실제 메뉴 화면 1개를 조립하는 것이다(3개 이상이 아니라 딱 1개부터).** AGENTS.md 가드레일은 "3개 이상 연속 제작 전" 확인을 요구하므로, **첫 1개는 곧장 시작해도 가드레일 위반이 아니다** — 다만 그 1개를 끝내고 다음 메뉴로 넘어가기 전에는 사용자에게 범위를 다시 확인한다.
   - **추천 후보**: `docs/02_domain_menus.md`의 6개 그룹 중 **설비관리(Equipment Master)** 또는 **생산성 분석(Occupancy/Wafer Journey/Cycle time 중 하나)**. 이유: (a) 둘 다 Phase 1 전제(사용자/조직 모델 등, 공지·VOC가 필요로 하는 것)가 없어 지금 바로 시작 가능, (b) 설비관리는 Management archetype(§12)+PlatformDataTable/DetailDrawer(Unit C)에 정확히 대응, 생산성 분석은 Analysis Workspace archetype+Chart Frame(Unit B)+Cross-menu Context Link(§22, 상세 드릴다운)에 정확히 대응 — 지금까지 만든 플랫폼 조각을 실제로 조립해보는 첫 검증이 된다.
   - 시작 전 `.agents/skills/analysis-platform-wireframe/SKILL.md`의 Requirements → IA → Conceptual Contract/Screen Spec → Wireframe → Open Decisions 순서를 따른다. Design System/Prototype/Visual Polish는 이번 요청에 없으면 건너뛴다.
2. **작은 후속들 — 스케줄 유연**: Python Unicode 버그 수정(독립적, 작음), cmdk 도입(Command Palette 실검색, Decided 스택 항목인데 아직 이식 안 함), 사이드바 자동 collapse.
3. 위 "사용자 확인 필요" 15개 항목은 실제 메뉴 구현 착수 전에 관련된 것부터 순서대로 닫는 게 자연스럽다(전부 한 번에 결정할 필요는 없음 — 막는 항목만).
4. M6 평가(위 "남은 범위" 참고) — 실제 메뉴 작업 전에 짧게 돌려볼 수 있다.

## 남은 범위 (갱신) — M0-M6 정체 확인함(2026-09-26)

**M0-M6는 제품 기능 마일스톤이 아니다** — `.agents/reports/doc-operations-2026-09-22/migration-plan.md`가 정의한 **2026-09-22 문서 재구성 작업의 6단계 체크리스트**다(M0 현재 기준 재확인 → M1 INDEX/03/04/07 진입점 정리 → M2 06 §6.3 계약 연결 샘플 → M3 REQUIREMENTS 파생 체크리스트 정리 → M4 05의 정책 상세를 01로 실제 이관 → M5 코드 slice의 task record에 계약 원문 §→코드→테스트 연결 → M6 "실제 변경 3건" 이후 metadata 비용 대비 효과 평가). 별도의 "제품 로드맵/기능 마일스톤" 문서는 이 레포에 없다 — 로드맵에 가장 가까운 건 `docs/05_roadmap_and_open_questions.md`(Design Decisions/Open Questions, 일정이 아니라 결정 상태 목록)다.

- **M5 — 실제 구현 때 적용:** 6개 PR 전부 계약 원문 §번호 → 코드 → 테스트 결과를 연결해 기록했다(PR 본문·커밋 메시지). 실제 업무 메뉴 구현 시에도 같은 패턴을 유지한다.
- **M6 — "실제 변경 3건 이후 평가":** 트리거 조건(3건)을 이번 세션 6개 PR로 이미 2배 넘게 초과했다. 아직 실행 안 함 — 다음 세션에서 `migration-plan.md`의 M6 행(탐색 실패/누락 관계/유지 비용 측정)을 한 번 돌려서, 지금의 `docs/06` 중심 문서 구조가 실제로 잘 버텼는지(이번 세션 내내 §6/§8/§11/§12/§14/§18/§22/§25/§26을 참조만 하고 원문을 한 번도 안 고쳤다는 사실이 긍정적 신호) 평가하는 걸 권한다.
- CFG의 메뉴 간 연계(§22)는 Deferred 유지(변경 없음).

## 이번 검증과 기록

6개 PR 전부 동일한 원칙: **worker_done 자체 보고를 신뢰하지 않고 diff를 직접 읽고 테스트를 직접 재실행**. 구체적으로 —
- PR #4: rebase 후 Python 14/14, Unit A 109/109(→112/112 버그 수정 후)+typecheck+build, Unit B 23/23+typecheck+build, Unit C 5/5+Playwright 9/9×6회 연속 직접 재실행. Astra medium의 2차 리뷰가 Playwright 러닝 카운트("15+8회")의 근거 수준(커밋된 로그 vs coordinator 세션 보고)을 지적해 PR 본문을 정정.
- PR #5-7: Unit A 112→113(버그 수정)→121(§22)→151(§12) 순으로 누적 테스트 수 증가, 매 단계 직접 재실행. Unit C는 Playwright를 **로컬 브라우저 경로 문제**(이 저장소는 `PLAYWRIGHT_BROWSERS_PATH=.browsers`로 워크트리 로컬에 브라우저를 설치하는데, 새 워크트리에는 없어서 처음엔 전부 실패로 보였다 — `PLAYWRIGHT_BROWSERS_PATH` 없이 설치했던 게 원인, 재설치 후 5회 연속 정상) 직접 겪고 해결한 뒤 5+10회(리뷰 포함) 연속 무실패 확인.
- PR #8: App.tsx의 `__inherited`·`__absent` 두 sentinel 버그를 각각 "수정 전 코드로 되돌려 새 회귀 테스트가 실제로 실패하는지"까지 직접 재현해서 수정을 검증(자기 자신을 믿지 않는 이중 확인).
- PR #9: 리뷰가 지적한 CSS 드로어 오버레이 버그를 OMP가 실제 컴파일된 Tailwind 출력에서 클래스가 사라졌는지/새 클래스가 생겼는지까지 vitest로 검사하도록 지시해 "소스 코드 class 이름만 바뀌고 실제 동작은 그대로"인 가짜 수정을 배제했다.

원본 계약 문서(`docs/06_platform_ui_contract.md` 등)는 6개 PR 전부 `git diff`로 무변경 확인. FeedbackOps 서브모듈(`products/feedbackops`)은 매번 `git diff -- products/feedbackops`로 gitlink 고정(`b5dd614`) 확인, 자체 코드 소급 변경 없음. 6개 PR 각각의 리뷰 라운드에서는 브라우저 실사용(수동 시각 검토)을 하지 않았다고 PR 본문에 명시했으나, **병합 완료 후 2026-09-26에 coordinator가 별도로 Playwright 스크린샷 5장을 찍어 App Shell·Page Archetype·Cross-menu Context Link가 실제로 렌더링·동작하는 것을 확인**했다(위 "현재 상태" 참고) — PR별 검증이 아니라 세션 마무리 확인이다.

## 보존할 경계

- Decided는 구현 완료가 아니다. 위 15개 확인 항목을 임의로 결정하지 않는다.
- FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 및 독립 parser 책임을 유지한다. FeedbackOps 자체 코드(Tailwind v3 등)는 이번 세션 어떤 PR에서도 소급 변경하지 않았다.
- GPT-6(Astra 포함, `gpt-6-astra`), Claude Opus 5.5(`claude-opus-5-5`), Grok 4.7(`grok-4.7`), GLM-5.3-Flash(`glm-5.3-flash`, via OMP)를 사용했다. 호출 가용성은 실제 확인하며 과거 모델명은 고치지 않는다.
- 역사 snapshot/외부 원본은 덮어쓰지 않는다. 문서 검증을 제품 런타임 검증으로 보고하지 않는다.
- AGENTS.md "메뉴 3개 이상 연속 제작 전 범위 확인" 가드레일을 지켰다 — 이번 세션 메뉴 화면 0개 제작.
- 병렬 오케스트레이션은 반드시 **워크트리를 분리**해서 돌렸다(같은 워크트리에 여러 에이전트를 동시에 넣지 않음 — git index/node_modules/dev 서버 포트 충돌 방지).

## 필요할 때만 읽는 기록

[직전 HANDOFF(2026-09-25 오전) 전체](.agents/reports/handoff-history-through-2026-09-25-b.md) · [2차 인터뷰(리뷰 결론 10개)](docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md) · [Scope Contract Console 아티팩트](https://claude.ai/artifact/UCcdxht21KCBvwc7REvKrE) · 병합된 PR: [#4](https://github.com/hjung3113/analytics-platform/pull/4) [#5](https://github.com/hjung3113/analytics-platform/pull/5) [#6](https://github.com/hjung3113/analytics-platform/pull/6) [#7](https://github.com/hjung3113/analytics-platform/pull/7) [#8](https://github.com/hjung3113/analytics-platform/pull/8) [#9](https://github.com/hjung3113/analytics-platform/pull/9). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
