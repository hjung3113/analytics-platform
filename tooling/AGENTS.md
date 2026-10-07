# tooling/ — 공유 개발 도구 설정

workspace 패키지가 공유하는 설정 패키지. 런타임 코드는 두지 않는다.

## 현재

- `tsconfig/` (`@ap/tsconfig`) — `base.json`. 모든 패키지·앱의 `tsconfig.json`이 `extends` 한다.
- `eslint/` (`@ap/eslint-config`) — 패키지 경계·계약 lint(ESLint flat config). 패키지별 프리셋(`contracts`·`kernel`·`menu`·`app` 등)을 각 consumer가 `eslint.config.js` 한 줄로 가져다 쓴다. `@fops/*` 직접 import는 `@ap/ui`에서 `@fops/ui` 공개 진입점을 소비하는 경우만 허용하며, 프리미티브는 다른 패키지에서 `@ap/ui`로 가져온다(ADR-0011). 접두사 상수와 규칙 원본은 `tooling/eslint/src/`에 있다. UI를 그리는 프리셋(`ui`·`components`·`shell`·`menu`·`app`)은 `@shadcn/lint` 6개 규칙을 error로 켠다(#228). 테마는 루트 `components.json`의 `tailwind.css`(앱 `style.css` — 패키지에는 Tailwind 진입 CSS가 없어 이것이 없으면 플랫폼 유틸리티 `t-mono` 등을 모른다), 컴포넌트는 `@ap/ui`·`@ap/components` import로 알아본다. 규칙 옵션은 공유 디자인 시스템의 원본인 FeedbackOps `.oxlintrc.json`(FeedbackOps ADR-0062)을 따른다 — 화면은 컴포넌트에 layout만, 컨테이너(`*Content`·`*Header`·`*Footer` 등)에는 spacing도 더할 수 있고, 50px 헤더(`DetailPanelHeader`·`ShellHeader`·`ListToolbar`)에는 높이를 줄 수 없다. arbitrary 값은 layout만 허용하고, `no-raw-colors`·`no-arbitrary-values`는 상수 문자열도 읽는다(`scanAllStrings`). primitive를 정의하는 `packages/ui`만 FeedbackOps `packages/ui`처럼 `no-restyle`·`require-static-classes`를 끈다. `packages/components`는 primitive 위에 조립하는 층(06 §13)이라 가져온 primitive의 모양을 덮어쓰지 못한다 — 자기 마크업은 상대 import라 컴포넌트로 보지 않으므로 토큰으로 자유롭게 꾸민다(`boundaries.test.ts`가 고정). 클래스가 아닌 문자열 오탐이나 의도한 일회성 처리는 그 줄에 `eslint-disable-next-line shadcn/<rule> -- <이유>`로 표시한다. FeedbackOps 설정이 바뀌면 `tooling/eslint/src/index.js`의 `RESTYLE_CONTRACTS`·`DESIGN_SYSTEM_RULES`를 같이 맞춘다. 테스트 파일(`*.test.tsx`)은 검사하지 않는다.
- `gen-menu/` (`@ap/gen-menu`, `pnpm gen:menu`) — 이미 `GroupId`·`GROUPS`에 있는 그룹의 메뉴 패키지 스켈레톤(`src/endpoints.ts`·`src/mock/`·`useMenuQuery` 페이지 — menu-query 패턴)을 만든다. Management·Analysis 뼈대는 레이아웃 슬롯 컴포넌트를 쓰고, 나머지 archetype은 점선 슬롯을 쓴다. 사이드바 그룹은 추가하지 않는다. 앱 배선 여섯 줄(`menus.ts` import/spread, `style.css`, 앱 `package.json` 의존, `dev/mock-assembly.tsx`의 `<gen:menu-mock-*>` 마커)은 생성기가 쓰고 `--remove`가 바이트 단위로 되돌린다 — 마커 영역은 손으로 고치지 않는다. 생성기를 바꾸면 깨끗한 트리에서 `node tooling/gen-menu/scripts/probe.ts`를 coordinator가 1회 돌린다. `--page-type` 슬롯(`PAGE_SLOTS`)은 06 §12와 함께 고친다.
- `css-selectors/` (`@ap/css-selectors`) — 빌드된 CSS 파일에서 selector 집합을 추출하고 두 집합의 added/removed를 비교하는 CLI(#58). CI(`.github/workflows/css-selectors.yml`)가 PR head 빌드와 병합 기준(merge-base) 빌드를 비교해 Job 요약에 마크다운 리포트를 쓰고, selector가 제거되면 실패한다. 의도된 제거 PR은 `css-removal-ok` 라벨을 단다(라벨 on/off 시 이 워크플로만 재실행). 로컬 실행: `node tooling/css-selectors/src/cli.ts <base.css> <head.css> [--summary <file>] [--allow-removal]`, 단위 테스트는 `pnpm --filter @ap/css-selectors test`.

## 규칙

- 설정 변경은 모든 패키지에 퍼진다. 바꾼 뒤 루트 검사(루트 `AGENTS.md`)를 돌린다(생성기는 `pnpm --filter @ap/gen-menu test`로 먼저 좁힌다).
- 패키지 접두사(`@ap/`, 임시)를 설정에 쓸 때는 상수 한 곳에만 둔다(패키지 경계 §8).
- 루트 workspace 파일(`package.json`, `pnpm-workspace.yaml`, `turbo.json`)과 CI(`.github/workflows/ci.yml`의 `platform-workspace` Job)는 여기 규칙과 함께 바꾼다.
