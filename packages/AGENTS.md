# packages/ — 플랫폼 패키지 공통 지침

플랫폼 다섯 갈래(루트 `AGENTS.md`)의 구현이 사는 곳이다. 메뉴 화면은 여기 두지 않는다(`menus/<group>` 패키지가 산다).

경계·의존 방향의 원본은 [플랫폼 모노레포 패키지 경계](../docs/integration/platform-packages.md) §3이다. 이 파일은 요약이며 충돌하면 그 문서를 따른다.

## 패키지와 의존 방향

| 패키지 | 역할 | import 가능 |
| --- | --- | --- |
| `contracts/` (`@ap/contracts`) | URL codec, manifest 메타데이터 타입, 응답·Trust envelope, `PlatformAdapter` 포트 | 없음 |
| `ui/` (`@ap/ui`) | 토큰·Tailwind 테마, shadcn primitive, `Button`, `StatusBadge`, `cn` | 외부 라이브러리, `@fops/ui` |
| `kernel/` (`@ap/kernel`) | Registry 런타임, `PlatformProvider`, 전역 Context·URL·Scope 상태, 요청 수명주기, i18n | `contracts` |
| `components/` (`@ap/components`) | `PlatformPage`, 표·드로어·감사·신뢰 표시, 상태 화면, 차트 프레임 | `contracts`, `kernel`, `ui` |
| `shell/` (`@ap/shell`) | AppShell, AppRail, AppSidebar, ScopeSelector, CommandPalette, GlobalContextBar, RouteOutlet | `contracts`, `kernel`, `components`, `ui` |
| `mock-server/` (`@ap/mock-server`) | 개발용 서버 대역(`world`·`server`·`jobs`·`createMockAdapter`, 메뉴 조회 엔진 `serveEndpoint`·`defineMockEndpoint`). 앱이 주입. 메뉴별 핸들러는 각 메뉴 `src/mock/`이 소유. Tailwind 없음 | `contracts` |
| `server-conformance/` (`@ap/server-conformance`) | 서버 경계 적합성 묶음(#145, #152 — 포트 메서드 포함). 어댑터 구현과 무관 — mock·실어댑터를 같은 잣대로. 앱 통합 테스트가 돌린다 | `contracts`(+ vitest) |

## 모든 패키지에 적용

- 역방향 import 금지, 서버에 닿는 길은 `PlatformAdapter` 하나([패키지 경계](../docs/integration/platform-packages.md) §3-§4) — 메뉴 어휘 메서드를 포트에 추가하지 않는다.
- `@fops/*`는 외부 원본이다. FeedbackOps primitive는 `@ap/ui`만 `@fops/ui`에서 가져오며, 다른 플랫폼 코드는 `@ap/ui` 공개 export를 사용한다(ADR-0011).
- 다른 패키지는 `package.json` `exports`의 공개 진입점으로만 import한다(`@ap/kernel`, `@ap/ui/styles.css`). `@ap/x/src/...` 깊은 경로 금지.
- 패키지는 TS 소스를 그대로 export하고 빌드 단계가 없다. 앱의 Vite가 번들한다.
- Tailwind 클래스를 쓰는 패키지는 `styles.css`에 `@source`로 자기 소스를 등록하고 앱 `src/style.css`가 그것을 import한다. 새 패키지를 만들면 이 둘을 같이 추가한다. Tailwind를 쓰지 않는 패키지(`mock-server`)는 `styles.css`를 만들지 않는다.
- 새 공개 API는 `src/index.ts`에 명시적으로 export한다. 메뉴 한 곳에서만 쓰이는 것은 올리지 않는다(06 §24, 2~3개 메뉴 반복 확인 후 승격). §4 Kernel 책임은 이 기준 밖이다.
- 접두사 `@ap/`는 임시다. 런타임 문자열(localStorage 키, 이벤트 이름)에 넣지 않는다.

## 검증

패키지별 검사(`pnpm --filter @ap/<패키지> test`)로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). 이동·리팩터링 PR의 빌드 CSS selector 집합은 CI `CSS selectors (build diff)`가 자동 비교한다(의도한 제거만 `css-removal-ok` 라벨, [tooling/AGENTS.md](../tooling/AGENTS.md)).

다음 단계: 수정할 패키지의 `AGENTS.md`.
