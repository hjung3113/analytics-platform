# Handoff — 2026-09-25 첫 Kernel 프로토타입(Context/URL/Scope), Astra↔Opus 교차 검토

## 현재 상태

`main`은 커밋 `41067ab`에서 변경 없음, `origin/main`과 일치, 작업 트리는 clean이다. **이번 세션의 실제 산출물은 main이 아니라 별도 Orca worktree/브랜치에 있다** — 아직 리뷰·머지·push 여부를 결정하지 않았다. 다음 세션에는 git 상태와 함께 이 worktree의 존재를 다시 확인한다.

- **worktree**: `/Users/hyojung/orca/workspaces/analytics-platform/kernel-context-url-scope` (Orca worktree id `2ac6391e-6480-46bd-9078-c0d3920f37b9::/Users/hyojung/orca/workspaces/analytics-platform/kernel-context-url-scope`)
- **branch**: `hjung3113/kernel-context-url-scope`, base `41067ab`, 로컬 커밋 `10f270d` 1개, **origin에 push 안 함**

## 이번 세션에서 한 일

1. **핸드오프 로테이션 마무리**: 직전 세션이 우표만 찍고 커밋하지 않은 HANDOFF.md/INDEX.md 갱신을 커밋·push(`41067ab`). 내용 변경 없음, 정리 커밋.
2. **첫 Kernel 구현 단위 선정**: 직전 HANDOFF가 제시한 3개 후보(App Shell·Menu Registry·Context/URL 연결) 중 **Context/URL 연결(room_name 기준 Scope + Equipment Group Condition/Selection 2계층)**을 선택했다 — 오늘 도메인 모델 정정을 가장 직접 검증하고, 딥링크 왕복이라는 구체적 수용 기준을 잡기 쉬웠기 때문.
3. **Orca orchestration으로 Astra↔Opus 교차 검토 루프를 실행**(`orca orchestration`, Run `run_1aabb0c30482`, 위 worktree에서):
   - **Round 1 (GPT-6 Astra, medium)**: 작업지시서(`​.agents/reports/kernel-work-order-context-url-scope-draft.md`)와 Python 표준 라이브러리 프로토타입(`prototypes/kernel-context-url-scope/`)을 생성. URL→`ContextState`→URL 왕복, Condition(live)/Selection(frozen) 분리, 목적지 ID·Selection 분리, 권한 철회 후 forbidden을 11개 unittest + demo.py로 증명.
   - **Round 2 (Claude Opus 5.5, medium, compliance-only)**: docs/06 §4-6/8/17-19/22/26/28-29, CONTEXT.md, ADR-0002/0004/0005 대비 문장 단위로 대조. 판정 **PASS-WITH-MINOR-ISSUES — BLOCKING 0건, MINOR 3건**(리포트: `.agents/reports/kernel-work-order-context-url-scope-compliance-review.md`).
   - **Round 3 (GPT-6 Astra, medium)**: MINOR 중 M1(범위 밖 등록 키를 거절 대신 보존·미적용 처리, §6.4)과 M2(버전 검사 순서)를 코드로 수정하고 회귀 테스트 3개 추가. M3(권한 밖 EquipmentID의 `not_found`/`forbidden` 구분 노출 — 06이 정하지 않은 정책 질문)는 코드를 바꾸지 않고 work order의 P0 Open 질문으로 기록.
   - 각 라운드 결과를 **내가 직접 재실행해 검증**했다(worker 보고를 그대로 신뢰하지 않음): 최종 `python3 -B -m unittest discover -s prototypes/kernel-context-url-scope -p "test_*.py" -v` → **14 pass / 0 fail**, `python3 -B prototypes/kernel-context-url-scope/demo.py` → 전체 assertion PASS, exit 0.
4. worktree 안에서 커밋(`10f270d`)했다. **main에는 아무 것도 반영하지 않았다.** 원본 계약 문서(docs/06, CONTEXT.md, ADR, PLATFORM_REQUIREMENTS.md)는 세 라운드 내내 무변경 — Opus가 diff 확인, 내가 재확인.

## 다음 세션에서 할 일 — 이 프로토타입을 어떻게 할지 결정

**Decided는 구현 완료가 아니다.** 이 프로토타입은 로컬 round-trip 증명이며, work order가 명시한 대로 App Shell/Menu Registry/실제 SSO·DB/시간축/지표/메뉴 UI를 포함하지 않는다. 다음 세션은 의미 있는 다음 결정이 무엇인지부터 정한다:

1. **먼저 확인**: `git status --short`, `main`이 여전히 `origin/main`과 일치하는지, 그리고 위 worktree/브랜치가 아직 존재하는지(`orca worktree list --repo id:2ac6391e-6480-46bd-9078-c0d3920f37b9 --json`). 다른 세션이 이미 처리했을 수 있다.
2. **결정 필요**: 이 브랜치를 PR로 올려 사람이 리뷰할지, 이 위에서 계속 확장할지(App Shell/Menu Registry로 넓히기 전에), 아니면 Candidate 증명으로만 남기고 별도 구현에서 재작성할지 — 이건 사용자 판단이며 이번 세션은 임의로 push/PR까지 진행하지 않았다.
3. **실제 서비스 채택 전 막는 질문 2개**(work order §"실제 차단 Open 질문"에 우선순위와 함께 기록됨, 재질문 금지):
   - P0: 실제 `scopeId`→Site 연결·room grant를 누가 어떤 상속 규칙으로 공급하는가(도메인·인증 담당 지정 필요) — 이번 라운드에서 권한 밖 ID `not_found` vs `forbidden` 노출 정책도 이 항목에 합쳐졌다.
   - P1: 후보 키/표식/Condition JSON 스키마를 공유 v1 계약으로 승인할 것인가(플랫폼 계약 담당 지정 필요).
4. `room_name` Scope 축·EquipmentID 전역 유일·Condition/Selection 2계층은 이미 Decided이므로 다시 묻지 않는다.

## 남은 범위 (변경 없음)

- **M5 — 실제 구현 때 적용:** 이 프로토타입이 M5를 만족하는지는 아직 판단하지 않았다 — 코드는 있지만 worktree 전용이고 PR/리뷰 기록이 없다. main에 반영할 때 계약 원문 revision → 코드 → 테스트 결과 연결을 다시 정리한다.
- **M6 — 실제 변경 3건 이후 평가:** 아직 실행하지 않았다. 이 프로토타입은 M6가 요구하는 "실제 변경"에 해당하는지 다음 세션에서 판단한다(현재는 main 미반영이라 카운트하지 않는다).
- CFG의 메뉴 간 연계(§22)는 Deferred로 유지.

## 이번 검증과 기록

각 라운드 worker의 `worker_done` 보고를 그대로 신뢰하지 않고, 코드·테스트·verification.log를 내가 직접 열람·재실행했다: Round 1 직후 11/11 pass 확인, Round 3 직후 14/14 pass + demo exit 0 확인, work order·compliance review 문서 본문을 전문 읽음. 원본 계약 문서 무변경은 Opus의 `git diff HEAD -- docs CONTEXT.md PLATFORM_REQUIREMENTS.md` 결과(diff 없음)와 내 `git status --short`로 이중 확인했다. 런타임/브라우저 검증 대상 없음(Python 스크립트·unittest만).

## 보존할 경계

- Decided는 구현 완료가 아니다. 필드명/공개 스키마(Candidate), Scope 상속 세부·SSO 프로토콜·권한 밖 ID 노출 정책 등 Open을 임의 결정하지 않는다.
- FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 및 독립 parser 책임을 유지한다.
- GPT-6(Astra 포함), Claude Opus 5.5, Grok 4.7을 사용한다. 호출 가용성은 실제 확인하며 과거 모델명은 고치지 않는다.
- 역사 snapshot/외부 원본은 덮어쓰지 않는다. 문서 검증을 제품 런타임 검증으로 보고하지 않는다.
- 이 프로토타입은 별도 worktree/브랜치에만 존재한다 — main의 Decided 상태를 바꾸지 않았다.

## 필요할 때만 읽는 기록

[직전 HANDOFF(2026-09-24) 전체](.agents/reports/handoff-history-through-2026-09-25.md) · [2차 인터뷰(리뷰 결론 10개)](docs/reviews/2026-09-24-equipment-routing-domain-interview-round-2.md). Kernel work order 초안·compliance review·프로토타입은 main에 없다 — `hjung3113/kernel-context-url-scope` 브랜치의 `.agents/reports/kernel-work-order-context-url-scope-draft.md` · `-compliance-review.md` · `prototypes/kernel-context-url-scope/`에서 확인한다(파일 링크 아님, main 체크아웃에는 존재하지 않음). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
