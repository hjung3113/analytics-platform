# 디자인 방향은 FeedbackOps 토큰과 FeedbackOps 셸 구조를 그대로 쓴다 (프로토타입 C안)

상태: **Decided (2026-10-04)**.
- 결정자: 사용자 — "복잡해도 제일 완성도 높은 방향으로". 3안 중 C안이며, 에이전트 추천과 같다.

세부(구현 순서, 토큰 매핑, 셸 치수)는 [#52](https://github.com/hjung3113/analytics-platform/issues/52) 코멘트, 구현 이슈, 프로토타입 브랜치 `prototype/52-fops-design`와 스크린샷 `.agents/reports/design/shots/52-fops/`(원격 브랜치 `prototype/52-fops-design`의 커밋에만 있다)가 소유한다. 이 ADR은 결정과 이유만 둔다.

[ADR-0010](0010-feedbackops-design-system-shared-on-tailwind-v4.md)은 **어떻게 가져오는가**를 정했다(FeedbackOps를 Tailwind v4로 올리고 `@fops/ui`를 직접 참조). 남은 질문은 **어디까지 FeedbackOps 모양을 따르는가**였다. 2026-10-04 소비 검증 결과는 이렇다. shadcn 프리미티브는 두 쪽이 이미 거의 같다. 그래서 모양 차이는 토큰과 셸 구조에서 나온다. 셸 프레임(`AppFrame`·`AppRail`·`AppSidebar`)은 `@fops/ui`가 아니라 FeedbackOps 앱 안에 있다. 실제 앱 위 `?variant=` 프로토타입으로 세 안을 비교했다.

## 결정

- **토큰·타이포는 FeedbackOps 것을 쓴다.** FeedbackOps ADR-0058의 소비 계약 그대로다(Samsung 블루 `#1428a0`, 캔버스 `#f3f7fe`, 본문 14px, Inter + Pretendard). FeedbackOps에 없는 플랫폼 전용 키는 **플랫폼 확장 층**에 둔다(차트·카테고리 색, 타이포 역할 클래스, `surface-sunken` 등). 이 층은 FeedbackOps 값 위에서 표현한다.
- **셸은 FeedbackOps AppFrame 구조를 플랫폼 `@ap/shell`이 그린다.**
  - 레일(52px): 공간 전환, 명령 팔레트, 도움말, 언어, 프로필, 앱이 주입하는 도구.
  - 밝은 사이드바(240px, 접으면 56px): 그룹은 섹션 제목이고, Scope 선택은 사이드바 머리에 둔다.
  - 상단 바는 없앤다. 페이지 머리는 50px 한 줄(제목·설명·동작)이다.
- **프리미티브는 `@fops/ui` 원본을 쓴다.** `@ap/ui`의 shadcn 복사본은 `@fops/ui`를 다시 내보내는 쪽으로 바꾼다(ADR-0010 "복사하지 않는다").
- **플랫폼이 계속 소유하는 것**(ADR-0010과 같음): 공통 컴포넌트의 계약(06 §13), 전역 Context 바, Scope·URL 계약, 차트 프레임. 셸이 다시 그려져도 Kernel의 Scope 동작(검증·실패·다시 시도, #167·#183)은 바뀌지 않는다.

## Considered Options

- **(A) 현재 플랫폼 디자인 유지**: 비용이 없다. 대신 FeedbackOps와 두 디자인이 공존한다. 2단계 셸 편입 때 FeedbackOps 화면을 플랫폼 모양으로 다시 맞춰야 한다.
- **(B) FeedbackOps 토큰만, 셸은 플랫폼 구조(어두운 사이드바·상단 바) 유지**: 가장 싸다. 색·타이포는 맞지만, 셸 편입 때 두 셸 구조 중 하나를 다시 골라야 한다.
- **(C, 채택) FeedbackOps 토큰 + FeedbackOps 셸 구조**: 셸 재작성(Scope 선택 위치, 상단 바 기능 이전, 테스트·문서)이 가장 크다. 대신 FeedbackOps 화면이 같은 레일·사이드바·50px 머리 안에 그대로 들어온다. 2단계 편입 때 FeedbackOps 쪽 변경이 가장 적다.

## 결과

- 셸 구조·치수가 바뀐다. [06 §7](../06_platform_ui_contract.md#7-application-shell)(구조·Baseline)·§9(사이드바 기능)·§9.1(공간 전환 위치)과 [07 앱 셸 와이어프레임](../07_app_shell_wireframe.md)은 이 결정과 함께 고쳤다. [DESIGN.md](../../DESIGN.md)는 #53에서 공유 원본 링크와 플랫폼 확장·pairing·셸 시각 보완 중심으로 개정했다. 코드 이행은 #192 → #193 → #194의 범위이며, 이 문서 갱신은 새 런타임 검증을 뜻하지 않는다.
- 상단 바가 사라진다. 앱 주입 슬롯 `topBarTools`(ADR-0009 조립 계약)는 이름을 유지하고 레일 아래에 놓인다.
- 공통 컴포넌트(`PlatformDataTable`·`DetailDrawer`·`StateView` 등)는 새 토큰 위에서 다시 그려진다. 계약(props·동작)은 그대로다. DetailDrawer를 FeedbackOps처럼 오른쪽에 고정된 상세 슬롯(440px)으로 바꿀지는 이 결정에 넣지 않았다(별도 이슈).
