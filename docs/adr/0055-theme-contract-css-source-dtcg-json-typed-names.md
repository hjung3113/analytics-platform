# 테마 계약은 CSS를 원본으로 두고, 거기서 만든 DTCG 토큰 JSON과 색 토큰 이름 타입·런타임 읽기 함수로 낸다

상태: **Decided (2026-10-20, 결정자: 코디네이터 — 사용자 "ㅇㅇ sdk작업 진행하자"에 따른 SDK 다음 슬라이스 [포괄 목록](../integration/sdk-coverage-inventory.md) §5-5. 되돌릴 수 있음)**. 구현은 [#512](https://github.com/hjung3113/analytics-platform/issues/512).

`@ap/ui`는 디자인 토큰을 CSS로만 낸다(`tokens.css`·`semantic.css`·`theme.css`·`platform-tokens.css`). 이름을 묶어 주는 것은 주석과 문서뿐이다. 그래서 제품마다 변수 이름과 값을 손으로 옮긴다:

- EV는 `--eqv-*` 25개(README 표 기준. 포괄 목록이 처음 적은 24개에서 하나 늘었다) 중 9개만 Studio CSS에서 플랫폼 토큰에 매핑한다. 나머지 16개는 SVG 안 hex fallback으로 그린다. 매핑 검사도 그 9개만 본다.
- FeedbackOps는 자기 `tokens.css` 사본의 이름·값을 fixture에 고정하는 검사를 따로 운영한다.
- 플랫폼 차트는 `token(name: string)`으로 CSS 변수를 런타임에 읽는다(ECharts Canvas, [ADR-0021](0021-echarts-canvas-renderer.md)). 이름이 틀려도 타입이 막지 않고, `#000`으로 조용히 그려진다.

## 결정

- **값의 원본은 CSS 하나다.** `tokens.css`·`platform-tokens.css`가 값을 정한다. JSON과 TS는 생성기(`packages/ui/scripts/`)가 이 CSS에서 만든 결과이고, 손으로 고치지 않는다. 생성 결과는 커밋한다. 다시 생성한 결과가 커밋된 파일과 같은지 테스트가 확인한다. 두 원본이 따로 편집되는 일이 생기지 않는다.
- **공개 대상은 색 의미 역할 토큰만이다.**
  - 넣는 것: 공유 의미 역할(텍스트·표면·경계·포커스·accent·severity 등)과 플랫폼 확장 역할(차트·범주·아이콘·control).
  - 빼는 것: 원색 `--color-*`(컴포넌트가 직접 쓰지 않는다는 기존 규칙, `tokens.css` 머리말). FeedbackOps 도메인 역할(VOC·Task 상태, 엔티티 아이콘, 관리 시스템, VOC·Task accent). 색이 아닌 토큰(모션·간격·타이포·크기).
  - 뺀 목록은 이유와 함께 생성기 설정에 닫힌 목록으로 둔다. CSS에 새 색 토큰이 생기면, 넣거나 뺀 목록에 이유와 함께 올릴 때까지 테스트가 실패한다.
- **JSON 형식은 DTCG 2025.10이다.** `$type: "color"`, `$value`는 `{ colorSpace: "srgb", components, hex }`이고, 값은 별칭을 풀어 최종 값으로 적는다. 공개하지 않는 원색을 가리키는 별칭이 끊기지 않게 하려는 것이다. 폐기하는 토큰은 `$deprecated`에 대체 이름을 적고 최소 한 SDK 릴리스 동안 유지한다([ADR-0044](0044-sdk-source-in-platform-repo-released-separately.md)의 공개 API 변경 고지와 같다).
- **TS 쪽은 이름 목록·타입·읽기 함수다.** `THEME_COLOR_TOKENS`(읽기 전용 이름 목록), `ThemeColorToken`(이름 union), `readColorToken(name, element?)`.
  - `readColorToken`은 CSS 변수를 런타임에 읽어 완전한 CSS 색 문자열을 돌려준다.
  - DOM이 없거나 변수가 비면 manifest의 정적 값을 쓴다. `#000`이 아니다.
- **진입점:** `@ap/ui/theme`(TS)과 `@ap/ui/theme-tokens.json`. SDK 묶음 태그 `sdk-v0.x.y`에 함께 실린다.
- **플랫폼 차트도 이 타입을 쓴다.** `@ap/components`의 `token()`과 `ChartSeries.color`는 `string` 대신 `ThemeColorToken`을 받는다. 틀린 이름은 typecheck에서 막힌다.
- **CSS 소비는 그대로다.** SVG·CSS는 계속 `rgb(var(--…))`로 쓴다. 제품이 CSS에 쓴 이름은 TS union이 검사하지 못한다. 그래서 제품 쪽 매핑 검사는 `theme-tokens.json`의 이름 목록과 대조한다(EV 매핑 검사의 확장은 EV 저장소의 일).
- **제품 전용 의미는 제품이 소유한다.** EV의 로봇·자재·재생 활성·충돌 강조 색처럼 맞는 플랫폼 역할이 없는 것은 EV가 소유한다. 플랫폼이 같은 역할을 정의할 때까지다. 역할을 새로 만드는 것은 DESIGN 변경이다.

## Considered Options

- **(a, 채택) CSS 원본 + 생성 DTCG JSON + TS 이름 타입 + 런타임 읽기 함수.** 도구는 JSON을, 코드는 타입을 받는다. 원본이 하나라 표류가 생기지 않는다. 대가는 생성기와 재생성 검사다.
- **(b) TS 상수 + 런타임 읽기 함수만.** 생성기가 없어 가볍다. 하지만 상수가 CSS와 따로 편집되어 표류를 검사로만 막을 수 있다. CSS·SVG를 쓰는 소비자(EV 매핑, 디자인 도구)가 읽을 기계 형식도 없다.
- **(c) CSS + 매핑 표 문서(지금 방식 개선).** 비용은 가장 적다. 하지만 타입 검사가 없고, 제품마다 이름·값을 계속 손으로 옮긴다. 포괄 목록 §5-5가 지적한 문제가 그대로 남는다.
- **JSON을 원본으로 두고 CSS를 생성하는 안은 지금 고르지 않았다.** CSS가 FeedbackOps에서 옮긴 원본이고(ADR-0046), 캐스케이드·별칭·주석이 CSS에 있다. 다시 여는 조건: 다크 테마나 두 번째 테마가 필요해질 때.

## 결과

- `@ap/ui`가 `./theme`·`./theme-tokens.json`을 새로 낸다. 다음 SDK 태그(`sdk-v0.8.0`)부터 소비자가 받는다.
- `ChartSeries.color`가 좁아져 메뉴 차트 선언이 typecheck를 받는다.
- 이어받는 곳: EV 매핑 검사 확장(EV 저장소, #332 이후 탑재와 함께), FeedbackOps 토큰 fixture 검사를 manifest 대조로 바꾸는 일(FeedbackOps 판단). 둘 다 이 저장소에서는 구현하지 않는다([백로그](../../.planning/backlog.md)).

출처: 조사 보고(2026-10-20), [DTCG Format 2025.10](https://www.designtokens.org/tr/2025.10/format/), [Style Dictionary DTCG](https://styledictionary.com/reference/utils/dtcg/), [Primer primitives 토큰 작성](https://github.com/primer/primitives/blob/main/contributor-docs/agents/token-authoring.md), [Carbon themes](https://github.com/carbon-design-system/carbon/blob/main/packages/themes/README.md).
