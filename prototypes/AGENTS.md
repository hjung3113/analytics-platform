# prototypes/ — Kernel 단위 프로토타입 (보존)

`apps/platform-web`으로 통합되기 전, Kernel 유닛을 하나씩 검증한 독립 프로토타입이다. 각자 npm lockfile을 가진 별도 프로젝트이며 pnpm workspace에 포함되지 않는다.

- `kernel-app-shell` (Unit A), `kernel-chart-frame` (Unit B), `kernel-platform-table` (Unit C) — Vite + React.
- `kernel-context-url-scope` — Python URL codec 기준 구현.

## 규칙

- 새 기능을 여기 추가하지 않는다. 플랫폼 코드는 `packages/*`, 조립·화면은 `apps/platform-web`.
- CI Job(Unit A–C, Python codec)이 계속 돌므로 깨진 경우에만 최소 수정한다.
- README·로그는 당시 검증 기록이다. 현재 계약의 근거로 쓰지 않는다.
- Playwright 브라우저가 필요하면 `PLAYWRIGHT_BROWSERS_PATH=$PWD/prototypes/kernel-platform-table/.browsers`를 쓴다.
