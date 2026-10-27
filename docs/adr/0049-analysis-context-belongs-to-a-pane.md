# 분석 Context는 화면이 아니라 칸에 속한다 — 본 화면은 칸이 하나인 경우

상태: **Decided (2026-10-19, 결정자: 사용자 — #421 설계 질의 Q4·Q9·Q11)** — 구현은 [#421](https://github.com/hjung3113/analytics-platform/issues/421). 세부 규칙은 [06 §6.5](../contract/kernel.md#65-분석-context의-범위--칸-decided-adr-0049), 보드 사양은 [16](../design/analysis-board.md).

06 §6은 화면 하나에 분석 Context 하나를 두고, 셸 Context 바가 그것을 편집하며, 값은 URL이 소유한다(§6.4). 분석 보드([16](../design/analysis-board.md))는 한 화면에 메뉴 여러 개를 나란히 놓고 칸마다 다른 조건(지난달 vs 이번 달, PHOTO vs ETCH)으로 본다. 그러면 "화면당 Context 하나"가 성립하지 않는다.

## 결정

- **분석 Context의 단위는 칸이다.** 본 화면은 칸이 하나뿐인 경우로 본다. 06이 말하던 "전역 Context"는 "현재 칸의 분석 Context"로 읽는다. 본 화면의 동작은 바뀌지 않는다.
- **칸 Context는 Kernel이 칸마다 하위 Provider로 준다.** 메뉴는 지금처럼 Kernel 훅으로만 Context와 page 상태를 읽고 쓰며, 어느 칸에 있는지 모른다. 본 화면의 칸은 값을 URL에 두고, 보드의 칸은 보드 상태에 둔다. 저장 위치만 Kernel이 바꾼다.
- **칸끼리 상속하지 않는다.** 새 칸은 기본 조건을 복사해 시작하고 그 뒤로는 독립이다. 여러 칸을 맞출 때는 명시적 일괄 동작을 쓴다(소유자, 2026-10-18).
- **메뉴·모듈 코드는 URL을 직접 읽거나 쓰지 않는다.** 이것이 깨지면 칸 범위 Context를 Kernel 한 곳에서 바꿀 수 없다. 2026-10-19 기준 메뉴 제품 코드의 위반은 0건이다.
- 용어: 문서는 "분석 Context"를 쓰고 "전역 Context"를 피한다([GLOSSARY](../../GLOSSARY.md)). 코드 이름 `usePlatform().global`은 이번에 바꾸지 않는다.

## Considered Options

- **(a, 채택) 칸 단위로 일반화:** 메뉴가 모드를 하나만 안다. 비용은 Kernel이 Context 출처(URL / 보드 상태)를 바꿔 끼울 수 있게 나뉘는 것.
- **(b) 보드만 예외:** 06 문장은 그대로지만 메뉴가 "본 화면 모드 / 보드 모드" 둘을 알아야 하고, 보드에서 Context 바·초기화 키·미지원 보존 규칙이 따로 생긴다.
- **(c) 메뉴에 Context를 props로 넘김:** 메뉴 전체의 Context 읽기 코드가 바뀌고, 모듈 화면(ADR-0038·0039)의 호스트 포트도 다시 써야 한다.

## 결과

- 06 §6.5에 칸 범위 규칙을 둔다. §6.1–6.4의 URL 규칙은 본 화면의 칸에 그대로 적용된다.
- Kernel은 지금 Context를 렌더마다 URL에서 파싱한다(`packages/kernel/src/platform.tsx`). 칸 Provider를 위해 읽기·쓰기 출처를 나누는 것이 #421 구현의 중심이다.
- 코드 이름 바꾸기(`global` → 칸 Context)는 메뉴 전체에 닿는 코드 정비라 별도로 남긴다([백로그](../../.planning/backlog.md)).
