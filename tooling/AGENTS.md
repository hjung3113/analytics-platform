# tooling/ — 공유 개발 도구 설정

workspace 패키지가 공유하는 설정 패키지. 런타임 코드는 두지 않는다.

## 현재

- `tsconfig/` (`@ap/tsconfig`) — `base.json`. 모든 패키지·앱의 `tsconfig.json`이 `extends` 한다.
- `eslint/` (`@ap/eslint-config`) — 패키지 경계·계약 lint(ESLint flat config). 패키지별 프리셋(`contracts`·`kernel`·`menu`·`app` 등)을 각 consumer가 `eslint.config.js` 한 줄로 가져다 쓴다. `@fops/*` 직접 import는 `@ap/ui`에서 `@fops/ui` 공개 진입점을 소비하는 경우만 허용하며, 프리미티브는 다른 패키지에서 `@ap/ui`로 가져온다(ADR-0011). 접두사 상수와 규칙 원본은 `tooling/eslint/src/`에 있다.
- `gen-menu/` (`@ap/gen-menu`, `pnpm gen:menu`) — 이미 `GroupId`·`GROUPS`에 있는 그룹의 메뉴 패키지 스켈레톤(`src/endpoints.ts`·`src/mock/`·`useMenuQuery` 페이지 — menu-query 패턴)을 만든다. Management·Analysis 뼈대는 레이아웃 슬롯 컴포넌트를 쓰고, 나머지 archetype은 점선 슬롯을 쓴다. 사이드바 그룹은 추가하지 않는다. 앱 배선 여섯 줄(`menus.ts` import/spread, `style.css`, 앱 `package.json` 의존, `dev/mock-assembly.tsx`의 `<gen:menu-mock-*>` 마커)은 생성기가 쓰고 `--remove`가 바이트 단위로 되돌린다 — 마커 영역은 손으로 고치지 않는다. 생성기를 바꾸면 깨끗한 트리에서 `node tooling/gen-menu/scripts/probe.ts`를 coordinator가 1회 돌린다. `--page-type` 슬롯(`PAGE_SLOTS`)은 06 §12와 함께 고친다.
- `css-selectors/` (`@ap/css-selectors`) — 빌드된 CSS 파일에서 selector 집합을 추출하고 두 집합의 added/removed를 비교하는 CLI(#58). CI(`.github/workflows/css-selectors.yml`)가 PR head 빌드와 병합 기준(merge-base) 빌드를 비교해 Job 요약에 마크다운 리포트를 쓰고, selector가 제거되면 실패한다. 의도된 제거 PR은 `css-removal-ok` 라벨을 단다(라벨 on/off 시 이 워크플로만 재실행). 로컬 실행: `node tooling/css-selectors/src/cli.ts <base.css> <head.css> [--summary <file>] [--allow-removal]`, 단위 테스트는 `pnpm --filter @ap/css-selectors test`.

## 규칙

- 설정 변경은 모든 패키지에 퍼진다. 바꾼 뒤 루트 검사(루트 `AGENTS.md`)를 돌린다(생성기는 `pnpm --filter @ap/gen-menu test`로 먼저 좁힌다).
- 패키지 접두사(`@ap/`, 임시)를 설정에 쓸 때는 상수 한 곳에만 둔다(패키지 경계 §8).
- 루트 workspace 파일(`package.json`, `pnpm-workspace.yaml`, `turbo.json`)과 CI(`.github/workflows/ci.yml`의 `platform-workspace` Job)는 여기 규칙과 함께 바꾼다.
