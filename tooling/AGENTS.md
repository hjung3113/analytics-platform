# tooling/ — 공유 개발 도구 설정

workspace 패키지가 공유하는 설정 패키지. 런타임 코드는 두지 않는다.

## 현재

- `tsconfig/` (`@ap/tsconfig`) — `base.json`. 모든 패키지·앱의 `tsconfig.json`이 `extends` 한다.
- `eslint/` (`@ap/eslint-config`) — 패키지 경계·계약 lint(ESLint flat config). 패키지별 프리셋(`contracts`·`kernel`·`menu`·`app` 등)을 각 consumer가 `eslint.config.js` 한 줄로 가져다 쓴다. 접두사 상수와 규칙 원본은 `tooling/eslint/src/`에 있다.
- `gen-menu/` (`@ap/gen-menu`, `pnpm gen:menu`) — 이미 `GroupId`(`packages/contracts/src/menu.ts`)와 `GROUPS`(`apps/platform-web/src/menus.ts`)에 있는 그룹의 메뉴 패키지를 스캐폴딩한다. 사이드바 그룹을 추가하지 않는다. 생성물은 menu-query 패턴이다(#126): `src/endpoints.ts`(표본 `defineEndpoint`, manifest와 같은 `SCAFFOLD_PERMISSION`), `src/mock/index.ts`(`<group>Mock`, `package.json` `./mock` export), `src/mock/index.test.ts`(inline `MenuMeta`로 `createMockAdapter` 등록 규칙과 `menuQuery` ok 스모크를 검사), 페이지의 `useMenuQuery` 호출. `src/api.ts`/`serve`는 만들지 않는다. 앱 배선은 여섯 줄 — `menus.ts` import/spread, `style.css`, `package.json` 의존, 그리고 `main.tsx`의 `/mock` import와 `createMockAdapter` `endpoints` spread(`// <gen:menu-mock-imports>`·`// <gen:menu-mock-spreads>` 마커 영역, analytics mock도 같은 영역에 있다). `--remove`는 여섯 줄을 바이트 단위 inverse로 지운다. `--page-type`(overview·analysis·management·catalog·workflow)에 따라 화면 뼈대의 콘텐츠 슬롯이 06 §12 이름·순서로 달라진다(`PAGE_SLOTS`, `templates.ts`). 슬롯을 바꾸면 06 §12와 함께 고친다. probe는 `GEN_MENU_PROBE_PAGE_TYPE`로 page type을 고르고(기본 overview) 생성 직후 새 파일 셋과 `main.tsx` 마커 배선을 검사한다 — 임시 그룹 mock + analytics mock이 마커 영역에 있고 타입이 맺히는지까지(텍스트·타입 수준). 런타임 등록 규칙은 생성물 `src/mock/index.test.ts`가 `pnpm test`에서 증명한다(검증은 루트 네 명령 `pnpm lint`·`typecheck`·`test`·`build`, probe는 `node tooling/gen-menu/scripts/probe.ts`, 깨끗한 트리에서 coordinator가 1회 실행).
- `css-selectors/` (`@ap/css-selectors`) — 빌드된 CSS 파일에서 selector 집합을 추출하고 두 집합의 added/removed를 비교하는 CLI(#58). CI(`.github/workflows/css-selectors.yml`)가 PR head 빌드와 병합 기준(merge-base) 빌드를 비교해 Job 요약에 마크다운 리포트를 쓰고, selector가 제거되면 실패한다. 의도된 제거 PR은 `css-removal-ok` 라벨을 단다(라벨 on/off 시 이 워크플로만 재실행). 로컬 실행: `node tooling/css-selectors/src/cli.ts <base.css> <head.css> [--summary <file>] [--allow-removal]`, 단위 테스트는 `pnpm --filter @ap/css-selectors test`.

## 규칙

- 설정 변경은 모든 패키지에 퍼진다. 바꾼 뒤 루트 네 명령(`pnpm lint && pnpm typecheck && pnpm test && pnpm build`, 루트 `AGENTS.md`)을 돌린다.
- 패키지 접두사(`@ap/`, 임시)를 설정에 쓸 때는 상수 한 곳에만 둔다(패키지 경계 §8).
- 루트 workspace 파일(`package.json`, `pnpm-workspace.yaml`, `turbo.json`)과 CI(`.github/workflows/ci.yml`의 `platform-workspace` Job)는 여기 규칙과 함께 바꾼다.
