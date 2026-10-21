# packages/ — 플랫폼 패키지 공통 지침

플랫폼 다섯 갈래(루트 `AGENTS.md`)의 구현이 사는 곳이다. 메뉴 화면은 여기 두지 않는다(`menus/<space>/<group>` 패키지가 산다).

경계·의존 방향의 원본은 [플랫폼 모노레포 패키지 경계](../docs/integration/platform-packages.md) §3이다. 이 파일은 요약이며 충돌하면 그 문서를 따른다.

## 패키지와 의존 방향

| 패키지 | 역할 | import 가능 |
| --- | --- | --- |
| `contracts/` (`@ap/contracts`) | URL codec, manifest 메타데이터 타입, 응답·Trust envelope, `PlatformAdapter` 포트 | 없음 |
| `ui/` (`@ap/ui`) | 토큰·Tailwind 테마, shadcn primitive, `Button`, `StatusBadge`, `cn` | 외부 라이브러리만 |
| `kernel/` (`@ap/kernel`) | Registry 런타임, `PlatformProvider`, 전역 Context·URL·Scope 상태, 요청 수명주기, i18n | `contracts` |
| `components/` (`@ap/components`) | `PlatformPage`, 표·드로어·감사·신뢰 표시, 상태 화면, 차트 프레임 | `contracts`, `kernel`, `ui` |
| `shell/` (`@ap/shell`) | AppShell, AppRail, AppSidebar, ScopeSelector, CommandPalette, GlobalContextBar, RouteOutlet | `contracts`, `kernel`, `components`, `ui` |
| `mock-server/` (`@ap/mock-server`) | 개발용 서버 대역(`world`·`server`·`jobs`·`createMockAdapter`, 메뉴 조회 엔진 `serveEndpoint`·`defineMockEndpoint`). 앱이 주입. 메뉴별 핸들러는 각 메뉴 `src/mock/`이 소유. Tailwind 없음 | `contracts` |
| `http-adapter/` (`@ap/http-adapter`) | 실서버 클라이언트(`bootstrapHttpAdapter` → `PlatformAdapter`, [전송 형식](../docs/integration/http-adapter-contract.md)). 앱의 운영 조립 `src/real/**`만 import | `contracts` |
| `server-conformance/` (`@ap/server-conformance`) | 서버 경계 적합성 묶음(#145, #152 — 포트 메서드 포함). 어댑터 구현과 무관 — mock·실어댑터를 같은 잣대로. 앱 통합 테스트가 돌린다 | `contracts`(+ vitest) |

## 모든 패키지에 적용

- 역방향 import 금지, 서버에 닿는 길은 `PlatformAdapter` 하나([패키지 경계](../docs/integration/platform-packages.md) §3-§4) — 메뉴 어휘 메서드를 포트에 추가하지 않는다.
- `@fops/*`는 어떤 플랫폼 패키지에서도 import하지 않는다(경계 lint). 토큰·primitive는 `@ap/ui`가 소유하고(FeedbackOps `a8d768b8`에서 이전, #441), 다른 플랫폼 코드는 `@ap/ui` 공개 export를 사용한다([ADR-0043](../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)·[0046](../docs/adr/0046-design-system-source-moves-to-platform-whole-package.md)). 레이아웃·도메인 결합 묶음은 #442·#443에서 이어서 옮긴다.
- 다른 패키지는 `package.json` `exports`의 공개 진입점으로만 import한다(`@ap/kernel`, `@ap/ui/styles.css`). `@ap/x/src/...` 깊은 경로 금지.
- workspace 개발에서는 패키지가 TS 소스를 그대로 export하고, `build`는 배포 tarball용 `dist`를 만든다([ADR-0056](../docs/adr/0056-sdk-release-github-release-tarballs.md)). 앱은 Vite가 번들한다.
- Tailwind 클래스를 쓰는 패키지는 `styles.css`에 `@source`로 자기 소스를 등록하고 앱 `src/style.css`가 그것을 import한다. 새 패키지를 만들면 이 둘을 같이 추가한다. Tailwind를 쓰지 않는 패키지(`mock-server`)는 `styles.css`를 만들지 않는다.
- 예외: 테스트 전용 진입점 `@ap/kernel/testing`(`testAdapter`·`testSession`·`testSpace`·`noContext`·`memoryStorage`)과 `@ap/components/testing`(`stubCompactTableGeometry`, 표 기하 stub; components 테스트는 `./testing`) 둘은 ADR-0040(확장 #413)에 따라 `exports["./testing"]`로 낸다. 테스트 파일(`*.test.ts(x)`·`test-support.ts`·`test-setup.ts`)에서만 import하고, 프로덕션 소스는 lint가 막는다. 어댑터 stub은 손으로 쓰지 말고 `testAdapter({ … })`로 만든다. `@ap/server-conformance`는 프로덕션·테스트 모두 `@ap/contracts`만 본다.
- 새 공개 API는 `src/index.ts`에 명시적으로 export한다. 메뉴 한 곳에서만 쓰이는 것은 올리지 않는다(06 §24, 2~3개 메뉴 반복 확인 후 승격). §4 Kernel 책임은 이 기준 밖이다.
- 접두사 `@ap/`는 임시다. 런타임 문자열(localStorage 키, 이벤트 이름)에 넣지 않는다.

## 검증

- 빌드 뒤 `pnpm sdk:api`로 공개 API 스냅샷을 확인한다. 이 명령은 각 패키지의 빌드 산출물 `dist`를 읽는다.
패키지별 검사(`pnpm --filter @ap/<패키지> test`)로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). 이동·리팩터링 PR의 빌드 CSS selector 집합은 CI `CSS selectors (build diff)`가 자동 비교한다(의도한 제거만 `css-removal-ok` 라벨, [tooling/AGENTS.md](../tooling/AGENTS.md)).

배포 모양을 건드렸으면(패키지 `exports`·CSS `@source`·`tsconfig.build.json`·새 파일 종류) `pnpm sdk:pack --out <임시 폴더>` 뒤 `pnpm sdk:consumer-check <같은 폴더>`를 돌린다. 앞은 다섯 패키지를 `dist`로 빌드해 tarball과 `SHA256SUMS`를 만들고, 뒤는 깨끗한 외부 소비자가 그것을 받아 설치·`tsc`·Vite 빌드·CSS 클래스·Vitest까지 확인한다(CI가 같은 순서로 돌린다, ADR-0056).

다음 단계: 수정할 패키지의 `AGENTS.md`.
