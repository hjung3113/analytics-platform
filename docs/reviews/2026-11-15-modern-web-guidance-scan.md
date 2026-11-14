# 2026-11-15 — modern-web-guidance 레거시 스캔·가이드 대조

## 이 문서의 지위

점검 증거 기록이다. 권위 문서가 아니며, 발견은 아래 표의 이슈·PR에서 처리한다. 점검 방법과 판정은 [#2214](https://github.com/hjung3113/analytics-platform/issues/2214)에 있고, 결과는 `advisor`가 리뷰했다. 브라우저 재현은 하지 않았다.

## 방법

- **정적 스캔:** `env DISABLE_TELEMETRY=1 npx -y modern-web-guidance@1.0.0 legacy-scan .`. 규칙 35개로 가이드의 약 20%를 덮고, 실측 9초가 걸렸다. 3건이 나왔고 모두 IME Enter였다. 그중 `VocPermissions.tsx:78`(표 행 키보드 동작)은 오탐이다.
- **가이드 대조:** 가이드 208개 중 이 앱에 해당하는 24개를 코드와 직접 대조했다. 모바일·결제·AI·PWA 가이드는 범위 밖이다.
- **받기만 하고 대조하지 못한 가이드 10개:** menu, toolbar, breadcrumbs, drag-and-drop, html, typography, progress, switch, calculate-event-differentials, break-up-long-tasks. 다음 점검 때 대조한다.

## 발견과 처리

| 발견 | 처리 |
| --- | --- |
| IME Enter: SDK `combobox.tsx:182` 결함, `multi-combobox.tsx:94`·`CommandPalette.tsx:131`에 Safari 보완 확인(229) 없음, lint 없음 | [#2215](https://github.com/hjung3113/analytics-platform/issues/2215) |
| IME Enter: `eqv/editor/MappingBoard.tsx:285,307`, `topview-studio/MappingTab.tsx:228,292` | [#2216](https://github.com/hjung3113/analytics-platform/issues/2216) |
| IME Enter: `feature-screens/.../RequestsScreen.tsx:83` | [#2217](https://github.com/hjung3113/analytics-platform/issues/2217) |
| `sortRows`가 코드포인트 순서로 비교(`EQ-10` < `EQ-2`) | [#2218](https://github.com/hjung3113/analytics-platform/issues/2218) |
| `ProductivityOverview.tsx:312`의 `localeCompare`에 `numeric` 없음 | [#2077](https://github.com/hjung3113/analytics-platform/issues/2077) 항목 |
| 토스트 묶음에 `role="region"` 없음, `SearchInput` Enter에서 `preventDefault` 없음 | [#2065](https://github.com/hjung3113/analytics-platform/issues/2065) 항목, PR [#2184](https://github.com/hjung3113/analytics-platform/pull/2184)로 고침 |
| 잘림 감지 코드 3곳 복제 | [#2219](https://github.com/hjung3113/analytics-platform/issues/2219) |
| reduced-motion 설정에서 스피너가 멈춤(`compat.css:175`, 토큰 CSS) | [#2220](https://github.com/hjung3113/analytics-platform/issues/2220) — 소유자 결정으로 그대로 두고 닫음(다시 여는 조건은 이슈에) |
| SDK 표 숫자가 브라우저 로케일을 따름 | PR [#2198](https://github.com/hjung3113/analytics-platform/pull/2198)(#2170)이 이미 고침 |

## 결함이 아닌 것

가이드 수준이거나 일부러 다르게 한 것이다.

- Radix Dialog의 스크롤 잠금: 플랫폼 결정이다.
- `PlatformDataTable`의 div+ARIA 구조: 가상 스크롤 때문이며, `aria-sort` 등을 갖췄다.
- 라이트 전용: `DESIGN.md`의 결정이다.
- 출처 검사: URL 파서로 정규화한다.
- `zonedInstant`의 DST 처리, 클립보드 대비책, HTML sanitize: 가이드와 같은 수준이다.

## PR CI에 넣지 않는 이유

스캔은 슬라이스 시각 점검 때 돌린다(`.agents/conductor/PROFILE.md` §Pre-go-live). PR CI에 넣지 않는 이유는 네 가지다.

- 오탐률이 1/3이다.
- `@latest`이면 규칙이 바뀌어 결과가 흔들린다.
- 텔레메트리가 기본으로 켜져 있다.
- PR CI는 최소로 유지한다(#1931).

다시 여는 조건은 저장소 안 lint로 옮길 수 없는 규칙이 반복해서 결함을 잡는 경우다.
