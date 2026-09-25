# Handoff — 2026-09-25 Kernel + 플랫폼 공통 3갈래 프로토타입, 프론트엔드 스택 Decided

## 현재 상태

`main`은 커밋 `044de58`, `origin/main`과 일치, 작업 트리 clean. **이번 세션의 코드 산출물(프로토타입 4개)은 main이 아니라 별도 Orca worktree/브랜치에 있다** — 아직 PR·머지·push 여부를 결정하지 않았다.

- **worktree**: `/Users/hyojung/orca/workspaces/analytics-platform/kernel-context-url-scope` (Orca worktree id `2ac6391e-6480-46bd-9078-c0d3920f37b9::/Users/hyojung/orca/workspaces/analytics-platform/kernel-context-url-scope`)
- **branch**: `hjung3113/kernel-context-url-scope`, base `41067ab`(main보다 3커밋 뒤처짐 — 아래 참고), **origin에 push 안 함**
- **로컬 커밋 4개** (모두 이 세션, Astra↔Opus 교차 검토 완료):
  1. `10f270d` — Context/URL/Scope codec (Python, `prototypes/kernel-context-url-scope/`, 14 tests)
  2. `479699c` — Unit A: App Shell + Menu Registry (React/TS, `prototypes/kernel-app-shell/`, 109 tests)
  3. `f8aa5ad` — Unit B: Analysis Chart Frame (React/TS + ECharts, `prototypes/kernel-chart-frame/`, 23 tests)
  4. `bb36929` — Unit C: PlatformDataTable + DetailDrawer (React/TS + TanStack, `prototypes/kernel-platform-table/`, 5 vitest + Playwright)
- **주의**: 이 브랜치는 `41067ab` 기준이라 main의 최근 3커밋(핸드오프 갱신 2건 + 프론트엔드 스택 Decided)을 반영하지 못한다. 특히 Unit A work order의 "production router/state/UI stack 채택" 확인 항목은 이제 main에서 **Decided로 해소됐다** — 이 브랜치를 다시 열 때 그 사실을 work order에 반영하거나, 최소한 main을 rebase/merge해서 동기화한다.

## 이번 세션 전체 요약

1. **핸드오프 로테이션 마무리**(`41067ab`): 직전 세션이 커밋 안 한 HANDOFF/INDEX 갱신 정리.
2. **Kernel 첫 단위 — Context/URL/Scope codec**: Astra→Opus→Astra 3라운드. room_name Scope + Equipment Group Condition/Selection 2계층의 URL 왕복을 Python으로 증명(14 tests). Claude 아티팩트로도 재현해 공개: [Scope Contract Console](https://claude.ai/artifact/UCcdxht21KCBvwc7REvKrE) — 실제 codec 로직을 JS로 포팅한 인터랙티브 콘솔.
3. **사용자가 이후 범위를 "플랫폼 공통 갈래만(메뉴 화면 제외)"로 확정** — AGENTS.md "메뉴 3개 이상 연속 제작 전 범위 확인" 가드레일에 따라 `AskUserQuestion`으로 먼저 확인받음.
4. **플랫폼 공통 3개 Unit을 동일한 Astra(draft)→Opus(compliance-only)→Astra(fix) 루프로 순차 실행**(`orca orchestration`, Run `run_1aabb0c30482`). 매 라운드 결과를 내가 직접 재실행해 검증(worker 자체 보고를 신뢰하지 않음):

   | Unit | 내용 | Opus 1차 판정 | 발견·조치 |
   | --- | --- | --- | --- |
   | A — App Shell + Menu Registry | codec를 TS로 이식(Python 대비 95개 parity vector 교차검증), §8 named Shell Slots를 타입 수준으로 강제, 합성 fixture 3개 | PASS-WITH-MINOR(0 blocking/8 minor) | 상태 라벨 오표기(Decided→Open 오기) 정정, **Python 원본의 Unicode 서로게이트 버그 발견**(수정은 범위 밖) |
   | B — Analysis Chart Frame | 실제 Apache ECharts 6.1.0 SVG SSR, Toolbar 7종, 4층 상태 분리 | PASS-WITH-MINOR(0 blocking/9 minor) | **실버그 2건 수정**: Empty 오분류, Compare 시 주석 중복 렌더 |
   | C — PlatformDataTable + DetailDrawer | TanStack Table/Virtual, 실제 Playwright/Chromium, 2000행 합성 서버 | **FAIL(1 blocking/5 minor)** | "13 tests PASS" 주장이 재현 안 됨(내 재실행 4번 중 1번 실패) → Opus가 `useEffect` loading 타이밍 결함까지 근본 원인 진단 → Astra가 동기 파생 상태로 수정, 15+8회 연속 무실패로 재확인 |

5. **원본 계약 문서는 4개 커밋 내내 무변경** — 매 라운드 Opus가 `git diff`로 확인, 나도 재확인. 메뉴 화면은 0개 제작.
6. **프론트엔드 기술 스택 결정**(`ae50326`~`044de58`, main): FeedbackOps(`products/feedbackops`)의 실사용 비-백엔드 스택을 채택 — React+TS+Vite, TanStack Router/Query, Zustand, react-hook-form+zod, lucide-react, sonner, cmdk, Playwright+Vitest. **UI 컴포넌트는 FeedbackOps `packages/ui/src/components/shadcn/`의 실제 shadcn/ui 컴포넌트 22개+`cn()` 헬퍼를 이식**(FeedbackOps가 shadcn 패턴만 흉내낸 게 아니라 실제 소스를 커스터마이즈해 썼음을 코드로 확인). 예외 2가지: 스타일링은 FeedbackOps의 Tailwind v3가 아니라 **v4**로(FeedbackOps 자체는 소급 변경 안 함), 테이블/차트는 FeedbackOps에 선례가 없어 이 세션에서 검증한 **TanStack Table+Virtual / Apache ECharts**를 그대로 채택. `docs/04`(Decided 섹션 신설)·`docs/06` §13·`PLATFORM_REQUIREMENTS.md` 체크리스트 3곳에 반영.

## 사용자 확인 필요 — 16개 (기술 스택 3개는 해소됨, 재질문 대상 아님)

각 항목의 원문·근거는 브랜치의 해당 Unit work order에 있다. **이미 Decided인 사항은 여기 없다.**

**인증/권한**
- 실제 SSO·서버 권한/Scope 재검증 연동 (Unit A #1, Unit C #1)
- Scope 선택지의 실제 데이터 원천과 계층 상속 규칙 (Unit A #2)
- Registry의 requiredPermissions/requiredScope를 Shell이 소비해 메뉴 노출을 판단할지 (Unit A #8, Deferred)
- 권한 밖 EquipmentID를 `not_found`와 `forbidden`으로 구분해 노출할지 — 같은 Site DB enumeration 위험, 06이 정의하지 않음; 보안·권한 정책 담당자 지정 필요 (Context/URL/Scope codec P0)

**UX 정책**
- Condition 편집 시 기존 Selection 처리 UX (Unit A #4 — §6.4가 Candidate로 지정한 것, 구현 시 확정 필요)
- Chart Selection Summary 안의 Pan/Brush/Apply 배치 정리 (Unit B #5)
- Zoom-out/viewport 복귀를 Toolbar vocabulary에 넣을지 (Unit B #6)
- 필터 변경 후 결과 밖으로 벗어난 행의 선택을 유지·표시할지 (Unit C #5)

**후속 구현 범위(Deferred)**
- 전역 검색 인덱스·Command Palette 실검색 (Unit A #3)
- 기간·지표 등 profile 밖 Context의 이 codec 구현 범위 — 계약은 Decided, 시간 지원 메뉴 전 반드시 닫아야 함 (Unit A #6)
- Annotation 영구 저장·권한·Audit·편집 모델 (Unit B #2)
- Export 실제 포맷·범위·권한 (Unit B #3, Unit C #3)
- DetailDrawer의 실제 Audit 데이터 연동 (Unit C #4)

**아키텍처 — 의도적으로 지금 결정하지 않음**
- Chart Interaction Contract를 공통 Frame으로 승격할지 — §14 Promotion Rule(2번째 consumer 전까지 승격 안 함)에 따라 Deferred (Unit B #4)

**공개 URL 계약**
- 공개 URL 후보 키/표식/Condition JSON 별칭 이행과 공유 스키마 형식 승인 — 플랫폼 계약 담당자 지정 필요 (Context/URL/Scope codec P1, 06 §6.1/6.4, Requirements OQ7)

**버그(결정 아님, 별도 수정 필요)**
- Python codec(`prototypes/kernel-context-url-scope/context_url.py`)의 Unicode 서로게이트 처리 버그 — `\ud800`류 Condition 입력 시 `ContractError` 대신 `UnicodeEncodeError`로 죽음.

## 다음 세션 추천 작업

우선순위 순:

1. **가장 먼저 결정할 것 — 이 브랜치의 운명.** PR로 올려 리뷰할지 / 계속 이 위에 쌓을지 / Candidate 증명으로만 남기고 재작성할지. 이후 모든 작업이 이 결정에 갈린다.
2. **(계속 쌓기로 하면) 자연스러운 다음 작업 — Decided 디자인 시스템 이식.** Unit A/B/C는 지금 손으로 짠 CSS/Tailwind를 쓴다. 방금 Decided된 FeedbackOps shadcn 컴포넌트 22개 + 토큰(ADR-0021)을 이식해서 세 프로토타입을 실제 디자인 시스템 위로 옮기는 게 다음으로 자연스럽다 — 새 Unit을 여는 게 아니라 기존 3개를 정합시키는 작업이라 범위가 명확하고, Unit A work order의 "production stack 채택" 확인 항목도 이걸로 자동 해소된다.
3. **Python Unicode 버그 수정** — 작고 독립적, 아무 때나 스케줄 가능.
4. **다섯 갈래 중 미착수 2개**: 메뉴간 연결(Cross-menu Context Link, §22), 레이아웃(5개 Page Archetype). 둘 다 지금 있는 Kernel/Component 위에서 검증 가능하지만, **디자인 시스템 이식이 먼저 끝난 뒤** 하는 게 낫다 — 안 그러면 새 화면을 두 번 다시 만드는 꼴이 된다.
5. 메뉴 화면 실제 제작은 여전히 다음 순서가 아니다(AGENTS.md 가드레일 — 착수 전 범위를 사용자와 다시 확인).

## 남은 범위 (변경 없음)

- **M5 — 실제 구현 때 적용:** 4개 프로토타입이 M5를 만족하는지 아직 판단 안 함(worktree 전용, PR/리뷰 기록 없음). main 반영 시 계약 원문 revision → 코드 → 테스트 결과 연결을 정리한다.
- **M6 — 실제 변경 3건 이후 평가:** 아직 실행 안 함(main 미반영이라 카운트 안 함).
- CFG의 메뉴 간 연계(§22)는 Deferred 유지.

## 이번 검증과 기록

매 Unit·매 라운드 `worker_done` 보고를 그대로 신뢰하지 않고 직접 재실행: Unit A 109 tests, Unit B 23 tests, Unit C 5 vitest + Playwright(최종 15+8=23회 연속 무실패) 모두 로컬 재확인. Unit C는 내 재실행이 Astra의 최초 "13 tests PASS" 주장과 다른 결과(4번 중 1번 실패)를 내어 Opus 리뷰 지시에 명시 포함시켰고, Opus가 근본 원인(loading state race)을 확정했다. 원본 계약 문서 무변경은 매 라운드 `git diff`로 이중 확인. 브라우저 실사용(수동 시각 검토)은 4개 프로토타입 모두 미실행 — 각 README에 명시.

## 보존할 경계

- Decided는 구현 완료가 아니다. 위 16개 확인 항목을 임의로 결정하지 않는다.
- FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 및 독립 parser 책임을 유지한다. FeedbackOps 자체 코드(Tailwind v3 등)는 이번 결정으로 소급 변경하지 않았다.
- GPT-6(Astra 포함), Claude Opus 5.5, Grok 4.7을 사용한다. 호출 가용성은 실제 확인하며 과거 모델명은 고치지 않는다.
- 역사 snapshot/외부 원본은 덮어쓰지 않는다. 문서 검증을 제품 런타임 검증으로 보고하지 않는다.
- 4개 프로토타입은 별도 worktree/브랜치에만 존재한다 — main의 Decided 상태를 바꾸지 않았다.
- AGENTS.md "메뉴 3개 이상 연속 제작 전 범위 확인" 가드레일을 지켰다(메뉴 화면 0개 제작, 사전에 `AskUserQuestion`으로 범위 확정).

## 필요할 때만 읽는 기록

[직전 HANDOFF(2026-09-24) 전체](.agents/reports/handoff-history-through-2026-09-25.md) · [2차 인터뷰(리뷰 결론 10개)](docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md) · [Scope Contract Console 아티팩트](https://claude.ai/artifact/UCcdxht21KCBvwc7REvKrE). 4개 Unit의 work order·compliance review·프로토타입은 main에 없다 — `hjung3113/kernel-context-url-scope` 브랜치의 `.agents/reports/kernel-work-order-*-draft.md` / `-compliance-review.md`와 `prototypes/kernel-*/`에서 확인한다(파일 링크 아님, main 체크아웃에는 존재하지 않음). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
