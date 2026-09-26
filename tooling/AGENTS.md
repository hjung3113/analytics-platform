# tooling/ — 공유 개발 도구 설정

workspace 패키지가 공유하는 설정 패키지. 런타임 코드는 두지 않는다.

## 현재

- `tsconfig/` (`@ap/tsconfig`) — `base.json`. 모든 패키지·앱의 `tsconfig.json`이 `extends` 한다.
- `eslint/` (`@ap/eslint-config`) — 패키지 경계·계약 lint(ESLint flat config). 패키지별 프리셋(`contracts`·`kernel`·`menu`·`app` 등)을 각 consumer가 `eslint.config.js` 한 줄로 가져다 쓴다. 접두사 상수와 규칙 원본은 `tooling/eslint/src/`에 있다.
- `gen-menu/` (`@ap/gen-menu`, `pnpm gen:menu`) — 이미 `GroupId`(`packages/contracts/src/menu.ts`)와 `GROUPS`(`apps/platform-web/src/menus.ts`)에 있는 그룹의 메뉴 패키지를 스캐폴딩한다. 사이드바 그룹을 추가하지 않는다. 검증은 루트 네 명령(`pnpm lint`·`typecheck`·`test`·`build`)과 probe(`node tooling/gen-menu/scripts/probe.ts`, 깨끗한 트리에서 coordinator가 1회 실행)로 한다.

## 규칙

- 설정 변경은 모든 패키지에 퍼진다. 바꾼 뒤 루트 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`를 돌린다.
- 패키지 접두사(`@ap/`, 임시)를 설정에 쓸 때는 상수 한 곳에만 둔다(패키지 경계 §8).
- 루트 workspace 파일(`package.json`, `pnpm-workspace.yaml`, `turbo.json`)과 CI(`.github/workflows/ci.yml`의 `platform-workspace` Job)는 여기 규칙과 함께 바꾼다.
