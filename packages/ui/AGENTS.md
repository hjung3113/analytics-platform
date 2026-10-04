# @ap/ui

UI Primitive 층(06 §13)과 디자인 시스템 CSS. 플랫폼 개념(Context, Scope, 메뉴)을 모른다.

## 파일

- `src/styles/` — `tokens.css`(플랫폼 확장 값만), FeedbackOps CSS 소비·확장 Tailwind 테마 매핑, base, 타이포 유틸리티(`t-page-title` 등). 진입점 `index.css` = `@ap/ui/styles.css`.
- `src/components/shadcn/*` — `@fops/ui` 공개 primitive의 명시적 재수출(플랫폼 공개 export 목록 유지).
- `src/components/Button.tsx`(`@fops/ui` 재수출), `src/utils/isProductionEnv.ts`(플랫폼 환경 판단), `StatusBadge.tsx`(`Tone`: success/warning/danger/neutral/info), `cn`(`@fops/ui` 재수출).

## 규칙

- import 가능: 외부 라이브러리와 FeedbackOps `@fops/ui` 공개 진입점만. FeedbackOps primitive를 다시 내보내는 유일한 플랫폼 패키지다(ADR-0011); `@fops/shared`와 `@ap/*`는 import하지 않는다.
- 공유 토큰·폰트·반경·본문 값의 원본은 FeedbackOps [tokens.css](../../products/feedbackops/packages/ui/src/styles/tokens.css)와 [ADR-0058](../../products/feedbackops/docs/adr/0058-tailwind-v4-css-first-theme.md)다(플랫폼 결정: [ADR-0011](../../docs/adr/0011-design-direction-feedbackops-shell.md)). 플랫폼 확장의 설계 원본은 [DESIGN.md](../../DESIGN.md#platform-extension-layer)이며 이 패키지는 구현을 소유한다. 토큰 파일 밖에서 hex 값 금지.
- 앱은 Tailwind → `@ap/ui/styles.css` 순서로 import한다. 이 진입점은 FeedbackOps tokens·semantic(`layer(base)`) → theme → compat → 플랫폼 확장 → 두 UI 소스 트리 `@source` 순서를 유지한다. 폰트는 앱에서 레이어 없이 import한다. 레거시 `nav-*` 확장·`.nav-scroll`은 #194에서 제거했고 밝은 탐색 스크롤은 `.shell-scroll`이 맡는다.
- label·vivid accent·control 경계의 역할과 허용 표면은 [DESIGN 접근성 pairing](../../DESIGN.md#accessibility-pairing-rules)을 따른다. 새 소비자도 이 조합을 확인한다.
- 상태 색은 `StatusBadge`/`Tone`으로만 노출한다. 새 Tone은 DESIGN 변경이다.
- 데이터 조회, 권한 판단, 라우팅, 도메인 문구를 넣지 않는다. 그런 조합은 `@ap/components`다.
- shadcn 컴포넌트를 추가하면 `src/index.ts`에 export하고 `styles/index.css`의 `@source`가 새 파일을 스캔하는지 확인한다.

- `DetailPanelSlot.tsx`는 도메인·URL을 모르는 셸별 DOM 슬롯 primitive다. Provider·host hook·등록 hook을 공개하며 components와 shell이 역방향 의존 없이 함께 소비한다(06 §13, ADR-0013). portal 내용은 소비자가 소유하고 등록 우선순위는 mount 수명에만 따른다.

## 검증

루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`). 토큰·스타일 변경은 `pnpm dev`로 화면을 직접 확인한다.
