# FeedbackOps 디자인 시스템을 그대로 공유한다 — FeedbackOps를 Tailwind v4로 올리고 `@fops/ui`를 직접 참조

상태: **Decided (2026-10-03)**.
- 결정자: 사용자 — 방식은 C안을 직접 골랐고("c로하자"), 참조 방식과 범위는 에이전트 추천을 따랐다("나머지는 니추천대로").

세부(가져오는 순서·버전 차이·검증 방법)는 [#52](https://github.com/hjung3113/analytics-platform/issues/52) 코멘트가 소유한다. 이 ADR은 결정과 이유만 둔다.

2026-09-27 결정은 M2 디자인을 FeedbackOps 디자인 위에 세우고 플랫폼 확장 패턴(전역 Context 바, 차트 프레임, 분석 레이아웃, KPI)을 더한다는 것이었다. 남은 질문은 **어떻게 가져오는가**였다. 걸림돌은 Tailwind 버전 하나다. FeedbackOps `@fops/ui`는 Tailwind 3.4(JS preset + `theme.extend`)이고, 플랫폼은 v4(`@tailwindcss/vite`, CSS-first `@theme`)다. v4에서 `rounded`·`shadow`·`ring`·`outline-none` 같은 기본 유틸리티의 의미가 바뀌어서, 한쪽 코드를 다른 쪽 버전에서 그대로 쓰면 모양이 달라진다. FeedbackOps 디자인은 2026-10-03 기준 사실상 확정이다(FeedbackOps#685 출시 전 UI 점검·#672 타이포 토큰 닫힘).

## 결정

- **FeedbackOps를 먼저 Tailwind v4로 올린다** — [FeedbackOps#743](https://github.com/hjung3113/FeedbackOps/issues/743). 모양은 바꾸지 않는 도구 업그레이드이고, FeedbackOps 쪽 결정·ADR(그쪽 ADR-0016의 `theme.extend` 부분 대체)과 픽셀 비교 게이트를 거친다. 플랫폼은 v4를 유지한다.
- **플랫폼은 `@fops/ui`를 서브모듈 패키지로 직접 참조한다**(복사하지 않는다). 토큰·preset·shadcn 프리미티브·셸 모양의 원본은 FeedbackOps 하나다.
- **범위**: FeedbackOps에서 오는 것 — 토큰 이름과 값(Pack 17), preset, 프리미티브, 셸 모양. 플랫폼이 계속 소유하는 것 — 공통 컴포넌트의 계약(`PlatformDataTable`·`DetailDrawer`·`StateView` 등, 06 §13)과 플랫폼 확장(차트 색, 전역 Context 바, KPI, 분석 레이아웃). 공통 컴포넌트는 FeedbackOps 프리미티브 위에 다시 그릴 수 있지만 계약(props·동작)은 플랫폼 것이다.
- **lucide-react**(FeedbackOps 0.469 ↔ 플랫폼 1.48)는 이번 결정에 묶지 않는다. FeedbackOps 쪽 후속으로 맞추고, 그 전에는 두 버전이 공존해도 된다.
- **순서**: FeedbackOps#743 병합 → 서브모듈 참조 갱신 → 플랫폼 워크스페이스에서 `@fops/ui` 소비 검증 → 실제 앱 위 `?variant=` 프로토타입 컨펌(#52) → 구현 → DESIGN.md 개정(#53) → 레이아웃 슬롯(#156).

## Considered Options

- **(A) 플랫폼을 Tailwind 3.4로 내리고 `@fops/ui`를 그대로 사용**: 셸 편입 때 FeedbackOps 변경이 거의 없다. 대신 플랫폼이 한 메이저 낮은 버전으로 돌아가고, 두 앱이 나중에 v4로 올라갈 때 한 번 더 옮겨야 한다. 에이전트의 1차 추천이었다.
- **(B) 플랫폼 v4 유지, 토큰·부품을 복사해 v4로 변환**: FeedbackOps를 건드리지 않는다. 대신 같은 부품의 복사본이 두 벌 생기고 시간이 지나며 갈라진다. 셸 편입 때 FeedbackOps 화면 클래스를 다시 변환해야 한다.
- **(C, 채택) FeedbackOps를 먼저 v4로 올리고 두 앱이 같은 원본을 쓴다**: 출시 전인 FeedbackOps를 건드리는 비용이 있지만, 두 앱이 최신 메이저 하나와 원본 하나를 공유해 이후 이중 이행이 없다. 모양이 바뀌지 않음은 FeedbackOps의 픽셀 비교 게이트로 확인한다.

## 결과

- M2(#52·#53·#156)는 FeedbackOps#743이 병합될 때까지 기다린다. 그 사이 플랫폼 서브모듈 참조는 FeedbackOps `develop`을 따라 갱신한다(이 결정과 함께 `4d11afea`로).
- 플랫폼 pnpm 워크스페이스가 `products/feedbackops`의 패키지(`@fops/ui`와 그 의존)를 포함하게 된다 — 지금 "플랫폼 앱은 FeedbackOps를 포함하지 않는다"([저장소 구조](../integration/repository-layout.md))는 소비 검증 때 바뀐다. 그때 CI 체크아웃(`submodules: false`)도 함께 바꾼다.
- 플랫폼의 디자인 토큰 값은 FeedbackOps 값으로 바뀐다(Samsung 블루 `#1428a0`, 밝은 사이드바). 보이는 모양이 바뀌므로 프로토타입 컨펌을 거친다.
