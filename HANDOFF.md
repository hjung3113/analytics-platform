# Handoff — 2026-09-23 문서 통합·축약

## 현재 상태

M1 `ce4687f`, M2 `d20efe0`, M3 `c09c101`, M4 데이터 정책 이관·요약 정렬 `897bf34` 완료. 이번 변경은 사용자 요청에 따른 후속 문서 축약이며 커밋 해시는 `git log -1`로 확인한다. push·제품 구현·새 제품 결정은 범위 밖이다.

- 05의 중복 Recipe/StGroup·기간·시각화 설명을 현행 원본 포인터로 줄였다. 고유한 프리셋 범위·재검토 조건은 06으로 옮겼고, 메뉴 활용률 정책은 05에 남겼다.
- 과거 Phase 표는 결정 이력으로, 누적 HANDOFF는 과거 기록으로 분리했다. 삭제한 근거나 제품 예외는 없다.
- 현재 문서 책임: 06 전역 행동/Context/URL/Scope/메뉴 확장, DESIGN 시각 규격, 01 데이터·운영 정책, 03/04 기술 후보, 05 결정 상태와 남아 있는 정책 상세, REQUIREMENTS 파생 작업 목록.

## 다음 세션 시작

1. AGENTS와 Git/submodule 상태를 확인하고 [INDEX](docs/INDEX.md)에서 작업별 원본을 찾는다.
2. [이번 정리 기록](.agents/reports/m4-document-consolidation-2026-09-23.md)의 보존 매핑·검증 한계를 확인한다.
3. 제품 작업을 시작할 때 미결 입력을 해당 작업 범위에서 확인한다. M5는 실제 코드·검증 증거 연결, M6는 실제 변경 사례의 탐색/유지 비용 평가이며 아직 실행하지 않았다. 이 문서는 제품 구현 승인이 아니다.

## 보존할 경계

- Decided는 구현 완료가 아니다. 필드명/기술 Candidate, Scope 상속·최초 기본 Δ·시간역 근거·SSO 프로토콜 등 Open을 임의 결정하지 않는다. 자세한 상태는 각 원본 문단을 따른다.
- FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 및 독립 parser 책임을 유지한다.
- 앞으로 GPT-6(Luna/Sol 포함), Grok 4.7을 사용한다. 호출 가용성은 실제 확인하며 과거 모델명은 고치지 않는다.
- 역사 snapshot/validation.json/외부 원본은 덮어쓰지 않는다. 문서 검증을 제품 런타임 검증으로 보고하지 않는다.

## 필요할 때만 읽는 기록

[이전 HANDOFF 전체](.agents/reports/handoff-history-through-2026-09-23.md) · [문서 운영 설계·토론](.agents/reports/doc-operations-2026-09-22/migration-plan.md) · [M4 이관 기록](.agents/reports/m4-data-policy-migration-2026-09-23.md). 과거 지시와 미커밋 상태는 당시 기록이며 현재 요청과 Git 상태를 대체하지 않는다.
