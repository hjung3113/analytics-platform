# packages/ — 플랫폼 패키지 공통 지침

플랫폼 다섯 갈래(루트 `AGENTS.md`)의 구현이 사는 곳이다. 메뉴 화면은 여기 두지 않는다(`menus/<space>/<group>`·`platform/<feature>` 패키지가 산다).

경계·의존 방향의 원본은 [플랫폼 모노레포 패키지 경계](../docs/integration/platform-packages.md) §3이다. 이 파일은 요약이며 충돌하면 그 문서를 따른다.

## 패키지와 의존 방향

폴더는 한 단계 묶여 있다(ADR-0090, #713): SDK 다섯과 배포하지 않는 `contract-schemas`는 `sdk/`, 어댑터·소비자 쪽 넷은 `adapters/`, 기능 패키지 집합(`tooling/eslint/src/feature-packages.js`) `feature-shared/`·`feature-ui/`는 `packages/` 바로 아래다. 패키지 이름(`@ap/*`)과 공개 API는 폴더와 무관하다. 패키지 안에서 저장소 루트로 가는 상대 경로는 `../../../`다.

| 패키지 | 역할 | import 가능 |
| --- | --- | --- |
| `sdk/contracts/` (`@ap/contracts`) | URL codec, manifest 메타데이터 타입, 응답·Trust envelope, `PlatformAdapter` 포트 | 없음 |
| `sdk/contract-schemas/` (`@ap/contract-schemas`) | 계약 스키마 원본(Zod)과 JSON Schema 2020-12 산출물·`endpoints.json`(ADR-0096). 배포 tarball이 아니라 `pnpm sdk:schemas`의 Release 자산이며 소비자 없음(`SDK_PACKAGES`에 없음) | 런타임 `zod`만(테스트만 `contracts`) |
| `sdk/ui/` (`@ap/ui`) | 토큰·Tailwind 테마, shadcn primitive, `Button`, `StatusBadge`, `cn` | 외부 라이브러리만 |
| `sdk/kernel/` (`@ap/kernel`) | Registry 런타임, `PlatformProvider`, 전역 Context·URL·Scope 상태, 요청 수명주기(내부 엔진 `@tanstack/react-query`, ADR-0086), i18n | `contracts` + 외부 `@tanstack/react-query`(내부 전용) |
| `sdk/components/` (`@ap/components`) | `PlatformPage`, 표·드로어·감사·신뢰 표시, 상태 화면, 차트 프레임 | `contracts`, `kernel`, `ui` |
| `sdk/shell/` (`@ap/shell`) | AppShell, AppRail, AppSidebar, ScopeSelector, CommandPalette, GlobalContextBar, RouteOutlet | `contracts`, `kernel`, `components`, `ui` |
| `adapters/feature-bridge/` (`@ap/feature-bridge`) | 기능 화면 다리 런타임(세션 싱글턴·`FeatureBridge`·`hostLinks`·`feature-api`·Kernel 슬롯 값, ADR-0071·0081). 소비자 쪽이며 SDK 아님. 다리 메뉴와 앱 파일이 root를, 슬롯·API 서브패스는 앱 `main.tsx`만 import | `contracts`, `kernel`, `components`, `ui` + `@ap/feature-screens/global-screens/core` |
| `adapters/mock-server/` (`@ap/mock-server`) | 개발용 서버 대역(`world`·`server`·`jobs`·`createMockAdapter`, 메뉴 조회 엔진 `serveEndpoint`·`defineMockEndpoint`). 앱이 주입. 메뉴별 핸들러는 각 메뉴 `src/mock/`이 소유. Tailwind 없음 | `contracts` |
| `adapters/http-adapter/` (`@ap/http-adapter`) | 실서버 클라이언트(`bootstrapHttpAdapter` → `PlatformAdapter`, [전송 형식](../docs/integration/http-adapter-contract.md)). 앱의 운영 조립 `src/real/**`만 import | `contracts` |
| `adapters/server-conformance/` (`@ap/server-conformance`) | 서버 경계 적합성 묶음(#145, #152 — 포트 메서드 포함). 어댑터 구현과 무관 — mock·실어댑터를 같은 잣대로. 앱 통합 테스트가 돌린다 | `contracts`(+ vitest) |

## 모든 패키지에 적용

- 역방향 import 금지, 서버에 닿는 길은 `PlatformAdapter` 하나([패키지 경계](../docs/integration/platform-packages.md) §3-§4) — 메뉴 어휘 메서드를 포트에 추가하지 않는다.
- 기능 패키지 집합(`tooling/eslint/src/feature-packages.js`)는 어떤 플랫폼 패키지에서도 import하지 않는다(경계 lint). 예외는 다리 `@ap/feature-bridge`(`@ap/feature-screens/global-screens/core`, 슬롯이 lazy로 여는 `src/pages/`는 `global-screens`도) 하나다(ADR-0071). 토큰·primitive는 `@ap/ui`가 소유하고(FeedbackOps `a8d768b8`에서 이전, #441), 다른 플랫폼 코드는 `@ap/ui` 공개 export를 사용한다([ADR-0043](../docs/adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)·[0046](../docs/adr/0046-design-system-source-moves-to-platform-whole-package.md)). 레이아웃·도메인 결합 묶음은 #442·#443에서 이어서 옮긴다.
- 다른 패키지는 `package.json` `exports`의 공개 진입점으로만 import한다(`@ap/kernel`, `@ap/ui/styles.css`). `@ap/x/src/...` 깊은 경로 금지.
- workspace 개발에서는 패키지가 TS 소스를 그대로 export하고, `build`는 배포 tarball용 `dist`를 만든다([ADR-0056](../docs/adr/0056-sdk-release-github-release-tarballs.md)). 앱은 Vite가 번들한다.
- Tailwind 클래스를 쓰는 패키지는 `styles.css`에 `@source`로 자기 소스를 등록하고 앱 `src/style.css`가 그것을 import한다. 새 패키지를 만들면 이 둘을 같이 추가한다. Tailwind를 쓰지 않는 패키지(`mock-server`)는 `styles.css`를 만들지 않는다.
- 예외: 테스트 전용 진입점 `@ap/kernel/testing`(`testAdapter`·`testSession`·`testSpace`·`noContext`·`memoryStorage`·`ToastProbe`·`useToastsForTest`·`settleQueries`)과 `@ap/components/testing`(`stubCompactTableGeometry`, 표 기하 stub; components 테스트는 `./testing`) 둘은 ADR-0040(확장 #413)에 따라 `exports["./testing"]`로 낸다. 테스트 파일(`*.test.ts(x)`·`test-support.ts(x)`·`test-setup.ts`)에서만 import하고, 프로덕션 소스는 lint가 막는다. 어댑터 stub은 손으로 쓰지 말고 `testAdapter({ … })`로 만든다. `@ap/feature-bridge/testing`(`createFeatureMenuHarness`, FeedbackOps 다리 메뉴의 레지스트리·`mountAt` 하니스)도 같은 방식의 테스트 전용 진입이며 다리 메뉴(`foBridgeMenu`)의 테스트·`test-support`만 import한다(root가 재export하지 않는다). `@ap/server-conformance`는 프로덕션·테스트 모두 `@ap/contracts`만 본다.
- 예외: 호스트 전용 진입점 `@ap/components/dock`(제어형 `DockLayout`·레이아웃 스키마·순수 명령, ADR-0067)은 `exports["./dock"]`로 내며 `src/index.ts`에서 내보내지 않는다. 셸·앱 프로덕션 코드만 import하고(lint 게이트) `dockview-*` 엔진은 `@ap/components` 밖에서 import하지 않는다.
- 예외: 호스트 전용 진입점 `@ap/kernel/host`(`useHostPlatform`·`HostPlatform`과 셸 전용 심볼, [ADR-0076](../docs/adr/0076-kernel-host-entry-narrow-menu-platform.md))는 `exports["./host"]`로 낸다. 셸·공통 컴포넌트·앱이 import하고, 메뉴·메뉴 mock·호스트 모듈은 lint가 막는다. 메뉴는 root `usePlatform()`(`MenuPlatform`)만 쓴다.
- 새 공개 API는 `src/index.ts`에 명시적으로 export한다. 도메인을 모르는 범용 조각은 소비자 수와 관계없이 SDK에 두고(ADR-0052), 메뉴 안에서 생긴 패턴은 2~3개 메뉴 반복을 확인한 뒤 올린다(06 §24). §4 Kernel 책임은 이 기준 밖이다.
- 접두사 `@ap/`는 임시다. 런타임 문자열(localStorage 키, 이벤트 이름)에 넣지 않는다.

## 검증

- 빌드 뒤 `pnpm sdk:api`로 공개 API 스냅샷을 확인한다. 이 명령은 각 패키지의 빌드 산출물 `dist`를 읽는다.
패키지별 검사(`pnpm --filter @ap/<패키지> test`)로 좁혀 본 뒤 루트 검사(루트 `AGENTS.md`). 이동·리팩터링 PR의 빌드 CSS selector 집합은 CI `CSS selectors (build diff)`가 자동 비교한다(의도한 제거만 `css-removal-ok` 라벨, [tooling/AGENTS.md](../tooling/AGENTS.md)).

배포 모양을 건드렸으면(패키지 `exports`·CSS `@source`·`tsconfig.build.json`·새 파일 종류) `pnpm sdk:pack --out <임시 폴더>` 뒤 `pnpm sdk:consumer-check <같은 폴더>`를 돌린다. 앞은 다섯 패키지를 `dist`로 빌드해 tarball과 `SHA256SUMS`를 만들고, 뒤는 깨끗한 외부 소비자가 그것을 받아 설치·`tsc`·Vite 빌드·CSS 클래스·Vitest까지 확인한다(CI가 같은 순서로 돌린다, ADR-0056).

다음 단계: 수정할 패키지의 `AGENTS.md`.
