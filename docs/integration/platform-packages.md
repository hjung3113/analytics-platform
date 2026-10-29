# 플랫폼 모노레포 패키지 경계 (Decided 2026-09-26 — 세부 필드명은 Candidate)

> 상태: [05 Decided "다음 구현 범위: 프론트엔드 플랫폼 틀 + 메뉴 개발 환경"](../overview/roadmap-and-open-questions.md)의 첫 단계로 패키지 경계와 의존 방향을 정한다. §8의 5개 항목은 2026-09-26 사용자가 제안안대로 **Decided**. `PlatformAdapter`·`MenuMeta`·`evaluateSelection` 같은 필드·타입 이름은 구현하면서 바뀔 수 있는 Candidate다.
>
> §2·§7은 비어 있다 — 모노레포 추출 순서와 기록은 git 이력(PR #16–#32).
>
> 근거: [06 §3 아키텍처](../contract/platform-ui-contract.md#3-platform-ui-architecture), [§4 Kernel 책임](../contract/kernel.md#4-platform-kernel-responsibilities), [§5 Menu Extension Contract](../contract/kernel.md#5-menu-extension-contract), [§13 컴포넌트 층](../contract/components.md#13-shared-component-layers).

## 1. 목표와 범위

- `platform-app`에 모여 있는 Kernel·UI·공통 컴포넌트·셸을 패키지로 나눈다. 메뉴는 **패키지 경계 밖에서** 선언만으로 얹히게 한다(06 §3: "플랫폼 기능은 개별 메뉴 import 관계를 알지 못해야 한다").
- 새 메뉴를 만들 때 쓸 템플릿(생성기)의 모양을 정한다.
- 서버는 mock을 유지한다(05 Decided). mock은 교체 가능한 어댑터 뒤로 숨긴다.
- **범위 밖:** 워크스페이스 층 구현(06 §9.1), Storybook·시각 회귀. 이들은 이 경계 위에서 후속 PR로 진행한다. 기능 앱·백엔드는 `apps/{platform-api,feature-screens}`·`packages/feature-*`에 두며 루트 pnpm workspace의 일부다(#642). 플랫폼 코드는 UI primitive를 `@ap/ui`를 통해 소비한다.

## 3. 패키지 구성

> 의존 방향은 SDK ← 제품 한 방향이다([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md)). `@ap/feature-ui`는 `@ap/ui`에 의존한다([ADR-0046](../adr/0046-design-system-source-moves-to-platform-whole-package.md)).


루트에 pnpm workspace를 두고 세 갈래로 나눈다: `packages/`(플랫폼: SDK 다섯은 `packages/sdk/`, 어댑터·소비자 쪽 넷은 `packages/adapters/`, 기능 `feature-*`는 `packages/` 바로 아래), Consumer 두 루트(업무 시스템 메뉴 `menus/<system>/<group>/`, 플랫폼 기능 `platform/<feature>/`), `apps/`(조립 지점). 이름 접두사는 Candidate `@ap/`.

| 패키지 | 06 갈래 | 내용(현재 파일 기준) | React | 의존 가능 |
| --- | --- | --- | --- | --- |
| `@ap/contracts` | Kernel 계약 | 순수 URL codec(`safeReturnTo`는 Registry가 필요해 Kernel에 남는다), manifest **메타데이터** 타입(`MenuMeta`: `MenuEntry`에서 `icon`·`component`를 뺀 선언부, `ContextKey`, `Capability`, `PageType`, 브랜드 id `GroupId`·`SpaceId`·`MenuPermission`과 그 생성자 `groupId`·`spaceId`·`menuPermission`, Kernel 고유 권한 `KERNEL_PERMISSIONS`·`Permission`; 그룹·공간·메뉴 권한의 값 목록은 앱이 선언한다, [ADR-0072](../adr/0072-open-menu-vocabulary-app-declared-branded-ids.md)), 응답·Trust envelope(`ApiResponse`, `Trust`, `Assessment`, `Outcome`), `AuditEvent`, `Text`(i18n 문자열 쌍), `PlatformAdapter` 포트와 그 입출력 타입(§4), 메뉴 조회 선언 `EndpointSpec`·`defineEndpoint`·`projectContext`·`MenuQuery`(§5), 서버 페이징 모양 `PageQuery`·`PageResult`·`sortAndPage`, wall-clock 기간 계산 `periodHours`·`bucketStart`. 워크스페이스 export는 `src`를 가리킨다. `publishConfig.exports`는 `check:pack`에서만 쓰는 manifest이며, SDK 배포 tarball은 `sdk-pack`이 생성한 manifest로 `dist`의 Node ESM `.js`·`.d.ts`를 연다. 소비자는 `AbortSignal`을 제공해야 한다(DOM lib 또는 `@types/node`); `check:pack`은 별도 계약용 tarball의 내용과 저장소 밖 소비자의 Bundler·NodeNext 타입 검사 및 Node import를 확인한다. | 없음(타입 포함) | 없음 |
| `@ap/contract-schemas` | (계약 산출물, SDK 아님) | 와이어 계약(`Outcome`·`Assessment`·`Trust`·`ApiResponse`·`MenuQuery`·엔드포인트 선언)의 Zod 스키마 원본(`zod/v4`)과 JSON Schema 2020-12 내보내기 `schemas/*.json`, 메뉴 엔드포인트 선언 스냅샷 `endpoints.json`(ADR-0096, #1086). 손으로 쓴 `@ap/contracts` 타입과의 같음은 타입 테스트(`tsc`)가 지킨다. `tooling/sdk/sdk-exports.mjs`의 `SDK_PACKAGES`에 없고 tarball이 아니라 `pnpm sdk:schemas`가 만드는 Release 자산 `contract-schemas-<ver>.tgz`로 낸다. 산출물 형식은 [패키지 규칙](../../packages/sdk/contract-schemas/AGENTS.md#artifact-format-rules)이 소유한다 | 없음 | 런타임은 `zod`만(`@ap/*`·React 금지는 lint, `zod`만은 manifest와 리뷰). 테스트 파일만 `contracts`. 런타임 진입 `.`은 `pnpm --filter @ap/contract-schemas build`(`tsconfig.runtime.json`)가 `dist/`에 내는 JS+선언이고 원본 `.ts`는 `./source`로 남는다. 소비자는 코어 서버 `@ap/platform-api` 하나(`build`·`typecheck`·`test`는 turbo가 이 빌드를 먼저 돌린다) |
| `@ap/ui` | 공통 컴포넌트(UI Primitive) | `styles/*.css`(FeedbackOps `a8d768b8`에서 이전한 tokens·semantic·theme·compat + 플랫폼 확장 `platform-tokens.css`), `ui/components/shadcn/*`·`Button`·`cn`(같은 시점 이전 구현, ADR-0046), `StatusBadge`(`Tone`), `DetailPanelSlot`(셸 상세 슬롯 등록 primitive: Provider·등록/host hook, 06 §13·ADR-0013) | 있음 | 외부 라이브러리만(기능 패키지 import 금지, ADR-0046) |
| `@ap/kernel` | Kernel 기능 | 진입점 둘(ADR-0076): root는 메뉴 표면 — `PlatformProvider`/`usePlatform`(`MenuPlatform`)/`PlatformLink`; `@ap/kernel/host`는 셸·공통 컴포넌트·앱 전용 — `useHostPlatform`(`HostPlatform`, 전체 값)·`PaneScreenProvider`·`useModuleHost` 등(메뉴·모듈 import는 lint가 막는다). 이하 root, `usePlatformQuery`, 메뉴 조회 `useMenuQuery`(렌더 시점)·`useMenuFetch`(표 `loadPage`·내보내기 같은 호출형), i18n Provider, Registry 런타임(`createRegistry`, `matchRoute`, `pathFor`, `safeReturnTo`), React binding 타입 `MenuEntry = MenuMeta & { icon: LucideIcon; component?: LazyExoticComponent<…> }`, 어댑터 주입(`PlatformProvider adapter={…}`)과 세션 revision, 슬롯 등록, 조회 수명주기(내부 엔진 `@tanstack/react-query` 5.62.7 정확 고정 — 공유 키 중복 제거·5분 메모리 SWR, 클라이언트·타입은 공개 API에 나가지 않고 lint `denyQueryEngine`이 메뉴·메뉴 mock·components·shell·앱 프리셋의 import를 막는다(kernel·`@ap/feature-bridge` 허용), [ADR-0086](../adr/0086-kernel-query-engine-tanstack.md)) | 있음 | `contracts` |
| `@ap/components` | 공통 컴포넌트(Platform Component) + 차트 계약 + 레이아웃 | `PlatformPage`, `PlatformDataTable`, `DetailDrawer`, `AuditTimeline`, `DataTrustIndicator`, `StateView`, `StatCard`, `RadioGroup`, `AnalysisChartFrame`, `EChart`, 호스트 전용 진입점 `./dock`(제어형 `DockLayout`·레이아웃 스키마·순수 명령·플랫폼 separator, ADR-0067; 엔진 `dockview-react`는 lazy 청크 안에서만 쓰고 공개 API에 엔진 타입이 없다) | 있음 | `contracts`, `kernel`, `ui` |
| `@ap/shell` | Kernel 기능(App Shell) | `AppShell`, `AppRail`, `AppSidebar`, `ScopeSelector`, `CommandPalette`, `GlobalContextBar`, `RouteOutlet`(미등록·계약 오류·권한 없음·미구현 상태) | 있음 | `contracts`, `kernel`, `components`, `ui` |
| `@ap/feature-bridge` | (소비자 쪽 런타임, SDK 아님) | 기능 다리의 세션 런타임([ADR-0071](../adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md)·[0081](../adr/0081-feedbackops-operator-screens-platform-frame.md), #759): `featureQueryClient`(QueryClient는 이 하나)·`useFeatureSession`(세션 세대)·`FeatureBridge`·`FeatureScreenPage`(운영 화면 페이지 골격과 거절 값 검사)·`hostLinks`와 경로 → 메뉴 링크 맵, `feature-api`(`setFeatureApi`/`featureApi`), Kernel 슬롯 값 `notifications-slot`·`voc-compose-slot`·`home-todo-slot`(슬롯이 lazy로 여는 `src/pages/`의 화면 둘 포함). 화면은 재export하지 않는다. 테스트 전용 서브패스 `@ap/feature-bridge/testing`(`createFeatureMenuHarness`, 다리 메뉴의 레지스트리·`mountAt` 하니스; root가 재export하지 않아 프로덕션 번들에 `@testing-library/react`가 실리지 않는다)이 있다. `tooling/sdk/sdk-exports.mjs`의 `SDK_PACKAGES`에 없고 배포하지 않는다 | 있음 | `contracts`, `kernel`, `components`, `ui` + 기능 진입 `@ap/feature-screens/global-screens/core`(lazy `src/pages/`는 `global-screens`도). import하는 쪽: 다리 메뉴(root, `@ap/menu-my-activity`와 기능 메뉴 `platform/{dashboard,voc,findings,tasks,integration,surveys,feature-admin}`)와 앱(root는 앱 파일 어디서나, `/feature-api`·`/*-slot` 서브패스는 `main.tsx`만, `/testing`은 다리 메뉴의 `*.test.*`·`test-support.*`만). 커널·components·shell·ui·contracts와 다른 메뉴는 lint가 막는다 |
| `@ap/mock-server` | (개발용) | `world`·`server`·`jobs`와 이들만 보는 단위 테스트(`explicit-empty`, `time-domain`). `PlatformAdapter` mock 구현(설정·사람·공지 포트의 사용자별 인메모리 저장 포함) `createMockAdapter({ endpoints, registry, auditEvents? })`(감사 시드는 ADR-0048), 메뉴 조회 엔진 `serveEndpoint`(선언 사본으로 요청 모양·권한·Scope·한도 판정)와 핸들러 정의 `defineMockEndpoint`. 메뉴별 핸들러는 메뉴 패키지가 소유한다 | 없음 | `contracts` |
| `@ap/http-adapter` | (운영) | 실서버 클라이언트: `bootstrapHttpAdapter(options)`가 `GET /api/v1/platform/bootstrap`을 읽고 `ready`(`PlatformAdapter`)·`login`·`unavailable`을 돌려준다(reject 없음). 포트 메서드를 [전송 형식](http-adapter-contract.md) §1대로 HTTP로 옮기고 §2 변환·§4 `subscribe` 폴링·§5 취소/타임아웃·§6 CSRF·§7 Correlation ID를 지킨다. React·DOM 컴포넌트 없음(`fetch`·`AbortSignal`·`crypto`만). 앱은 운영 조립 `apps/platform-web/src/real/**`에서만 import한다(경계 lint). 예외: 플랫폼 API 테스트가 적합성 하네스로 쓴다([ADR-0073](../adr/0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md)) | 없음 | `contracts` |
| `@ap/server-conformance` | (검사) | 서버 경계 적합성 묶음(#145, #152): 엔드포인트 선언과 표본 요청으로 `PlatformAdapter`가 메뉴 조회 계약과 포트 메서드 계약(세션·Scope·목적지·감사·콘솔 조회·주석·활용률·오류 보고)을 지키는지 판정. mock과 사내 실어댑터에 같은 잣대 | 없음 | `contracts`(+ vitest) |
| `@ap/menu-<group>` | Consumer | Registry의 그룹마다 하나. 업무 시스템 메뉴는 `menus/<system>/<group>/`(`equipment`, `master-data`, `analytics`, `hw-time`, `metrics` 등), 플랫폼 기능은 `platform/<feature>/`(`home`(overview), `my-activity`, `notice-voc`, `admin`, 기능 화면 `dashboard`·`voc`·`findings`·`tasks`·`integration`·`surveys`·`feature-admin`)이다. 화면이 아직 없는 계획 메뉴(공정·레시피 마스터, Wafer Journey, 공지 등)도 `component` 없는 manifest로 자기 그룹 패키지가 소유한다(셸이 미구현 화면으로 표시). 각 패키지가 `manifests`(여러 메뉴 가능)와 화면·도메인 컴포넌트, 조회 선언 `src/endpoints.ts`, 서버 쪽 핸들러 `src/mock/`(서브패스 `./mock`, 앱 mock 조립 `src/dev/mock-assembly.tsx`만 import — 운영 빌드에는 없음, ADR-0009)을 가진다 | 있음 | `contracts`, `kernel`, `components`, `ui` (`src/mock/**`는 `contracts`·`mock-server`·자기 `endpoints.ts`만) |
| `apps/platform-web` | 조립 지점 | `main.tsx`, IA 설정(`SPACES`·`GROUPS`), 메뉴 등록, 어댑터 주입, dev 도구(역할 전환·응답 시나리오) | 있음 | 전부 |
| `apps/platform-e2e` | (검사) | 조립된 앱을 브라우저로 띄워 플랫폼 계약을 검사하는 Playwright 블랙박스 테스트와 항목별 보고(#44) | 없음 | 없음(`@ap/*` import 금지, 브라우저로만 관찰) |
| `tooling/*` | 개발 환경 | 공유 tsconfig, lint 설정(경계·계약 규칙), 메뉴 생성기 | — | — |

### 플랫폼 기능 Consumer 루트 (Decided 2026-10-28)

[ADR-0097](../adr/0097-platform-features-and-role-based-names.md)이 정한 목표 배치에서 `platform/<feature>/`는 **Consumer 층**이며 SDK가 아니다. 기능 메뉴는 한 단계, 업무 시스템 메뉴 `menus/<system>/<group>/`는 두 단계다. 플랫폼 기능의 공간 소속은 앱의 `GROUPS` 선언에서만 읽으며 폴더에서 추정하지 않는다. 생성기는 `space: null` 그룹을 항상 `platform/<group>/`에 만들고, 공간이 있는 그룹은 `--platform`을 줄 때만 거기에 만든다(없으면 `menus/<space>/<group>/`). `--remove`는 메타데이터로 두 루트 어느 쪽이든 찾는다. `repo-invariants`는 두 루트의 그룹 소유·메뉴 id·경로 모양·패키지 이름 중복을 함께 검사하고, `menus/` 폴더의 공간은 `GROUPS`와 일치하는지 보며 `platform/`은 폴더 이름을 공간으로 읽지 않는다. 용어는 [GLOSSARY](../../GLOSSARY.md)가 소유한다. 폴더 이동은 #1098에서 끝났다(b: 기능 코드, r: 패키지 이름, c: Consumer 폴더). 런타임 그룹 id(`foDashboard` 등)·메뉴 id·경로와 앱 배치는 그대로이며 #1099가 정한다. 패키지 이름은 `@ap/menu-dashboard`·`-voc`·`-findings`·`-tasks`·`-integration`·`-surveys`·`-feature-admin`처럼 폴더 기준 역할 이름이다.

```text
SDK (contracts → ui/kernel → components → shell)
                  ▲
                  │ consume; SDK never imports consumers
       platform/<feature>/    menus/<system>/<group>/
                  ▲                   ▲
                  └── apps/platform-web ┘
```

규칙 8의 목표 경계는 접두어가 아닌 명시적인 기능 패키지 집합으로 판정한다. `@ap/*`로 이름을 바꿔도 SDK가 기능 서버·화면·공유·UI·다리를 import할 수 없으며 기존 다리의 정확한 공개 진입점 예외만 유지한다. 코어 서버의 새 포트는 `@ap/contract-schemas` 런타임 import를 허용하되 Kernel·셸·메뉴는 허용하지 않는다(ADR-0073 규칙 11 부분 대체). 패키지 이름·두 경계 lint·turbo 가드는 #1098 r에서 함께 전환했다. 정적·동적·import-type·require 검사는 같은 identity 집합을 소비하며 root 또는 slash 하위 경로만 일치한다. `@ap/feature-bridge`는 별도 소비자 어댑터로 기존 정확한 슬롯 예외만 유지한다.

### 의존 방향

`@ap/ui`가 primitive를 소유하며 플랫폼 패키지와 앱은 그 공개 export를 사용한다. `@ap/feature-ui`는 `@ap/ui`에 의존하고 호환 re-export를 제공하지 않는다(ADR-0046).

```text
                 contracts
        ┌──────────┼──────────────┐
        ▼          ▼              ▼
       ui        kernel        mock-server
        │   ┌──────┤              │
        ▼   ▼      │              │
     components    │              │
        │          │              │
        ▼          ▼              │
      shell     menu-*  ◀─ src/mock ┘
        │          │  ▲
        │          │  └─ fo-bridge ─▶ @ap/feature-screens/global-screens(/core)
        └────┬─────┘
             ▼
     apps/platform-web
```

규칙:

1. 화살표 반대 방향 import 금지. 특히 `kernel`·`components`·`shell`은 `menu-*`와 `mock-server`를 import하지 않는다.
2. `menu-*`끼리 import 금지. `fo-bridge`는 다리 메뉴와 앱만 import하고 메뉴를 import하지 않는다. 교차 메뉴 이동은 `linkTo(menuId, ...)`만 쓴다(06 §22).
3. `menu-*`에서 `mock-server` import는 그 메뉴의 `src/mock/**`에서만 허용한다.
4. 각 패키지는 `package.json` `exports`로 공개 진입점만 연다. `@ap/components/src/...` 같은 깊은 경로 import 금지. 호스트 전용 진입점 `@ap/components/dock`은 셸·앱 프리셋만 import할 수 있고(메뉴·모듈 프리셋은 lint가 막는다), `dockview`·`dockview-react`·`dockview-core`는 `@ap/components` 밖에서 import할 수 없다(`tooling/eslint`, ADR-0067).
5. `contracts`는 React·브라우저 API에 타입 수준으로도 의존하지 않는다(향후 백엔드와 공유할 수 있게). 아이콘·화면 컴포넌트처럼 React 타입이 필요한 manifest 필드는 `kernel`의 `MenuEntry`가 소유한다.
6. 규칙 1–3은 테스트 파일에도 적용한다. 층을 넘는 검증은 그 위층(메뉴 또는 앱)의 통합 테스트로 둔다.
7. **모듈 패키지**(다른 저장소에서 플랫폼에 올라오는 화면 묶음, [ADR-0053](../adr/0053-host-module-contract-v1.md))는 `@ap/contracts`와 `@ap/ui`(+ `@ap/ui` CSS 하위 경로·`@ap/ui/theme`·`@ap/ui/theme-tokens.json`)만 import한다. `@ap/kernel`·`@ap/shell`·`@ap/components`·`menu-*`·`mock-server`는 import하지 않는다. `tooling/eslint`의 `hostModule` 프리셋이 강제하며, 이 저장소의 실제 패키지에는 적용하지 않고, 고정 모듈 fixture(`packages/sdk/shell/src/__fixtures__/module-fixture/`, 패키지가 아닌 디렉터리 — `hostModuleDir`가 그 디렉터리를 경계로 강제하고 `tooling/eslint` 회귀 테스트가 고정)에만 쓴다. 고정 fixture는 앱에 마운트하지 않는다. 외부 모듈은 앱의 `src/modules.ts`에서 `mountModule`로 마운트하고 `menus.ts`가 레지스트리 호출에서만 합친다 — 첫 외부 모듈은 EV의 `eqv`(릴리스 tarball `@eqv/*`를 URL로 설치, ADR-0053 소비자, 설치 절차는 EV ADR-0014·`INTEGRATION.md`가 소유, #801). 모듈은 자기 패키지 루트 안의 상대 import만 쓴다(패키지 이름 접두사와 무관). 열린 어휘(`<moduleId>:` 권한·그룹)와 등록 `mountModule`은 Kernel이 소유한다. 모듈 id는 플랫폼 권한 네임스페이스(`KERNEL_PERMISSIONS`와 앱이 선언한 메뉴 권한의 `:` 앞)를 쓸 수 없고, 화면 id는 메뉴 id `<moduleId>:<screenId>`로 등록된다.
8. 어떤 플랫폼 패키지도 명시적 기능 패키지 집합(`tooling/eslint/src/feature-packages.js`의 다섯 identity)을 import하지 않는다(ADR-0046, #441 — 디자인 시스템은 `@ap/ui`로 옮겨 왔고 `@ap/feature-ui`가 `@ap/ui`에 의존한다). primitive는 모든 플랫폼 코드에서 `@ap/ui`를 통해 쓴다(ADR-0011). **예외는 다리 하나다**(ADR-0071, ADR-0081): `@ap/feature-bridge`는 `@ap/feature-screens/global-screens/core`만 import하고(프리셋 `featureBridgePreset`, 슬롯이 lazy로 여는 `src/pages/`만 `global-screens`도), 다리 메뉴(`@ap/menu-my-activity`와 위 기능 메뉴)는 정확한 기능 진입(`global-screens`·`global-screens/core`, 이후 `operator-screens/<entry>`)과 `@ap/feature-bridge` root를 import한다(프리셋 `featureBridgeMenuPreset`; 테스트 전용 `@ap/feature-bridge/testing`은 다리 메뉴의 테스트·`test-support` 파일만, `@ap/kernel/testing`은 `featureBridgePreset` 프리셋에서 `src/testing.tsx` 한 파일만 더 import한다). 다른 기능 패키지 경로와 다른 메뉴·층은 그대로 막힌다. 영구 로드 코드(루트·슬롯)가 화면 배럴을 들이지 않는 것과 진입점의 import 그래프(라우터·로그인 셸·`@/lib/api` 배럴 없음, 네트워크 호출은 `client.ts` 하나)는 `packages/adapters/feature-bridge/src/feature-entry-graph.test.ts`가 고정한다.
9. **실어댑터** `http-adapter`는 `contracts`만 import한다(React 없음). 이를 import할 수 있는 곳은 앱의 운영 조립 `apps/platform-web/src/real/**`(와 그 테스트)뿐이고, `main.tsx`·`src/dev/**`·그 밖의 앱 파일·다른 패키지·메뉴는 `tooling/eslint`가 막는다(#154). 플랫폼 밖 예외는 플랫폼 API 테스트 코드 하나다([ADR-0073](../adr/0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md), #674) — 기능 런타임 코드는 `ops/platform-api/scripts/check-boundaries.mjs` 규칙 11이 막는다.
10. **`contract-schemas`**는 런타임에 `zod`만 쓴다(`@ap/*`·React import는 `tooling/eslint`의 `contractSchemas` 프리셋이 막고, `zod` 밖의 외부 의존은 manifest와 리뷰가 지킨다). 테스트 파일만 `@ap/contracts`(와 `vocab.json`)를 읽어 손으로 쓴 타입과 비교한다. 코어 서버 `@ap/platform-api`는 새 포트 와이어 검증에 직접 import할 수 있다(ADR-0097). SDK 배포 대상은 늘리지 않는다.

## 4. Kernel 포트: `PlatformAdapter`

포트 타입과 입출력 DTO는 `@ap/contracts`에 둔다. `mock-server`(허용 의존: `contracts`뿐)가 이를 구현하고, Kernel은 소비만 한다. 포트가 Kernel에 있으면 구현체가 Kernel을 import해야 해 §3 규칙과 충돌한다. 포트는 함수 시그니처뿐이라 React·DOM 의존이 없다. 멤버 목록의 원본은 `packages/sdk/contracts/src/adapter/adapter.ts`, 메서드별 규칙은 [실서버 연결 체크리스트](real-server-checklist.md) §2, HTTP 매핑은 [전송 형식 초안](http-adapter-contract.md) §1이다. 필드명은 Candidate다.

- **포트에 두는 것과 메뉴 엔드포인트로 두는 것(2026-10-01, 메뉴 조회 포트 #100):** 포트 메서드는 ① Kernel·셸이 직접 부르고 메뉴 어휘가 없거나(세션·Scope·Context 선택지·활용률·오류 보고·주석) ② 권한·감사처럼 Kernel 책임 저장소를 읽는 것(`accessDirectory`·`auditTrail`·`entityAudit`)만이다. 메뉴의 데이터 조회는 메서드를 늘리지 않고 범용 `menuQuery` 하나로 보낸다 — 메뉴가 `src/endpoints.ts`에 선언하고 서버는 요청이 아니라 자기 선언 사본으로 판정한다(06 §5 "조회 엔드포인트"). 이 기준으로 VOC 두 메서드(`myVocHistory`·`mySurveyHistory`)는 #131에서 포트에서 빠져 `@ap/menu-notice-voc` 엔드포인트가 됐다. 결정 기록은 [ADR-0019](../adr/0019-menu-query-endpoint-declaration.md). 실서버가 지킬 것과 적합성 묶음 실행 방법은 [실서버 연결 체크리스트](real-server-checklist.md).
- **쓰기는 동작 선언 + 범용 `menuAction` 하나(2026-10-20, [ADR-0054](../adr/0054-write-port-declared-actions-idempotency-version.md), #501):** 메뉴의 서버 쓰기도 포트 메서드를 늘리지 않는다. 메뉴가 `ActionSpec`을 선언하고(`packages/sdk/contracts/src/adapter/action.ts`) 서버는 자기 선언 사본으로 판정한다. 판정 순서·등록 검증·적합성은 [실서버 연결 체크리스트](real-server-checklist.md) §3·§4. 주석 저장·삭제는 이번에 옮기지 않았다(ADR-0054 결과).
- **엔드포인트 선언의 한도(`limits`, #175):** `maxHours`(적용 기간 상한)와 `maxRows`(결과 전체 행 상한). 기준·판정 순서·등록 검증은 [실서버 연결 체크리스트](real-server-checklist.md) §3, 적합성 검사는 §4.
- **세션형 데이터는 동기 스냅샷 + `subscribe`:** 셸이 로딩 공백 없이 그려지도록 `session()`·`publishedMetrics()`는 동기로 둔다. 실서버 어댑터는 Provider를 마운트하기 전에 세션을 받아 둔다(부트스트랩). 요청마다 달라지는 검증(`validateScope`, `evaluateSelection`)만 비동기다.

- **사용자 설정·사람 조회·공지 포트(2026-10-28, [ADR-0098](../adr/0098-adapter-preferences-people-notices-ports.md), #1103):** `readPreferences`·`patchPreferences`·`importPreferences`(세션 사용자의 서버 설정, 키 패치·1회 원자 가져오기), `lookupPeople`(정확한 id → `GroupMember[]`), `listNotices`·`saveNotice`·`deleteNotice`(플랫폼 공지 관리 — ADR-0066의 공통 어댑터 책임이라 위 "메뉴 어휘 없음" 기준의 명시된 예외, Home 배너는 `home.notices` 메뉴 조회로 남는다)가 필수 어댑터 멤버다. 입출력 DTO는 `@ap/contracts`(`service-ports.ts`)의 손으로 쓴 타입이고 런타임 스키마·JSON Schema 산출물은 `@ap/contract-schemas`가 가진다(서버가 직접 import, [ADR-0097](../adr/0097-platform-features-and-role-based-names.md)). `defaultRangeTo()`는 `string | null`이다(기준점 없음). mock·HTTP 어댑터·적합성이 구현하고 서버 모듈은 #1104–#1106이 만든다.
- 역할 전환과 응답 시나리오 시뮬레이터(`setRole`, `setScenario`)는 **실서버에 없는 개발 기능**이다. `Platform` 컨텍스트에서 빼고 `apps/platform-web`의 dev 도구가 레일 아래 `topBarTools` 슬롯에 붙인다. 운영 빌드에는 포함하지 않는다 — mock 조립(`src/dev/mock-assembly.tsx`)이 `topBarTools`로 넘기고, 운영 빌드는 그 조립을 쓰지 않으며 빌드 단계 그래프 검사가 막는다(#153, ADR-0009).
- **무효화 계약 보존:** 현재 `usePlatformQuery`는 결과 identity에 `role`·`scenario`를 넣어, 전환 즉시 이전 결과를 숨기고 재조회한다. 분리 후에는 dev 도구가 mock 어댑터의 상태를 바꾸고 어댑터가 `subscribe` 리스너를 호출한다. Kernel은 알림을 받으면 ① `session()`을 다시 읽고 ② 세션 객체가 바뀌었으면 현재 Scope를 재검증하고 ③ revision을 올린다(시나리오처럼 세션이 그대로인 변경은 ③만). `usePlatformQuery`의 identity는 `[revision, user 식별자, 전역 Context, page 입력]`이 되어 지금과 같은 시점에 이전 결과를 숨긴다. 실서버에서는 재로그인·권한 변경 알림이 같은 경로를 탄다. 검증: 역할·시나리오 전환 직후 이전 결과가 한 프레임도 보이지 않을 것(`kernel/adapter.test.tsx`).
- listAxisOptions·searchEquipment·resolveSelection은 필수 어댑터 멤버다. 외부 어댑터도 구현해야 한다. 의미·오류·페이징·Kernel 훅/화면 캐시 원본은 [06 §6.4](../contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate)다. contextOptions·evaluateSelection은 deprecated 호환 포트로 남는다.
- `matchesCondition` 같은 조건 판정은 서버 책임이다. 셸은 조건·방·Selection이 바뀔 때 `evaluateSelection`을 다시 호출하고 결과(후보, 조건 결과 개수, 조건 밖 선택)만 표시한다. 이전 요청 결과를 새 결과로 보이지 않는 요청 수명주기는 `usePlatformQuery`와 같은 규칙을 따른다.

## 5. 메뉴 패키지 계약과 템플릿

메뉴 패키지 하나의 모양(생성기 `pnpm gen:menu <group>`이 만드는 것; 플랫폼 기능은 `menus/<space>/<group>/` 대신 `platform/<group>/`이고 안은 같다):

```text
menus/<space>/<group>/
  package.json          # name: @ap/menu-<group>, exports: "." (+ 클래스를 쓰면 "./styles.css")
  tsconfig.json         # @ap/tsconfig/base.json extends
  eslint.config.js      # @ap/eslint-config menu 프리셋 한 줄
  vitest.config.ts      # node 환경
  .gen-menu.json        # 생성기 입력값 — --remove가 이 값으로 파일을 재렌더링해 대조한다
  src/
    index.ts            # export const manifests: MenuEntry[] (manifest만, 화면·데이터 재export 금지 — lazy 유지)
    styles.css          # Tailwind 클래스를 쓰는 패키지만: @source "./"; 앱 src/style.css가 import
    endpoints.ts        # 조회 선언(defineEndpoint: 권한·적용 Context·kind·한도) + 클라이언트 타입·표시 상수. 화면과 서버가 함께 쓰는 순수 코덱도 여기
    mock/index.ts       # 서버 쪽 핸들러(defineMockEndpoint) — package.json "./mock", 앱 mock 조립 src/dev/mock-assembly.tsx만 import(운영 빌드 제외, #153). 실서버로 갈 때 HTTP 쪽이 이 자리를 맡는다
    mock/index.test.ts  # 인라인 MenuMeta로 createMockAdapter 등록 규칙과 menuQuery 스모크
    pages/<Page>.tsx    # PlatformPage 위에 archetype 하나, 조회는 useMenuQuery/useMenuFetch만
    manifest.test.ts    # createRegistry fixture 검증 1개 + 엔드포인트 소유(id 접두사·menuId) 검사
    components/         # 이후 Domain Component(06 §13)가 가는 곳 — 생성기 출력이 아니다
```

생성기는 한 번에 스켈레톤 하나를 만든다 — manifest 1개, archetype은 manifest의 `pageType`(다섯 중 선택), `endpoints.ts`·`mock/`(표본 엔드포인트 1개)·테스트 — 그리고 앱의 마커 영역에 연결 다섯 줄(`menus.ts` import·spread, `style.css` `@import`, `src/dev/mock-assembly.tsx`의 `/mock` import·`MOCK_ENDPOINTS` spread, #153)과 앱 `package.json` 의존 1줄을 추가한다(#126). 앱의 `GROUPS`는 편집하지 않는다(사람이 먼저 행을 추가한다. 그룹 id 목록은 앱의 선언이고 `@ap/contracts`는 고치지 않는다, ADR-0072).

`manifests`의 각 항목은 `kernel`의 `MenuEntry`(= `contracts`의 `MenuMeta` + `icon` + `component`, 06 §5 선언)이고, 화면은 `component: lazy(() => import('./pages/X'))`로 지연 로드한다. 앱은 다음처럼 조립한다.

```ts
// apps/platform-web
const registry = createRegistry({ spaces: SPACES, groups: GROUPS, menus: [...home.manifests, ...equipment.manifests, ...], platformHomeMenuId: 'home' });
```

`createRegistry`가 검증할 것(현재 코드는 일부를 런타임에만 암묵적으로 가정):

- 메뉴 `id` 중복 없음, `parent`가 존재하는 메뉴를 가리킴
- **route 충돌 없음:** 다른 메뉴의 정규 경로를 가로채는 패턴은 거부하며, 허용되는 별칭 중첩은 정적 세그먼트 우선으로 맞춘다. 상세 계약은 [06 §6.4](../contract/kernel.md#64-url-계약-decided-필드명enum-문자열은-candidate).
- 그룹마다 `primary` 정확히 하나(06 §5)
- `pageKeys`가 전역 Context 키와 겹치지 않음(06 §6.1)
- **공간:** 검증 규칙은 [06 §9.1](../contract/kernel.md#91-업무-시스템-decided-2026-09-26)과 [`packages/sdk/kernel/src/registry/registry.ts`](../../packages/sdk/kernel/src/registry/registry.ts)가 소유한다. 전역 유틸리티 그룹은 `space: null`이고, 그 외에는 등록된 공간만 허용한다.

생성기는 manifest 뼈대, `pageType`별 06 §12 슬롯 뼈대(화면 슬롯은 12.6), 조회 선언·mock 핸들러, 테스트를 만들고 앱 등록 목록에 연결한다. 메뉴 템플릿이 Sidebar·Breadcrumb·권한 숨김을 직접 구현하지 못하게 하는 것은 06 §5 "금지" 목록을 lint로 옮겨 막는다(§6).

## 6. 경계 강제와 도구

| 항목 | 제안 | 비고 |
| --- | --- | --- |
| 패키지 관리 | pnpm workspace + Turborepo | 버전의 원본은 루트 `packageManager`·`turbo.json` |
| 내부 패키지 빌드 | 빌드 없이 TS 소스를 `exports`로 노출, 앱의 Vite가 번들 | 패키지별 `tsc --noEmit`으로 타입 경계 검사 |
| 경계 검사 | ESLint `no-restricted-imports` + 계약 규칙 — `tooling/eslint`(`@ap/eslint-config`)의 레이어별 프리셋을 각 패키지 `eslint.config.js`가 한 줄로 가져다 쓴다 | §3 규칙 1–4를 패키지별 설정으로. 규칙·프리셋 원본은 `tooling/eslint/src/` |
| 계약 lint | URL 직접 조립 금지(`?`/`&` 문자열 조합 대신 `linkTo`/`buildQuery`), `window.location` 직접 쓰기 금지, 메뉴 코드에서 `localStorage` 금지 | 인터뷰 기록의 "URL 직접 조립 금지 lint" |
| 테스트 | Vitest를 패키지별로. 층을 넘는 테스트는 위층(메뉴 또는 앱)의 통합 테스트로 둔다(§3 규칙 6) | `pnpm --filter <패키지> test`로 좁혀 돌린다 |
| CI | `.github/workflows/ci.yml`이 루트 lint/typecheck/build와 test를 병렬 Job으로 실행하고 기능 static 추가 게이트·격리 통합을 필수 workspace 상태에 합친다. 네 root graph는 각 manifest의 작업과 `@ap/ui#typecheck`를 포함해야 한다(`check-platform-turbo-scope.mjs`, `--self-test`). ops `feature:*`는 정확한 네 leaf 필터로만 집계하고 root 작업명으로 turbo를 다시 실행하지 않는다. mock build → lazy 검사 → SDK API/pack/consumer 검사 → 운영 graph/강제 mock 실패 guard → DB-free `build:real-prod` 성공 검사 순서다. 변경 파일 Biome(docs·ops 범위)·경계는 비캐시 ops lint leaf가, platform-api·feature-shared·feature-ui·feature-screens는 패키지 ESLint leaf가 수행한다. PR base SHA/push before SHA와 전체 이력을 제공하고 기준이 없으면 실패한다. 정적 추가 검사는 boundary fixture·integration runner guard·migration drift·FE typecheck이며 backend 통합/conformance는 폐기 가능한 Postgres16+pgvector에서 실행한다. docs-only 생략, classifier fail-safe, full=true cold/all, main push만 cache 저장, E2E selector와 필수 check 이름은 유지한다. | 자세한 명령과 중간 Biome/ESLint 경계는 [repository-layout](repository-layout.md#설치와-검증). ESLint 전환 #1102는 a(platform-api·feature-shared·feature-ui)와 b(feature-screens) 모두 완료 |

**lint 도구 — ESLint (Decided, §8 #4):** 경계 규칙과 URL 조립 금지 같은 커스텀 AST 규칙이 필요해 ESLint를 택했다(Biome 플러그인 GritQL은 이런 규칙에 제한적). `tooling/eslint`(`@ap/eslint-config`)의 층별 preset으로 구현했다. 문법 기반이라 변수에 담아 조립한 URL, computed 속성(`window['localStorage']`), optional chaining 호출 같은 우회는 잡지 않는다 — 규칙이 허용한다는 뜻이 아니다.

**기능 패키지 lint (#1102 a·b):** `@ap/platform-api`·`@ap/feature-shared`·`@ap/feature-ui`·`@ap/feature-screens`는 패키지 `lint`(`eslint . --max-warnings 0`)가 전체 소스(테스트·설정 포함, `dist`·`coverage` 같은 산출물 제외)를 검사한다. 루트 `pnpm lint`가 turbo로 이 leaf를 돈다. 프리셋은 `tooling/eslint/src/feature.js`의 `featureServerPreset`·`featureSharedPreset`·`featureUiPreset`와 screens용 `featureScreensPreset`(`featureUiPreset`와 같은 정확성·React·Hooks·접근성 규칙에 옛 Oxlint 패스가 검사하던 `no-restyle`·`require-static-classes`를 더하고 `@ap/feature-ui` import도 컴포넌트로 읽는다. 컴포넌트를 정의하는 `featureUiPreset` 패키지만 이 둘을 끈다. 기능 전용, SDK·앱·메뉴·다리 프리셋은 읽지 않는다)이고 각 패키지 루트 `eslint.config.js`가 한 줄로 가져온다. SDK/브라우저 import 허용 목록은 적용하지 않으며 서버·공유 경계는 기존 AST 검사(`ops/platform-api/scripts/check-boundaries.mjs`)가 계속 원본이다. 그 검사는 정확한 패키지 루트 `eslint.config.js`(네 패키지)만 devDependency `@ap/eslint-config`를 import하도록 허용한다(런타임 파일·중첩 파일·부분 경로·다른 `@ap/*`는 계속 금지). 남은 Biome 범위는 기능 문서 루트(`FEATURE_DOCS`)와 `ops/platform-api`(`FEATURE_BIOME_SCOPE`)뿐이고 Oxlint 디자인 패스는 없어졌다(`ops` `lint:design`·`.oxlintrc.json` 삭제, 규칙은 위 프리셋이 ESLint로 검사). `apps/feature-screens`의 `lint`는 `src`뿐 아니라 패키지 전체의 TS/TSX/JS 소스·테스트·설정 파일을 검사한다. `react`·`jsx-a11y` 플러그인의 ESLint 피어 범위는 9까지라 `@eslint/compat`의 `fixupPluginRules`로 감싸 ESLint 10에서 돌린다(`tooling/eslint/src/feature.test.ts`가 선택 규칙의 실행을 고정, 루트 피어 정책은 바꾸지 않음).

규칙 대응(옛 Biome 1.9.4 활성 규칙 → ESLint). 동일 의미를 실측한 항목만 같은 이름으로 적고, 엔진 차이는 아래에 따로 적는다. 완전 동치를 주장하지 않는다.

| 옛 규칙(Biome) | 새 규칙 | 비고 |
| --- | --- | --- |
| `noUnusedVariables`·`noUnusedImports` | `@typescript-eslint/no-unused-vars` | Biome 1.9.4 실측에 맞춰 변수·함수 인자·catch 오류·배열 구조분해를 모두 보고하고 `_` 접두사와 rest 형제만 제외 |
| `useImportType` | `@typescript-eslint/consistent-type-imports` | 인라인 `import()` 타입 주석 허용. React JSX는 `react/jsx-uses-react`로 사용 처리해 `import React` 관례 유지 |
| `noNonNullAssertion`·`noExtraNonNullAssertion` | `@typescript-eslint/no-non-null-assertion`·`no-extra-non-null-assertion`(recommended) | |
| `noDoubleEquals` | `eqeqeq` (`null: 'ignore'`) | `== null` 허용(옛 규칙과 같음) |
| `noExplicitAny`·`noBannedTypes`·`noEmptyInterface`·`useAsConstAssertion`·`noUselessThisAlias`·`noMisleadingInstantiator`·`noUnsafeDeclarationMerging` | typescript-eslint recommended의 `no-explicit-any`·`no-unsafe-function-type`·`no-wrapper-object-types`·`no-empty-object-type`·`prefer-as-const`·`no-this-alias`·`no-misused-new`·`no-unsafe-declaration-merging` | |
| `noControlCharactersInRegex` 외 JS 정확성 규칙(`noConstAssign`·`noUnreachable`·`useIsNan`·`noDuplicateCase`·`noFallthroughSwitchClause`·`noSparseArray`·`noUnsafeFinally`·`useYield` 등) | `@eslint/js` recommended의 같은 이름 규칙 | |
| `noInnerDeclarations`·`noConstructorReturn`·`noLabelVar`·`noConfusingLabels`·`noSelfCompare`·`useDefaultSwitchClauseLast`·`noUselessRename`·`noUselessLabel`·`noUselessTernary`·`noUselessLoneBlockStatements`·`useExponentiationOperator`·`noCommaOperator`·`noArguments`·`noVar`·`useConst`·`noGlobalEval` | `no-inner-declarations`·`no-constructor-return`·`no-label-var`·`no-labels`·`no-self-compare`·`default-case-last`·`no-useless-rename`·`no-extra-label`·`no-unneeded-ternary`·`no-lone-blocks`·`prefer-exponentiation-operator`·`no-sequences`·`prefer-rest-params`·`no-var`·`prefer-const`·`no-eval` | |
| `noParameterAssign` | `no-param-reassign` | |
| `noThenProperty`·`noStaticOnlyClass`·`noUselessSwitchCase`·`useNumberNamespace`·`useNodejsImportProtocol`(필요한 부분) | `unicorn/no-thenable`·`no-static-only-class`·`no-useless-switch-case`·`prefer-number-properties`·`prefer-node-protocol` | unicorn은 이 규칙들과 아래 `noMisrefactoredShorthandAssign` 한 개만 켠다(전체 recommended 아님) |
| `noMisrefactoredShorthandAssign` | `unicorn/no-misrefactored-assignment` | `count += count + 1`처럼 복합 대입의 우변이 대상을 다시 쓰는 리팩터링 실수. 정확성 규칙이라 스타일 항목이 아니다. 현재 소스 진단 0, 양·음 `feature.test.ts` 고정 |
| `noForEach` | `no-restricted-syntax` 선택자 | Biome는 매개변수 1개 이하인 인라인 콜백만 보고(함수 참조·인덱스 콜백은 통과)해서 같은 모양으로 맞춤. `unicorn/no-for-each`는 더 넓어 쓰지 않음 |
| `useFlatMap` | `no-restricted-syntax` 선택자(`.map(…).flat()`) | `unicorn/prefer-array-flat-map`은 더 넓어(filter+flatMap 합치기) 쓰지 않음 |
| `noDelete` | `no-restricted-syntax` 선택자 | 계산된 비리터럴 키(`delete o[k]`)는 Biome도 통과. 의도적 차이: `delete process.env.X`는 허용(undefined 대입은 문자열 "undefined"를 저장) |
| `noFocusedTests` | `no-restricted-syntax` 선택자 | `describe`·`it`·`test`·`suite`의 `.only`, `.only.each(...)`(표 기반), `.concurrent.only`, `['only']`. `describe.skip`·`it.each`·`only`라는 이름의 다른 속성은 통과(`feature.test.ts` 양·음 고정) |
| `noAccumulatingSpread` | `no-restricted-syntax` 선택자(근사) | reduce 콜백이 돌려주는 객체·배열 리터럴 안의 전개 요소를 보고. 전개 대상이 누산기인지는 선택자로 비교할 수 없어 누산기가 아닌 전개도 보고한다(현재 소스 진단 0) |
| `noConfusingVoidType` | `@typescript-eslint/no-invalid-void-type` | 반환 타입·제네릭 인자의 `void`만 허용 |
| `noConstEnum`·`useIsArray` | `no-restricted-syntax` 선택자 | `const enum`, `x instanceof Array` |
| `noUnreachable` | `no-unreachable` | typescript-eslint recommended가 끄지만 `tsc`는 `allowUnreachableCode:false`일 때만 오류라(미설정, 실측: 오류 없음) 켜 둠 |
| `noConsoleLog`(warn) | `no-console`(`log` 외 허용) | 린트 스크립트가 `--max-warnings 0`이라 경고도 실패 |
| `useExhaustiveDependencies`·`useJsxKeyInIterable` | `react-hooks/exhaustive-deps`·`rules-of-hooks`, `react/jsx-key` | Hooks는 기존 `REACT_HOOKS` 블록 |
| `noArrayIndexKey`·`noChildrenProp`·`noVoidElementsWithChildren`·`noRenderReturnValue`·`noCommentText`·`noDuplicateJsxProps`·`noUselessFragments`·`useSelfClosingElements`·`useButtonType` | `react/no-array-index-key`·`no-children-prop`·`void-dom-elements-no-children`·`no-render-return-value`·`jsx-no-comment-textnodes`·`jsx-no-duplicate-props`·`jsx-no-useless-fragment`·`self-closing-comp`·`button-has-type` | UI만 |
| `noDangerouslySetInnerHtml`·`noDangerouslySetInnerHtmlWithChildren`·`noBlankTarget` | `react/no-danger`·`no-danger-with-children`·`jsx-no-target-blank` | UI만 |
| a11y 그룹(`useAltText`·`noAutofocus`·`noPositiveTabindex`·`useKeyWithClickEvents`·`useAnchorContent` 등) | `eslint-plugin-jsx-a11y` recommended 전체 | UI만. 규칙 이름이 다른 항목은 그 플러그인 이름을 따른다 |
| `@shadcn/lint`(Oxlint) | 같은 6개 규칙을 ESLint로, 옵션은 옛 `.oxlintrc.json`과 같음(`rich-editor` 허용, 테스트·`__tests__` 제외). feature-ui는 컴포넌트 정의 패키지라 `no-restyle`·`require-static-classes`를 끄고, screens(`featureScreensPreset`)는 켠다 | `ap/no-color-var-shorthand`(옛 Oxlint에 없던 플랫폼 확장)는 feature-ui·screens에 켜지 않음. screens의 `no-arbitrary-values`는 옛 `transition-[width]` 허용을 두지 않는다(해당 사용 0건, 측정). 허용 목록에 플랫폼 접근성 하한 계약(`Input`·`SelectTrigger`·`Checkbox`·`DropdownMenu*Item`·`Button`)이 더 있다 |

엔진 정책 차이(의도적, 이유와 함께):

- screens(#1102 b)는 형식·import 정렬을 더 이상 검사하지 않는다(Biome 변경 파일 게이트에서 빠짐). 옛 게이트는 TS/TSX/JS/JSX/MJS/CJS/JSON/JSONC만 대상이었고 CSS는 대상이 아니었다. ESLint는 TS/TSX/JS/MJS 소스만 보므로 screens의 JSON 설정 파일(`components.json`·`package.json`·`tsconfig.json`)은 이제 아무 린터·포매터도 보지 않고, `src/styles.css`는 전과 같이 보지 않는다. CSS/JSON 동치를 새로 만들지 않았다(미구현, 필요하면 별도 결정).
- `@typescript-eslint/no-invalid-void-type`은 호출식의 타입 인자(`useMutation<R, E, void>(...)`, `deferred<void>()`, `apiClient<void>(...)`)의 `void`도 보고한다. 옛 Biome 규칙은 보고하지 않았다. screens의 8곳은 기존 호출·반환 타입을 보존하도록 줄별 이유 주석으로 남겼다(`useMutation`의 `void` variables는 인자 없는 `mutate()`를 허용). `allowInGenericTypeArguments` 기본값은 이미 `true`지만 호출식은 별도로 거부하므로 이 옵션으로 해결되지 않는다.
- 형식·import 정렬(`format`·`organizeImports`)과 순수 스타일 간소화는 ESLint 쪽에 대응하지 않는다. 이 패키지에는 새 포매터 게이트가 없다. 정확성과 무관한 문체 규칙이며 새 규칙 시스템을 만들지 않기로 했다(아래 「나머지 옛 규칙」 표의 `스타일` 항목).

### 나머지 옛 규칙의 행방 (활성 비-nursery 189개 전부)

위 표와 합쳐 `.review` 목록의 189개 활성 규칙(Biome 1.9.4 `recommended` + `noNonNullAssertion`·`useImportType`·`noConsoleLog`·`noUnusedImports`·`noUnusedVariables`)이 모두 아래 중 하나에 있다. 컴파일러 열은 `ops/platform-api/tsconfig.base.json`(`strict`, `noFallthroughCasesInSwitch`, `isolatedModules`, `verbatimModuleSyntax`; platform-api만 `verbatimModuleSyntax:false`)로 실제 `tsc`에서 확인한 오류 코드이고, `미실측`은 오류 코드를 직접 돌리지 않은 항목이다.

| 분류 | 옛 규칙 | 근거 |
| --- | --- | --- |
| 컴파일러(실측, 프로그램 안 파일) | `noConstAssign`(TS2588)·`noClassAssign`(TS2629)·`noFunctionAssign`(TS2630)·`noImportAssign`(TS2540)·`noGlobalObjectCalls`(TS2349)·`noInvalidBuiltinInstantiation`(TS7009)·`noInvalidUseBeforeDeclaration`(TS2448)·`noSetterReturn`(TS2408)·`useGetterReturn`(TS2378)·`noDuplicateClassMembers`(TS2393)·`noDuplicateParameters`(TS2300)·`noDuplicateObjectKeys`(TS1117)·`noRedeclare`(TS2451, 함수 TS2393)·`noInvalidConstructorSuper`(TS2335)·`noUnreachableSuper`(TS2377)·`noWith`(TS1101)·`noEmptyTypeParameters`(TS1099)·`useExportType`(TS1205)·`noUnsafeNegation`(`!a in b`가 TS2322)·`noFallthroughSwitchClause`(`noFallthroughCasesInSwitch`; ESLint `no-fallthrough`도 켬)·`noImplicitAnyLet`의 위험한 경우(TS7034/TS7005) | `tsc`가 보고하는 것은 `tsc` 프로그램 안의 파일뿐이다. 프로그램은 `apps/platform-api`의 `src`(+`tsconfig.platform-tests.json`이 `src/types`와 제외된 `platform-conformance.integration.test.ts`를 `typecheck`에서 따로 검사), `feature-shared`·`feature-ui`의 `src`다. 프로그램 밖(`feature-ui/__tests__`·`vitest.setup.ts`, `*.config.ts`, `scripts/*.mjs`, `eslint.config.js`)은 `tsc`가 보지 않는다. 그래서 typescript-eslint 호환 설정이 끄는 규칙 중 TS에서 오탐이 없는 것(`no-dupe-keys`·`no-class-assign`·`no-func-assign`·`no-const-assign`·`no-import-assign`·`no-unsafe-negation`·`no-dupe-args`·`no-obj-calls`·`no-setter-return`·`constructor-super`·`no-this-before-super`·`no-new-native-nonconstructor`, 중복 멤버·재선언은 오버로드·선언 병합을 아는 `@typescript-eslint/no-dupe-class-members`·`no-redeclare`)은 모든 TS 파일에 ESLint로 다시 켠다. 다시 켜지 않은 것: `no-undef`(타입 이름 오탐, TS는 TS2304가 보고), `getter-return`(추상·인터페이스 접근자), `no-with`(strict 모드 구문 오류). 순수 JS 파일(설정 파일·`bundle-schema.mjs`)은 컴파일러가 전혀 없어 `no-undef`를 켜고 Node 전역을 선언한다(`feature.test.ts`가 프로그램 밖 경로로 양·음을 고정). 위 예외 `noUnreachable`은 컴파일러가 보고하지 않아 ESLint로 켠다 |
| 컴파일러(미실측) | `noVoidTypeReturn`(`: void` 함수가 값을 반환) | TS2322로 알려져 있으나 직접 돌리지 않음 |
| `@eslint/js`·typescript-eslint recommended 직접 | `noExtraBooleanCast`(`no-extra-boolean-cast`)·`noMultipleSpacesInRegularExpressionLiterals`(`no-regex-spaces`)·`noUselessCatch`(`no-useless-catch`)·`noEmptyCharacterClassInRegex`(`no-empty-character-class`)·`noEmptyPattern`·`noSelfAssign`·`noUnusedLabels`·`noUnsafeOptionalChaining`·`noUnsafeFinally`·`noSwitchDeclarations`(`no-case-declarations`)·`noPrecisionLoss`(`no-loss-of-precision`)·`noNonoctalDecimalEscape`·`useValidForDirection`(`for-direction`)·`useYield`(`require-yield`)·`noConstantCondition`·`noEmptyBlock`(`no-empty`·`no-empty-static-block`)·`noDebugger`·`noCompareNegZero`·`noAsyncPromiseExecutor`·`noCatchAssign`(`no-ex-assign`)·`noGlobalAssign`·`noShadowRestrictedNames`·`noPrototypeBuiltins`·`noMisleadingCharacterClass`·`noUselessTypeConstraint`(`no-unnecessary-type-constraint`)·`useNamespaceKeyword`(`prefer-namespace-keyword`)·`useValidTypeof`(`valid-typeof`)·`noConfusingLabels`(`no-labels`, 더 엄격)·`noGlobalIsFinite`·`noGlobalIsNan`(`unicorn/prefer-number-properties`)·`noArrayIndexKey` 등 | 실제 적용 규칙 목록은 `feature.test.ts`가 아닌 `calculateConfigForFile` 결과 기준 |
| React/a11y 직접(UI만) | `noAccessKey`·`noAriaUnsupportedElements`·`noAutofocus`·`noDistractingElements`·`noHeaderScope`(`scope`)·`noInteractiveElementToNoninteractiveRole`·`noLabelWithoutControl`(`label-has-associated-control`)·`noNoninteractiveElementToInteractiveRole`·`noNoninteractiveTabindex`·`noPositiveTabindex`·`noRedundantAlt`(`img-redundant-alt`)·`noRedundantRoles`·`useAltText`·`useAnchorContent`·`useAriaActivedescendantWithTabindex`·`useAriaPropsForRole`(`role-has-required-aria-props`)·`useFocusableInteractive`(`interactive-supports-focus`)·`useHeadingContent`·`useHtmlLang`·`useIframeTitle`·`useKeyWithClickEvents`·`useKeyWithMouseEvents`(`mouse-events-have-key-events`)·`useMediaCaption`·`useValidAnchor`·`useValidAriaProps`(`aria-props`)·`useValidAriaRole`(`aria-role`)·`useValidAriaValues`(`aria-proptypes`) + `noAriaHiddenOnFocusable`·`useValidLang` | 앞의 두 개를 뺀 나머지는 `jsx-a11y/` recommended, `noAriaHiddenOnFocusable`·`useValidLang`은 recommended에 없어 따로 켬(`no-aria-hidden-on-focusable`·`lang`). server·shared에는 JSX 규칙이 없다 |
| CSS 전용(대상 없음) | `noDuplicateAtImportRules`·`noDuplicateFontNames`·`noDuplicateSelectorsKeyframeBlock`·`noImportantInKeyframe`·`noInvalidDirectionInLinearGradient`·`noInvalidGridAreas`·`noInvalidPositionAtImportRule`·`noShorthandPropertyOverrides`·`noUnknownFunction`·`noUnknownMediaFeatureName`·`noUnknownProperty`·`noUnknownUnit`·`noUnmatchableAnbSelector`·`useGenericFontNames` | 세 패키지에 `.css` 파일이 없음(측정). 옛 Biome가 CSS를 실제로 돌렸는지는 확인하지 않음. screens의 `src/styles.css`는 옛 변경 파일 게이트의 확장자 필터에 없어 이전에도 검사되지 않았고 지금도 아니다 |
| 스타일(의도적 차이) | `useArrowFunction`·`useLiteralKeys`·`useOptionalChain`·`useRegexLiterals`·`useSimpleNumberKeys`·`noInferrableTypes`·`noUnusedTemplateLiteral`·`noUselessElse`·`useDefaultParameterLast`·`useEnumInitializers`·`useLiteralEnumMembers`·`useNumericLiterals`·`useShorthandFunctionType`·`useSingleVarDeclarator`·`useTemplate`·`useWhile`·`noUselessConstructor`·`noUselessEmptyExport`·`noFlatMapIdentity`·`noUnnecessaryContinue`·`noApproximativeNumericConstant`·`noRedundantUseStrict` | 정확성에 영향이 없는 문체·간소화. 대응하는 recommended 규칙이 없거나(typescript-eslint는 stylistic 프리셋) 새 권장 규칙 묶음을 켜야 해서 켜지 않음. 완전 동치를 주장하지 않는다 |
| 엔진 정책 차이(보호 약화, 이유 있음) | `noExportsInTest` | ESLint 선택자로 구현은 가능하나(`*.test.*` 파일의 `export`) 현재 소스에 이미 위반이 있다(screens의 테스트 헬퍼 포함): `apps/platform-api/src/modules/{voc,attachments}/__tests__/routes-no-frame.test.ts`, `__tests__/module-seams.test.ts`, `lib/__tests__/no-console-in-jobs.test.ts`가 export하고 다른 테스트(screens 포함)가 가져다 쓴다. 고치려면 테스트 헬퍼를 옮겨야 해 기계적 이전 범위를 넘고 screens(b)도 건드린다. 옛 게이트는 변경 파일만 검사해 이 위반이 드러난 적이 없다 |
| 엔진 정책 차이(보호 약화, 이유 있음) | `noImplicitAnyLet` | `strict`의 `noImplicitAny`가 타입을 결정할 수 없는 `let x;`를 오류로 막는다(TS7034, 실측). 흐름으로 타입이 정해지는 `let x;`는 컴파일되고 ESLint 선택자도 구현 가능하나 현재 4곳(`attachments/service.ts` 2, `voc/jobs/embed-voc.ts`, `test-support/voc-fixtures.ts`)이 위반이라 타입 주석 추가가 필요하다. 독립 정리로 분리 |
| 엔진 정책 차이(보호 약화, 이유 있음) | `noExcessiveNestedTestSuites`·`noDuplicateTestHooks`·`noThisInStatic`·`noStringCaseMismatch`·`noSuspiciousSemicolonInJsx`·`noSvgWithoutTitle`·`useSemanticElements`·`noAssignInExpressions`(`no-cond-assign`이 조건식만) | 지원되는 recommended 규칙이 없다(vitest 플러그인 등 새 의존성 또는 새 규칙 필요). 새 규칙 시스템을 만들지 않기로 했고 `eslint-plugin-vitest`는 의존성 목록 밖이다 |

위 표의 `미실측`·`근사`·`보호 약화` 표시는 완전 동치가 아니라는 뜻이다. 옛 Biome 진단이 이 패키지에서 전체 소스로 실행된 적이 없어(변경 파일 게이트) 「옛 대비 새 진단 수」 같은 동치 수치는 만들 수 없다.
- ESLint recommended가 더하지만 옛 대응이 없는 규칙(`preserve-caught-error`·`no-useless-assignment`·`@typescript-eslint/no-require-imports`·`ban-ts-comment`·`no-namespace`·`no-unused-expressions`·`triple-slash-reference`·`no-duplicate-enum-values`·`no-array-constructor`)은 끈다(`no-undef`는 TS에서만 끄고 순수 JS에서는 켠다). 숫자 구분자·`prefer-regexp-test` 같은 새 정책은 켜지 않았다. Nursery 규칙은 켜지 않는다.
- 옛 Biome는 변경 파일만 비교하는 게이트(allowlist)였고 이 패키지들의 전체 소스는 검사되지 않았다. ESLint는 전체 소스를 검사하므로 처음 켠 날 드러난 진단을 소스에서 고쳤다(허용 목록 증가 없음, 이 패키지의 allowlist 줄은 삭제). screens도 같다(#1102 b: 진단 161건을 소스에서 고치고 `apps/feature-screens` allowlist 줄 전부를 삭제).
- 이유가 적힌 예외는 `biome-ignore`·`oxlint-disable`에서 같은 이유의 `eslint-disable-next-line`로 옮겼다. `reportUnusedDisableDirectives: error`라 필요 없어진 주석은 실패한다(`useHorizontalOverflow`의 `useExhaustiveDependencies` 주석은 ESLint 규칙이 보고하지 않아 삭제). screens에서는 `useKeyWithClickEvents`·`noAutofocus`·`useFocusableInteractive`·`noDelete`·`noNonNullAssertion`의 이유를 ESLint 주석으로 옮기고, ESLint에 대응 규칙이 없는 `useSemanticElements`·`noNoninteractiveElementToInteractiveRole`·`useFocusableInteractive`(목록 상자)의 Biome 예외는 `biome-ignore` 접두사를 떼고 이유만 일반 주석으로 남겼다.

## 8. 결정 (Decided, 2026-09-26)

| # | 항목 | 결정 | 이유 |
| --- | --- | --- | --- |
| 1 | 패키지 구성·의존 방향 | §3 그대로 | 현재 폴더 구조와 거의 일치해 이동 비용이 적고, `contracts` 분리로 향후 백엔드와 계약 공유 가능 |
| 2 | 메뉴 패키지 단위 | **그룹 단위** (`menu-analytics`에 생산성 개요·사이클타임·실행 상세) | 같은 그룹 안 목록→상세 import가 자연스럽고, 사이드바 그룹(06 §9)·소유 단위와 일치. 커지면 그때 분할 |
| 3 | 프로토타입 처리 | `archive/platform-app` → `apps/platform-web`으로 **`git mv`** | 이력·리뷰 보고서 연결 유지, 코드 두 벌 방지 |
| 4 | lint 도구 | **ESLint** | 경계·URL 조립 금지 같은 커스텀 규칙이 목적. `platform-api`·`feature-shared`·`feature-ui`는 ESLint 전체 소스 lint(#1102 a 완료), `feature-screens`도 같은 방식으로 전환했다(#1102 b 완료). 루트 lint의 ops leaf는 경계와 문서·ops 범위의 변경 파일 Biome allowlist만 수행한다. 하나의 workspace다 |
| 5 | 이름 | 접두사 `@ap/`, 메뉴 폴더 `menus/<space>/<group>/`, 플랫폼 기능 폴더 `platform/<feature>/` | 업무 시스템 메뉴의 공간 소속은 폴더가 원본이며 선언과 일치하는지 검사([ADR-0031](../adr/0031-menu-folders-by-space.md)). 플랫폼 기능의 공간은 `GROUPS`만 정한다([ADR-0097](../adr/0097-platform-features-and-role-based-names.md)) |

**`@ap/`는 임시 접두사다.** 회사 시스템 이름이 정해지면 일괄 변경한다. 변경 비용을 낮게 유지하려고 다음을 지킨다.

- 접두사는 `package.json` 이름·의존성, import 문, lint 경계 설정과 생성기 설정의 상수 한 곳에만 쓴다. 생성기 상수는 `tooling/gen-menu/src/prefix.ts`에 있다.
- localStorage 키·이벤트 이름 등 런타임 문자열에 접두사를 넣지 않는다.
- 변경 절차: 문자열 일괄 치환 → `pnpm install`(lockfile 재생성) → typecheck·test·build.
