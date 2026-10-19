# 디자인 시스템 코드는 FeedbackOps `@fops/ui` 전체를 `@ap/ui`로 옮겨 플랫폼이 원본을 갖는다

상태: **Decided (2026-10-19)**, 코드 이전 완료(#441–#443) — 구현은 [#431](https://github.com/hjung3113/analytics-platform/issues/431) 아래 세 이슈([#441](https://github.com/hjung3113/analytics-platform/issues/441)·[#442](https://github.com/hjung3113/analytics-platform/issues/442)·[#443](https://github.com/hjung3113/analytics-platform/issues/443)).
- 결정자: 사용자 — 2026-10-19. 선택지 "FeedbackOps `@fops/ui` 전체 이전"(플랫폼이 쓰는 부분집합만 먼저 옮기고 FeedbackOps 동결 규칙을 두는 권고안, 이전 보류안 대신). 이어서 "FeedbackOps#1231 코멘트와 본문 갱신까지 제가 한다"를 허락했다.

[ADR-0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md)이 디자인 시스템 원본을 플랫폼(SDK)으로 정하고, 이전 순서를 첫 슬라이스에서 정하라고 했다. 지금 `@ap/ui`는 `@fops/ui`를 재수출하고(`@ap/ui → @fops/ui` 간선), 플랫폼이 실제로 쓰는 것은 `cn`·`prefersReducedMotion`·`Button`·shadcn 래퍼 약 14종·토큰 CSS 4개뿐이다. FeedbackOps `packages/ui`(`origin/develop` `a8d768b8`)는 156개 파일이고, 그중 플랫폼이 쓰지 않는 것에 FeedbackOps 도메인에 결합된 조각(VOC 상태 배지, 권한 상태, 리치 콘텐츠 allowlist 등)이 있다.

## 결정

- **`packages/ui` 전체를 `@ap/ui`로 옮긴다.** 원본 소유가 플랫폼(SDK)으로 바뀐다. 값은 그대로 옮기고(모양 변경 없음) 이전 범위는 세 묶음으로 나눠 차례로 한다: ① 토큰·유틸·primitive(`styles`·`utils`·`components`·`internal`, #441) — 플랫폼 사용분이 모두 여기 있어 이것으로 `@ap/ui → @fops/ui` 간선과 플랫폼 workspace의 FeedbackOps 서브모듈 의존이 없어진다, ② 레이아웃·상세 패널·툴바·폼·피드백(#442), ③ 도메인 결합 부분(`badges`·`data`·`entity`·`identity`·`indicators`·`permissions`·`rich-content`, #443). 앞 묶음이 끝나야 다음을 시작한다.
- **도메인 결합 부분도 이번 이전에 포함한다(수용한 비용).** ADR-0043의 "업무는 제품 소유"와 긴장하지만 사용자가 전체 이전을 골랐다. 이전을 끝낸 뒤 도메인 결합 부분을 분류해 FeedbackOps 소유 층으로 되돌릴지 다시 정한다(Open → [ADR-0050](0050-domain-coupled-ui-returns-to-feedbackops.md)이 정했다: 도메인에 묶인 부품과 rich-content는 되돌린다).
- **이전 중에는 두 벌이 있다.** FeedbackOps의 `@fops/ui`는 이전 동안 그대로 남고, 이전이 끝난 묶음의 토큰·primitive 모양 변경은 SDK에서 먼저 한다. 이 규칙은 FeedbackOps에 알린다(플랫폼이 FeedbackOps#1231에 코멘트와 본문 갱신, 사용자 허락 2026-10-19).
- **FeedbackOps가 SDK를 받아 쓰는 시점은 이 ADR이 정하지 않는다.** 배포 경로(registry, [#151](https://github.com/hjung3113/analytics-platform/issues/151) Open)와 `@ap/ui` 배포 준비가 먼저다([ADR-0044](0044-sdk-source-in-platform-repo-released-separately.md)). equipment-visualization도 같다(EV ADR-0008이 `@fops/ui`를 서브모듈로 소비 중).

## Considered Options

- **(a) 플랫폼 사용 부분집합만 복사하고 FeedbackOps `@fops/ui`는 모양 변경 동결**(에이전트 권고): 플랫폼 코드가 쓰는 재수출 형태의 조각만 옮겨 이전이 작고 도메인 결합이 SDK에 들어오지 않는다. 사용자가 고르지 않았다.
- **(b, 채택) `@fops/ui` 전체 이전**: 한 번에 원본이 플랫폼으로 넘어와 FeedbackOps·EV가 이후 SDK 하나만 본다. 비용은 규모(156개 파일)와 도메인 결합 부분이 SDK에 들어오는 것이다.
- **(c) 배포 경로가 생길 때까지 보류**: 두 벌은 안 생기지만 원본 확정과 서브모듈 의존 제거가 미뤄지고 그동안 FeedbackOps가 계속 원본으로 바뀐다.

## 결과

- **코드 이전 끝:** `packages/ui` 전체가 #441–#443으로 `@ap/ui`에 옮겨졌다. 남은 Open: FeedbackOps 전환, 도메인 결합 부분 분류, 픽셀 하니스(아래).

- #441 병합 후 `@fops/` import가 플랫폼 코드에 없어야 하고, 원본 소유를 서술한 06 §23·DESIGN.md·[ADR-0010](0010-feedbackops-design-system-shared-on-tailwind-v4.md)·[0011](0011-design-direction-feedbackops-shell.md)·[0023](0023-feedbackops-primitive-shapes-and-sizes.md) 머리표시·`packages/ui/AGENTS.md`를 같은 PR에서 고친다(ADR-0043 결과).
- **Open — FeedbackOps 전환 시점:** FeedbackOps가 SDK를 쓰는 전환 시점 = #443 완료 + 배포 경로 확정(#151). 그 전까지 @fops/ui는 FO에 그대로 둔다.
- **Open:** FeedbackOps의 픽셀 비주얼 하니스(`apps/frontend/tests/visual`, 앱 화면에 묶여 darwin 기준 이미지)는 SDK로 옮길 수 없다. SDK가 원본이 된 뒤 토큰·primitive의 시각 검증을 어디서 어떻게 할지(컴포넌트 단위 하니스 등)를 #441 설계에서 정한다. #441 결과: 이 하니스는 FeedbackOps에 남기고, SDK 쪽 검증은 이전된 토큰 충실도·대비·소비 계약 테스트와 플랫폼 E2E 계약 보고로 한다. 컴포넌트 단위 시각 하니스는 [백로그](../../.planning/backlog.md)에 구현 안 함으로 둔다. `allowlist-drift`·`fixtures-drift`는 #443에서 옮겼다가 ADR-0050/#479에서 rich-content 사본과 함께 SDK에서 제거했다.
- 포괄 목록([SDK 포괄 목록](../integration/sdk-coverage-inventory.md) §3.6·§7)의 "디자인 시스템 코드 이전" 행은 이 ADR과 #441–#443이 이어받는다.
