# 사이드바 Scope 표시는 공간 필드(`scopePresentation`)로 숨기고, 슬롯은 공간의 자체 선택기용으로 둔다

상태: **Decided (2026-11-02)**.
- 결정자: 사용자 — 2026-11-02, #1108을 나누는 데 승인했다. 설계는 코디네이터(사용자 위임)이며 되돌릴 수 있다.

결정의 소유 계약은 Kernel §9.1(공간 선언·Registry 규칙)과 Layout §8(셸 슬롯)이다. 이슈 [#1251](https://github.com/hjung3113/analytics-platform/issues/1251).

## 배경

사이트와 무관한 업무 시스템(로그 지식 허브가 있는 `log-dev`)에서도 사이드바에 분석 Scope(room_name 기반) 선택기가 뜬다. 메뉴의 `requiresScope: false`는 조회 게이트일 뿐 표시를 바꾸지 못한다.

## 대안

1. **공간 필드 `SpaceDef.scopePresentation`(채택).** 필요가 업무 시스템 단위라 선언도 공간에 둔다.
2. `scopeControl` 슬롯이 빈 컴포넌트를 돌려줘 숨김. 앱마다 같은 빈 컴포넌트를 만들고, 「숨김」이 계약이 아니라 우회가 되며, Registry가 `requiresScope` 충돌을 검사할 수 없다.
3. 메뉴 단위 필드. 지금 소비자가 없다.

## 결정

1. 선택 `scopePresentation?: 'default' | 'hidden'`. 없으면 `'default'`(오늘의 동작, 기존 소비자 변화 없음). `'site'`가 아닌 이유: 기본 표면은 Site가 아니라 분석 Scope 또는 공간의 `scopeControl` 컴포넌트다.
2. `'hidden'`은 `ScopeSelector` 대체만 없앤다. `scopeControl.For`가 돌려준 컴포넌트는 공간의 명시적 표면이라 그대로 그린다(ADR-0081 결정 4). `null`이거나 슬롯이 없으면 접힘·펼침 모두 아무것도 그리지 않는다.
3. Registry는 `'hidden'` 공간에 `requiresScope: true` 메뉴(모듈 메뉴 포함)가 있으면 거부한다. 숨김이 Scope 우회가 되면 안 된다. 표시만 바꾸며 ACL·조회는 그대로다.
4. 엔드포인트·동작은 자기 `requiresScope`를 가지며 Registry가 보지 못한다. 규칙(숨긴 공간의 메뉴는 Scope가 필요한 엔드포인트·동작을 쓰지 않는다)은 필드 JSDoc과 Kernel §9.1에 적고, 앱 통합 테스트가 mock 엔드포인트 목록으로 엔드포인트만 확인한다(동작은 자동 검사 없음 — mock 동작 목록이 생기면 같은 테스트에 넣는다).
5. 첫 소비자는 `log-dev`. `operations`(모든 메뉴 `requiresScope: false`)도 나중에 같은 플래그를 의미 변화 없이 쓸 수 있다.

## 결과

- 메뉴 단위 재정의는 구현하지 않았다. 다시 여는 조건: 한 공간에 사이트 종속 메뉴와 사이트 무관 메뉴가 섞일 때(`.planning/backlog.md`).
- `BoardContextBar`는 늘 `ScopeSelector layout="bar"`를 그리지만 `log-dev` 메뉴는 `features.board`가 없어 닿지 않는다. 바꾸지 않았다.
- 선택 필드 추가라 SDK minor 변경이다.
