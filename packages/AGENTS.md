# packages/ — 플랫폼 패키지 공통 지침

플랫폼 다섯 갈래(루트 `AGENTS.md`)의 구현이 사는 곳이다. 메뉴 화면은 여기 두지 않는다(`menus/<group>` 패키지가 산다).

경계·의존 방향의 원본은 [플랫폼 모노레포 패키지 경계](../docs/integration/platform-packages.md) §3이다. 이 파일은 요약이며 충돌하면 그 문서를 따른다.

## 패키지와 의존 방향

| 패키지 | 역할 | import 가능 |
| --- | --- | --- |
| `contracts/` (`@ap/contracts`) | URL codec, manifest 메타데이터 타입, 응답·Trust envelope, `PlatformAdapter` 포트 | 없음 |
| `ui/` (`@ap/ui`) | 토큰·Tailwind 테마, shadcn primitive, `Button`, `StatusBadge`, `cn` | 외부 라이브러리만 |
| `kernel/` (`@ap/kernel`) | Registry 런타임, `PlatformProvider`, 전역 Context·URL·Scope 상태, 요청 수명주기, i18n | `contracts` |
| `components/` (`@ap/components`) | `PlatformPage`, 표·드로어·감사·신뢰 표시, 상태 화면, 차트 프레임 | `contracts`, `kernel`, `ui` |
| `shell/` (`@ap/shell`) | AppShell, Sidebar, TopBar, CommandPalette, GlobalContextBar, RouteOutlet | `contracts`, `kernel`, `components`, `ui` |
| `mock-server/` (`@ap/mock-server`) | 개발용 서버 대역(`world`·`server`·`jobs`·`mockAdapter`). 앱이 주입. Tailwind 없음 | `contracts` |

## 모든 패키지에 적용

- 위 표의 역방향 import 금지. 어느 패키지도 앱(`apps/*`)이나 메뉴 화면을 import하지 않는다. `mock-server`는 `contracts`만 import한다. kernel·components·shell·ui는 `mock-server`를 import하지 않는다. 서버에 닿는 길은 `PlatformAdapter` 하나다.
- 다른 패키지는 `package.json` `exports`의 공개 진입점으로만 import한다(`@ap/kernel`, `@ap/ui/styles.css`). `@ap/x/src/...` 깊은 경로 금지.
- 패키지는 TS 소스를 그대로 export하고 빌드 단계가 없다. 앱의 Vite가 번들한다.
- Tailwind 클래스를 쓰는 패키지는 `styles.css`에 `@source`로 자기 소스를 등록하고 앱 `src/style.css`가 그것을 import한다. 새 패키지를 만들면 이 둘을 같이 추가한다. Tailwind를 쓰지 않는 패키지(`mock-server`)는 `styles.css`를 만들지 않는다.
- 새 공개 API는 `src/index.ts`에 명시적으로 export한다. 메뉴 한 곳에서만 쓰이는 것은 올리지 않는다(06 §24, 2~3개 메뉴 반복 확인 후 승격).
- 접두사 `@ap/`는 임시다. 런타임 문자열(localStorage 키, 이벤트 이름)에 넣지 않는다.

## 검증

루트에서 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. UI가 바뀌면 `pnpm dev`로 브라우저에서 확인한다. 이동·리팩터링 PR은 빌드 CSS selector 집합이 바뀌지 않았는지도 확인한다.

다음 단계: 수정할 패키지의 `AGENTS.md`.
