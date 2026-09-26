# tooling/ — 공유 개발 도구 설정

workspace 패키지가 공유하는 설정 패키지. 런타임 코드는 두지 않는다.

## 현재

- `tsconfig/` (`@ap/tsconfig`) — `base.json`. 모든 패키지·앱의 `tsconfig.json`이 `extends` 한다.

## 계획 (6단계, [패키지 경계](../docs/integration/platform-packages.md) §6)

- `eslint/` — 의존 방향·깊은 경로 import 금지·URL 직접 조립 금지 같은 계약 lint(ESLint, Decided).
- `gen-menu/` — 메뉴 패키지 생성기(`pnpm gen:menu`).

## 규칙

- 설정 변경은 모든 패키지에 퍼진다. 바꾼 뒤 루트 `pnpm typecheck && pnpm test && pnpm build`를 돌린다.
- 패키지 접두사(`@ap/`, 임시)를 설정에 쓸 때는 상수 한 곳에만 둔다(패키지 경계 §8).
- 루트 workspace 파일(`package.json`, `pnpm-workspace.yaml`, `turbo.json`)과 CI(`.github/workflows/ci.yml`의 `platform-workspace` Job)는 여기 규칙과 함께 바꾼다.
