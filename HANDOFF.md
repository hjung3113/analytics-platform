# Handoff — 2026-09-25 Kernel + 플랫폼 공통 3갈래 프로토타입(Astra↔Opus 교차 검토)

## 현재 상태

`main`은 커밋 `41067ab`에서 변경 없음, `origin/main`과 일치, 작업 트리는 clean이다. **이번 세션의 실제 산출물은 main이 아니라 별도 Orca worktree/브랜치에 있다** — 아직 리뷰·머지·push 여부를 결정하지 않았다. 다음 세션에는 git 상태와 함께 이 worktree의 존재를 다시 확인한다.

- **worktree**: `/Users/hyojung/orca/workspaces/analytics-platform/kernel-context-url-scope` (Orca worktree id `2ac6391e-6480-46bd-9078-c0d3920f37b9::/Users/hyojung/orca/workspaces/analytics-platform/kernel-context-url-scope`)
- **branch**: `hjung3113/kernel-context-url-scope`, base `41067ab`, **origin에 push 안 함**
- **로컬 커밋 4개** (모두 이 세션, Astra↔Opus 교차 검토를 거침):
  1. `10f270d` — Context/URL/Scope codec (Python, `prototypes/kernel-context-url-scope/`)
  2. `479699c` — Unit A: App Shell + Menu Registry (React/TS, `prototypes/kernel-app-shell/`)
  3. `f8aa5ad` — Unit B: Analysis Chart Frame (React/TS + ECharts, `prototypes/kernel-chart-frame/`)
  4. `bb36929` — Unit C: PlatformDataTable + DetailDrawer (React/TS + TanStack, `prototypes/kernel-platform-table/`)

## 이번 세션에서 한 일

1. **핸드오프 로테이션 마무리**: 직전 세션이 커밋하지 않은 HANDOFF.md/INDEX.md 갱신을 커밋·push(`41067ab`).
2. **Kernel 첫 단위(Context/URL/Scope)**: 사용자 승인 후 Astra→Opus→Astra 3라운드로 Python codec 프로토타입 완성(14 tests). 별도 기록은 아래 "필요할 때만 읽는 기록" 참고.
3. **사용자가 이후 범위를 "플랫폼 공통 갈래만(메뉴 화면 제외)"로 확정** — App Shell/Menu Registry, Chart Frame 계약, Platform Component 1-2개(PlatformDataTable/DetailDrawer). AGENTS.md의 "메뉴 3개 이상 연속 제작 전 범위 확인" 가드레일에 따라 진행 전 `AskUserQuestion`으로 이 범위를 먼저 확인받았다.
4. **`orca orchestration`으로 Unit A/B/C를 동일한 Astra(draft)→Opus(compliance-only review)→Astra(fix) 루프로 순차 실행**(Run `run_1aabb0c30482`, 같은 worktree에서 계속). 매 라운드 결과를 **내가 직접 재실행해서 검증**했다(worker 자체 보고를 그대로 신뢰하지 않음) — Unit C에서는 이 재검증으로 "13 tests PASS" 주장이 실제로는 25%가량 실패하는 flaky 테스트였음을 직접 잡아냈다.

   | Unit | 내용 | Opus 판정(1차) | 조치 | 최종 |
   | --- | --- | --- | --- | --- |
   | A — App Shell + Menu Registry | React/TS, codec을 TS로 이식(Python 대비 95개 parity vector로 교차검증), named Shell Slots(§8)를 타입 수준으로 강제, 합성 fixture 3개(실제 메뉴 아님) | PASS-WITH-MINOR(0 blocking/8 minor) | 상태 라벨 오류(Decided를 Open으로 오표기) 정정, 문구 과장 정정, Python 원본의 Unicode 버그 발견·기록(수정은 안 함) | 109 tests, 사용자 확인 8개 |
   | B — Analysis Chart Frame | React/TS + 실제 Apache ECharts 6.1.0(SVG SSR), Toolbar 7종, 4층 상태 분리(Global/Page Filter/Chart Local/Persistent Annotation) | PASS-WITH-MINOR(0 blocking/9 minor) | **실제 버그 2건 수정**: Empty 상태 오분류(숨김/Brush범위와 진짜 0건 혼동), Compare 시 주석 중복 렌더링 | 23 tests, 사용자 확인 6개 |
   | C — PlatformDataTable + DetailDrawer | React/TS + TanStack Table/Virtual, 실제 Playwright/Chromium 테스트, 2000행 합성 서버(≤250행 응답) | **FAIL(1 blocking/5 minor)** | Opus가 loading 상태의 `useEffect` 타이밍 결함을 근본 원인까지 진단(15회+15회 재현으로 확정) → Astra가 동기 파생 상태로 수정, 15연속 실행(135회) 재검증. 내가 추가로 8회 독립 재실행해 확인 | 5 vitest + 9×N playwright, 사용자 확인 5개 |

5. **세 Unit 모두 worktree 안에서 커밋했다. main에는 아무 것도 반영하지 않았다.** 원본 계약 문서(docs/06, docs/04, CONTEXT.md, ADR, DESIGN.md)는 4개 커밋 내내 무변경 — 매 라운드 Opus가 diff 확인, 내가 재확인.

## 프론트엔드 기술 스택 — 2026-09-25 사용자 결정으로 해소

19개 확인 항목 중 "기술 스택 실채택" 3개(Unit A #5, Unit B #1, Unit C #2)는 이 세션 안에서 사용자가 직접 결정해 **해소했다**. FeedbackOps(`products/feedbackops`)의 실사용 비-백엔드 스택을 그대로 가져오기로 했다 — React+TS+Vite, TanStack Router/Query, Zustand, react-hook-form+zod, lucide-react, sonner, cmdk, Playwright+Vitest는 FeedbackOps와 동일. **UI 컴포넌트는 FeedbackOps `packages/ui/src/components/shadcn/`의 실제 shadcn/ui 컴포넌트 22개(+`cn()` 헬퍼)를 이식**하기로 확정 — FeedbackOps는 shadcn을 패턴만 따라한 게 아니라 실제 shadcn 소스를 커스터마이즈해 썼다(devtool 확인 완료). 스타일링은 FeedbackOps의 Tailwind v3가 아니라 **v4로 마이그레이션**(사용자 명시 결정) — FeedbackOps 자체는 이 결정으로 소급 변경하지 않는다. 테이블/차트는 FeedbackOps에 선례가 없어 이 세션 Unit C/B에서 검증한 **TanStack Table+Virtual**, **Apache ECharts**를 그대로 채택했다. `docs/04_frontend_ui_ux.md`(Decided 섹션 신설), `docs/06_platform_ui_contract.md` §13, `PLATFORM_REQUIREMENTS.md` 체크리스트 3곳에 반영·커밋함(main, 커밋 예정 해시는 다음 `git log` 참고).

남은 것: 실제 FeedbackOps 컴포넌트/토큰 이식 작업(코드 포팅), Tailwind v3→v4 문법 변환, 정확한 라이브러리 버전 고정 — 이건 "결정"이 아니라 "구현" 항목이라 별도 작업으로 남긴다.

## 사용자 확인 필요 — 나머지 16개 (스택 3개 해소 후, 주제별 정리)

세션 종료 시 사용자에게 한 번에 전달하기로 한 목록이다. 각 Unit의 work order에 원문과 판단 근거가 있다. **이미 Decided인 사항(room_name Scope 축, EquipmentID 전역 유일, Condition/Selection 2계층, §6.3 시간 계약 형태, 프론트엔드 기술 스택 등)은 여기 없다 — 재질문 대상이 아니다.**

**인증/권한**
- 실제 SSO·서버 권한/Scope 재검증 연동 (Unit A #1, Unit C #1)
- Scope 선택지의 실제 데이터 원천과 계층 상속 규칙 (Unit A #2)
- Registry의 requiredPermissions/requiredScope를 Shell이 소비해 메뉴 노출을 판단할지 (Unit A #8, Deferred)

**UX 정책**
- Condition 편집 시 기존 Selection 처리 UX (Unit A #4 — 06 §6.4가 이미 "Candidate"로 지정한 것을 구현할 때 확정 필요)
- Chart Selection Summary 안의 Pan/Brush/Apply 배치 정리 (Unit B #5)
- Zoom-out/viewport 복귀를 Toolbar vocabulary에 넣을지 (Unit B #6)
- 필터 변경 후 결과 밖으로 벗어난 행의 선택을 유지·표시할지 (Unit C #5)

**후속 구현 범위(Deferred)**
- 전역 검색 인덱스·Command Palette 실검색 (Unit A #3)
- 기간·지표 등 profile 밖 Context의 이 codec 구현 범위 — 계약 자체는 Decided, 시간 지원 메뉴 전 반드시 닫아야 함 (Unit A #6)
- Annotation 영구 저장·권한·Audit·편집 모델 (Unit B #2)
- Export 실제 포맷·범위·권한 (Unit B #3, Unit C #3)
- DetailDrawer의 실제 Audit 데이터 연동 (Unit C #4)

**아키텍처 — 의도적으로 지금 결정하지 않음**
- Chart의 Interaction Contract(Toolbar 구성·Reset 의미론·Brush→Apply 경계)를 공통 Frame으로 승격할지 — §14 Promotion Rule에 따라 두 번째 consumer가 생기기 전에는 승격하지 않는다(Unit B #4, Deferred by design)

**별도 수정 필요(버그, 결정 아님)**
- Python 원본 codec(`prototypes/kernel-context-url-scope/context_url.py`)의 Unicode 서로게이트 처리 버그: Condition에 `\ud800`류 입력 시 `ContractError`가 아니라 `UnicodeEncodeError`로 죽는다. Unit A의 TS parity 테스트 중 발견. 이 세션에서는 원본 Python 파일을 고치지 않았다(범위 밖 worker 제약) — 별도로 고쳐야 한다.

## 다음 세션에서 할 일

1. **먼저 확인**: `git status --short`, worktree/브랜치가 아직 존재하는지(`orca worktree list --repo id:2ac6391e-6480-46bd-9078-c0d3920f37b9 --json`).
2. **사용자 결정 대기**: 위 19개 확인 항목, 그리고 이 4-커밋 브랜치를 PR로 올릴지/계속 확장할지/Candidate 증명으로만 남길지.
3. Python codec의 Unicode 버그(위 "별도 수정 필요")는 별도 작업으로 일정을 잡는다.
4. 다섯 갈래 중 아직 안 건드린 것: **메뉴간 연결(Cross-menu Context Link, §22)** 실제 검증, **레이아웃**(5개 Page Archetype) 검증. 다음 플랫폼 갈래 후보다 — 사용자가 이번처럼 범위를 먼저 확정해야 한다.

## 남은 범위 (변경 없음)

- **M5 — 실제 구현 때 적용:** 이 4개 프로토타입이 M5를 만족하는지는 아직 판단하지 않았다 — worktree 전용이고 PR/리뷰 기록이 없다. main에 반영할 때 계약 원문 revision → 코드 → 테스트 결과 연결을 다시 정리한다.
- **M6 — 실제 변경 3건 이후 평가:** 아직 실행하지 않았다(main 미반영이라 카운트하지 않음).
- CFG의 메뉴 간 연계(§22)는 Deferred로 유지.

## 이번 검증과 기록

매 Unit·매 라운드 `worker_done` 보고를 그대로 신뢰하지 않고 내가 직접 재실행했다: Unit A 109 tests, Unit B 23 tests, Unit C 5 vitest + Playwright(최종 15+8=23회 연속 무실패) 모두 로컬 재확인. Unit C에서는 코디네이터 재실행이 Astra의 최초 "13 tests PASS" 주장과 다른 결과(4번 중 1번 실패)를 내어, 이를 Opus 리뷰 지시에 명시적으로 포함시켰고 Opus가 근본 원인을 확정했다. 원본 계약 문서 무변경은 매 라운드 `git diff`로 이중 확인했다. 브라우저 실사용(수동 시각 검토)은 4개 프로토타입 모두 미실행 — README에 각각 명시돼 있다.

## 보존할 경계

- Decided는 구현 완료가 아니다. 위 19개 확인 항목을 임의로 결정하지 않는다.
- FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 및 독립 parser 책임을 유지한다.
- GPT-6(Astra 포함), Claude Opus 5.5, Grok 4.7을 사용한다. 호출 가용성은 실제 확인하며 과거 모델명은 고치지 않는다.
- 역사 snapshot/외부 원본은 덮어쓰지 않는다. 문서 검증을 제품 런타임 검증으로 보고하지 않는다.
- 이 4개 프로토타입은 별도 worktree/브랜치에만 존재한다 — main의 Decided 상태를 바꾸지 않았다.
- AGENTS.md의 "메뉴 3개 이상 연속 제작 전 범위 확인" 가드레일은 이번에도 지켰다(메뉴 화면 0개 제작, 사전에 `AskUserQuestion`으로 범위 확정).

## 필요할 때만 읽는 기록

[직전 HANDOFF(2026-09-24) 전체](.agents/reports/handoff-history-through-2026-09-25.md) · [2차 인터뷰(리뷰 결론 10개)](docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md). 4개 Unit의 work order·compliance review·프로토타입은 main에 없다 — `hjung3113/kernel-context-url-scope` 브랜치의 `.agents/reports/kernel-work-order-*-draft.md` / `-compliance-review.md`와 `prototypes/kernel-*/`에서 확인한다(파일 링크 아님, main 체크아웃에는 존재하지 않음). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
