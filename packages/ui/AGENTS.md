# @ap/ui

UI Primitive 층(06 §13)과 디자인 시스템 CSS. 플랫폼 개념(Context, Scope, 메뉴)을 모른다.

## 파일

- `src/styles/` — `tokens.css`(색·간격·타이포 토큰), Tailwind 테마 매핑, base, 타이포 유틸리티(`t-page-title` 등). 진입점 `index.css` = `@ap/ui/styles.css`.
- `src/components/shadcn/*` — shadcn/Radix primitive.
- `src/components/Button.tsx`, `StatusBadge.tsx`(`Tone`: success/warning/danger/neutral/info), `src/utils/cn.ts`.

## 규칙

- import 가능: 외부 라이브러리만. `@ap/*` import 금지.
- 시각 기준의 원본은 루트 [DESIGN.md](../../DESIGN.md)다. 토큰을 추가·변경하기 전에 DESIGN을 먼저 고치거나 확인한다. 토큰 파일 밖에서 hex 값 금지.
- 상태 색은 `StatusBadge`/`Tone`으로만 노출한다. 새 Tone은 DESIGN 변경이다.
- 데이터 조회, 권한 판단, 라우팅, 도메인 문구를 넣지 않는다. 그런 조합은 `@ap/components`다.
- shadcn 컴포넌트를 추가하면 `src/index.ts`에 export하고 `styles/index.css`의 `@source`가 새 파일을 스캔하는지 확인한다.

## 알려진 부채

`Button.tsx`의 `process.env.NODE_ENV` 참조 때문에 이 패키지와 소스를 함께 타입체크하는 `@ap/shell`에 `@types/node` devDependency가 있다. `import.meta.env` 등으로 바꾸면 둘 다 제거할 수 있다.

## 검증

루트 `pnpm typecheck && pnpm build`. 토큰·스타일 변경은 `pnpm dev`로 화면을 직접 확인한다.
