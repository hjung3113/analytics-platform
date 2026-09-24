# Handoff — 2026-09-23 문서 통합·PR 리뷰 보강

## 현재 상태

M1 `ce4687f`, M2 `d20efe0`, M3 `c09c101`, M4 데이터 정책 이관·요약 정렬 `897bf34` 완료. 후속 축약은 `9710a6c`에 반영했다. [PR #3](https://github.com/hjung3113/analytics-platform/pull/3)은 **MERGED**(2026-09-23), 보강 커밋 `80681b6`, merge 커밋 `3409c47`이다. 이번 인계 갱신 시작 시 로컬 `main`은 `origin/main`과 일치하고 작업 트리는 clean이었다. 다음 세션에는 다시 확인한다. 제품 구현·새 제품 결정은 범위 밖이다.

- 05의 중복 Recipe/StGroup·기간·시각화 설명을 현행 원본 포인터로 줄였다. 고유한 프리셋 범위·재검토 조건은 06으로 옮겼고, 메뉴 활용률 정책은 05에 남겼다.
- 과거 Phase 표는 결정 이력으로, 누적 HANDOFF는 과거 기록으로 분리했다. 삭제한 근거나 제품 예외는 없다.
- PR 리뷰 보강: DESIGN의 기간 토큰·메뉴 그룹을 현행 계약에 맞추고, 06의 Open/Candidate 안내·05/REQUIREMENTS의 남은 질문·Phase 가설 표시·과거 자료의 현재 원본 경로를 정렬했다. Opus 5.5 Medium과 GPT-6 Astra Medium의 독립 검토 및 수정 판단은 PR 본문에서 확인한다.
- 현재 문서 책임: 06 전역 행동/Context/URL/Scope/메뉴 확장, DESIGN 시각 규격, 01 데이터·운영 정책, 03/04 기술 후보, 05 결정 상태와 남아 있는 정책 상세, REQUIREMENTS 파생 작업 목록.

## 다음 세션에서 할 일 — 첫 Kernel 구현 작업의 준비

문서 구조 정비 M1–M4는 완료했다. 다시 폴더를 재편하거나 과거 보고서를 전수 재작성하는 작업부터 시작하지 않는다. 다음 권장 작업은 **Platform Kernel의 첫 구현 단위를 정하고, 그 단위에 필요한 결정·근거·수용 기준을 준비하는 것**이다. 아직 구현 단위나 기술 후보의 채택을 승인한 것은 아니다.

1. AGENTS, `git status --short`, 현재 branch/HEAD와 PR 상태, submodule 상태를 확인한다. [INDEX](docs/INDEX.md) → [06 Kernel 계약](docs/06_platform_ui_contract.md) §4–6/§8/§17–19/§26/§28–29 → [REQUIREMENTS 미결 질문](PLATFORM_REQUIREMENTS.md#open-questions--미결-범위와-결정-이력)을 읽는다. 시각값은 DESIGN, 데이터·R/H는 01을 따른다.
2. **첫 구현 단위 제안 1개**를 작성한다. 후보는 App Shell·Menu Registry·Context/URL 연결 중 작게 검증할 수 있는 범위다. 전체 메뉴 구현으로 확대하지 말고 목표 동작, 포함/제외 범위, 원본 절·revision, 입력/출력·실패 조건, Platform Done 수용 사례를 적는다. 이 후보 순서는 확정 로드맵이 아니다.
3. 선택한 범위에 필요한 사용자 질문만 추린다. 우선 실제 사용 흐름·첫 검증 consumer를 확인하고, Scope 상속/SSO 사양, 시간 assertion·최초 기본 Δ, 데이터 규모·조회 제한/브라우저 지원 중 **그 동작을 막는 입력**을 구분한다. 사용자 판단과 담당자·원천 자료 조사를 나누고, 질문별 결정 주체(미지정이면 지정 필요), 영향, 답변 전 가능한 일을 기록한다. FastAPI·Site→Line·기간 프리셋 등 이미 결정된 사항을 다시 묻지 않는다.
4. 기술 Candidate(공개 schema 형식, UI primitive/차트 등)는 위 범위에 필요한 것만 비교한다. 모델 합의나 기존 FeedbackOps 구현을 채택 승인으로 사용하지 않는다. 범위/수용 기준과 미결 의존을 검토한 뒤 사용자의 구현 요청에 따라 착수한다.

**다음 세션 산출물:** 첫 Kernel 작업 지시서 1개와 우선순위가 있는 미결 질문 목록. 기존 원본의 규칙은 링크하고 복제하지 않는다. 미결 입력이 필요한 동작과 독립적으로 진행 가능한 작업이 구별되면 준비 단계의 완료다.

## 그 뒤의 순서와 남은 범위

- **M5 — 실제 구현 때 적용:** 첫 코드 slice의 작업/PR 기록에 계약 원문 revision → 코드·schema → 실행한 테스트/환경/결과를 연결한다. 코드가 없는데 문서만으로 M5 완료라고 하지 않는다. Platform Done과 Domain Done을 따로 확인한다.
- **M6 — 실제 변경 3건 이후 평가:** 탐색 실패·누락된 영향 관계·유지 비용을 기록한 뒤 추가 분할/자동 색인 필요성을 판단한다. 아직 실행하지 않았다.
- URL만 바꾸는 실제 작업에서는 §6.1/§6.4 인접 영향 경로를 보강한다. Site 용어 정렬과 메뉴 활용률 파생 설명 축약은 관련 문서를 수정할 때 처리할 비차단 후속 항목이며, 전체 구현을 막는 선행 작업이 아니다.

## 이번 검증과 기록

Opus 5.5 Medium·GPT-6 Astra Medium 독립 리뷰 후 보강했고, Astra 최종 diff 검토는 PASS였다. 변경 Markdown 48개/로컬 링크·anchor 285개 오류 0, 공백 검사 및 시간/R/H 본문·체크 상태·과거 기록·gitlink 보존 검사를 통과했다. 전체 archive 의미 감사, 브라우저 anchor 동작, 제품 런타임·외부 upstream은 검증하지 않았다. 리뷰 판단과 실행 근거는 PR #3 본문, M4 보존 매핑은 [정리 기록](.agents/reports/m4-document-consolidation-2026-09-23.md)에 있다. `/tmp` 리뷰 파일은 영구 인계 근거로 의존하지 않는다.

## 보존할 경계

- Decided는 구현 완료가 아니다. 필드명/기술 Candidate, Scope 상속·최초 기본 Δ·시간역 근거·SSO 프로토콜 등 Open을 임의 결정하지 않는다. 자세한 상태는 각 원본 문단을 따른다.
- FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 및 독립 parser 책임을 유지한다.
- 앞으로 GPT-6(Luna/Sol 포함), Grok 4.7을 사용한다. 호출 가용성은 실제 확인하며 과거 모델명은 고치지 않는다.
- 역사 snapshot/validation.json/외부 원본은 덮어쓰지 않는다. 문서 검증을 제품 런타임 검증으로 보고하지 않는다.

## 필요할 때만 읽는 기록

[이전 HANDOFF 전체](.agents/reports/handoff-history-through-2026-09-23.md) · [문서 운영 설계·토론](.agents/reports/doc-operations-2026-09-22/migration-plan.md) · [M4 이관 기록](.agents/reports/m4-data-policy-migration-2026-09-23.md). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
