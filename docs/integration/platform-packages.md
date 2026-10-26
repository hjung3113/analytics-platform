# 플랫폼 모노레포 패키지 경계 (Decided 2026-09-26 — 세부 필드명은 Candidate)

> 상태: [05 Decided "다음 구현 범위: 프론트엔드 플랫폼 틀 + 메뉴 개발 환경"](../05_roadmap_and_open_questions.md)의 첫 단계로 패키지 경계와 의존 방향을 정한다. §8의 5개 항목은 2026-09-26 사용자가 제안안대로 **Decided**. `PlatformAdapter`·`MenuMeta`·`evaluateSelection` 같은 필드·타입 이름은 구현하면서 바뀔 수 있는 Candidate다.
>
> §2·§7은 비어 있다 — 모노레포 추출 순서와 기록은 git 이력(PR #16–#32).
>
> 근거: [06 §3 아키텍처](../06_platform_ui_contract.md#3-platform-ui-architecture), [§4 Kernel 책임](../06_platform_ui_contract.md#4-platform-kernel-responsibilities), [§5 Menu Extension Contract](../06_platform_ui_contract.md#5-menu-extension-contract), [§13 컴포넌트 층](../06_platform_ui_contract.md#13-shared-component-layers).

## 1. 목표와 범위

- `platform-app`에 모여 있는 Kernel·UI·공통 컴포넌트·셸을 패키지로 나눈다. 메뉴는 **패키지 경계 밖에서** 선언만으로 얹히게 한다(06 §3: "플랫폼 기능은 개별 메뉴 import 관계를 알지 못해야 한다").
- 새 메뉴를 만들 때 쓸 템플릿(생성기)의 모양을 정한다.
- 서버는 mock을 유지한다(05 Decided). mock은 교체 가능한 어댑터 뒤로 숨긴다.
- **범위 밖:** 워크스페이스 층 구현(06 §9.1), Storybook·시각 회귀. 이들은 이 경계 위에서 후속 PR로 진행한다. FeedbackOps 앱·백엔드는 `products/feedbackops/`에 두며 루트 pnpm workspace의 일부다(#642). 플랫폼 코드는 UI primitive를 `@ap/ui`를 통해 소비한다.

## 3. 패키지 구성

> 목표 의존 방향은 SDK ← 제품 한 방향이다([ADR-0043](../adr/0043-platform-sdk-is-the-app-contract-and-unified-framework.md), 2026-10-19). 아래 `@ap/ui → @fops/ui` 간선(규칙 8)은 지금 구조이고, 토큰·primitive 코드를 SDK로 옮길 때 없앤다.


루트에 pnpm workspace를 두고 세 갈래로 나눈다: `packages/`(플랫폼), `menus/<space>/<group>/`(Consumer, `null` 소속은 `_global`), `apps/`(조립 지점). 이름 접두사는 Candidate `@ap/`.

| 패키지 | 06 갈래 | 내용(현재 파일 기준) | React | 의존 가능 |
| --- | --- | --- | --- | --- |
| `@ap/contracts` | Kernel 계약 | 순수 URL codec(`safeReturnTo`는 Registry가 필요해 Kernel에 남는다), manifest **메타데이터** 타입(`MenuMeta`: `MenuEntry`에서 `icon`·`component`를 뺀 선언부, `ContextKey`, `Capability`, `PageType`, 브랜드 id `GroupId`·`SpaceId`·`MenuPermission`과 그 생성자 `groupId`·`spaceId`·`menuPermission`, Kernel 고유 권한 `KERNEL_PERMISSIONS`·`Permission`; 그룹·공간·메뉴 권한의 값 목록은 앱이 선언한다, [ADR-0072](../adr/0072-open-menu-vocabulary-app-declared-branded-ids.md)), 응답·Trust envelope(`ApiResponse`, `Trust`, `Assessment`, `Outcome`), `AuditEvent`, `Text`(i18n 문자열 쌍), `PlatformAdapter` 포트와 그 입출력 타입(§4), 메뉴 조회 선언 `EndpointSpec`·`defineEndpoint`·`projectContext`·`MenuQuery`(§5), 서버 페이징 모양 `PageQuery`·`PageResult`·`sortAndPage`, wall-clock 기간 계산 `periodHours`·`bucketStart`. 워크스페이스 export는 `src`를 가리킨다. `publishConfig.exports`는 `check:pack`에서만 쓰는 manifest이며, SDK 배포 tarball은 `sdk-pack`이 생성한 manifest로 `dist`의 Node ESM `.js`·`.d.ts`를 연다. 소비자는 `AbortSignal`을 제공해야 한다(DOM lib 또는 `@types/node`); `check:pack`은 별도 계약용 tarball의 내용과 저장소 밖 소비자의 Bundler·NodeNext 타입 검사 및 Node import를 확인한다. | 없음(타입 포함) | 없음 |
| `@ap/ui` | 공통 컴포넌트(UI Primitive) | `styles/*.css`(FeedbackOps `a8d768b8`에서 이전한 tokens·semantic·theme·compat + 플랫폼 확장 `platform-tokens.css`), `ui/components/shadcn/*`·`Button`·`cn`(같은 시점 이전 구현, ADR-0046), `StatusBadge`(`Tone`), `DetailPanelSlot`(셸 상세 슬롯 등록 primitive: Provider·등록/host hook, 06 §13·ADR-0013) | 있음 | 외부 라이브러리만(`@fops/*` import 전면 금지, ADR-0046) |
| `@ap/kernel` | Kernel 기능 | 진입점 둘(ADR-0076): root는 메뉴 표면 — `PlatformProvider`/`usePlatform`(`MenuPlatform`)/`PlatformLink`; `@ap/kernel/host`는 셸·공통 컴포넌트·앱 전용 — `useHostPlatform`(`HostPlatform`, 전체 값)·`PaneScreenProvider`·`useModuleHost` 등(메뉴·모듈 import는 lint가 막는다). 이하 root, `usePlatformQuery`, 메뉴 조회 `useMenuQuery`(렌더 시점)·`useMenuFetch`(표 `loadPage`·내보내기 같은 호출형), i18n Provider, Registry 런타임(`createRegistry`, `matchRoute`, `pathFor`, `safeReturnTo`), React binding 타입 `MenuEntry = MenuMeta & { icon: LucideIcon; component?: LazyExoticComponent<…> }`, 어댑터 주입(`PlatformProvider adapter={…}`)과 세션 revision, 슬롯 등록, 조회 수명주기(내부 엔진 `@tanstack/react-query` 5.62.7 정확 고정 — 공유 키 중복 제거·5분 메모리 SWR, 클라이언트·타입은 공개 API에 나가지 않고 lint `denyQueryEngine`이 메뉴·메뉴 mock·components·shell·앱 프리셋의 import를 막는다(kernel·`@ap/fo-bridge` 허용), [ADR-0086](../adr/0086-kernel-query-engine-tanstack.md)) | 있음 | `contracts` |
| `@ap/components` | 공통 컴포넌트(Platform Component) + 차트 계약 + 레이아웃 | `PlatformPage`, `PlatformDataTable`, `DetailDrawer`, `AuditTimeline`, `DataTrustIndicator`, `StateView`, `StatCard`, `RadioGroup`, `AnalysisChartFrame`, `EChart`, 호스트 전용 진입점 `./dock`(제어형 `DockLayout`·레이아웃 스키마·순수 명령·플랫폼 separator, ADR-0067; 엔진 `dockview-react`는 lazy 청크 안에서만 쓰고 공개 API에 엔진 타입이 없다) | 있음 | `contracts`, `kernel`, `ui` |
| `@ap/shell` | Kernel 기능(App Shell) | `AppShell`, `AppRail`, `AppSidebar`, `ScopeSelector`, `CommandPalette`, `GlobalContextBar`, `RouteOutlet`(미등록·계약 오류·권한 없음·미구현 상태) | 있음 | `contracts`, `kernel`, `components`, `ui` |
| `@ap/fo-bridge` | (소비자 쪽 런타임, SDK 아님) | FeedbackOps 다리의 세션 런타임([ADR-0071](../adr/0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md)·[0081](../adr/0081-feedbackops-operator-screens-platform-frame.md), #759): `foQueryClient`(QueryClient는 이 하나)·`useFoSession`(세션 세대)·`FoBridge`·`hostLinks`와 경로 → 메뉴 링크 맵, `fo-api`(`setFoApi`/`foApi`), Kernel 슬롯 값 `notifications-slot`·`voc-compose-slot`·`home-todo-slot`(슬롯이 lazy로 여는 `src/pages/`의 화면 둘 포함). 화면은 재export하지 않는다. `tooling/scripts/sdk-exports.mjs`의 `SDK_PACKAGES`에 없고 배포하지 않는다 | 있음 | `contracts`, `kernel`, `components`, `ui` + FeedbackOps 진입 `@fops/frontend/global-screens/core`(lazy `src/pages/`는 `global-screens`도). import하는 쪽: 다리 메뉴(root, `@ap/menu-my-activity`와 이후 `menus/feedbackops/*`)와 앱(root는 앱 파일 어디서나, `/fo-api`·`/*-slot` 서브패스는 `main.tsx`만). 커널·components·shell·ui·contracts와 다른 메뉴는 lint가 막는다 |
| `@ap/mock-server` | (개발용) | `world`·`server`·`jobs`와 이들만 보는 단위 테스트(`explicit-empty`, `time-domain`). `PlatformAdapter` mock 구현 `createMockAdapter({ endpoints, registry, auditEvents? })`(감사 시드는 ADR-0048), 메뉴 조회 엔진 `serveEndpoint`(선언 사본으로 요청 모양·권한·Scope·한도 판정)와 핸들러 정의 `defineMockEndpoint`. 메뉴별 핸들러는 메뉴 패키지가 소유한다 | 없음 | `contracts` |
| `@ap/http-adapter` | (운영) | 실서버 클라이언트: `bootstrapHttpAdapter(options)`가 `GET /api/v1/platform/bootstrap`을 읽고 `ready`(`PlatformAdapter`)·`login`·`unavailable`을 돌려준다(reject 없음). 포트 메서드를 [전송 형식](http-adapter-contract.md) §1대로 HTTP로 옮기고 §2 변환·§4 `subscribe` 폴링·§5 취소/타임아웃·§6 CSRF·§7 Correlation ID를 지킨다. React·DOM 컴포넌트 없음(`fetch`·`AbortSignal`·`crypto`만). 앱은 운영 조립 `apps/platform-web/src/real/**`에서만 import한다(경계 lint). 예외: FeedbackOps 백엔드 테스트가 적합성 하네스로 쓴다([ADR-0073](../adr/0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md)) | 없음 | `contracts` |
| `@ap/server-conformance` | (검사) | 서버 경계 적합성 묶음(#145, #152): 엔드포인트 선언과 표본 요청으로 `PlatformAdapter`가 메뉴 조회 계약과 포트 메서드 계약(세션·Scope·목적지·감사·콘솔 조회·주석·활용률·오류 보고)을 지키는지 판정. mock과 사내 실어댑터에 같은 잣대 | 없음 | `contracts`(+ vitest) |
| `@ap/menu-<group>` | Consumer | Registry의 그룹마다 하나: `home`(overview), `my-activity`, `equipment`, `master-data`, `analytics`, `hw-time`, `metrics`, `notice-voc`, `admin` 등. 화면이 아직 없는 계획 메뉴(공정·레시피 마스터, Wafer Journey, 공지 등)도 `component` 없는 manifest로 자기 그룹 패키지가 소유한다(셸이 미구현 화면으로 표시). 각 패키지가 `manifests`(여러 메뉴 가능)와 화면·도메인 컴포넌트, 조회 선언 `src/endpoints.ts`, 서버 쪽 핸들러 `src/mock/`(서브패스 `./mock`, 앱 mock 조립 `src/dev/mock-assembly.tsx`만 import — 운영 빌드에는 없음, ADR-0009)을 가진다 | 있음 | `contracts`, `kernel`, `components`, `ui` (`src/mock/**`는 `contracts`·`mock-server`·자기 `endpoints.ts`만) |
| `apps/platform-web` | 조립 지점 | `main.tsx`, IA 설정(`SPACES`·`GROUPS`), 메뉴 등록, 어댑터 주입, dev 도구(역할 전환·응답 시나리오) | 있음 | 전부 |
| `apps/platform-e2e` | (검사) | 조립된 앱을 브라우저로 띄워 플랫폼 계약을 검사하는 Playwright 블랙박스 테스트와 항목별 보고(#44) | 없음 | 없음(`@ap/*` import 금지, 브라우저로만 관찰) |
| `tooling/*` | 개발 환경 | 공유 tsconfig, lint 설정(경계·계약 규칙), 메뉴 생성기 | — | — |

### 의존 방향

`@fops/ui`는 FeedbackOps에서 제공하는 외부 원본이며 `@ap/ui` 아래에 놓인다. primitive를 직접 import할 수 있는 곳은 `@ap/ui`뿐이다. 다른 플랫폼 패키지와 앱은 `@ap/ui`의 공개 export를 사용한다(ADR-0011).

```text
                 contracts
        ┌──────────┼──────────────┐
        ▼          ▼              ▼
 (ui ◀ @fops/ui)  kernel        mock-server
        │   ┌──────┤              │
        ▼   ▼      │              │
     components    │              │
        │          │              │
        ▼          ▼              │
      shell     menu-*  ◀─ src/mock ┘
        │          │  ▲
        │          │  └─ fo-bridge ─▶ @fops/frontend/global-screens(/core)
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
7. **모듈 패키지**(다른 저장소에서 플랫폼에 올라오는 화면 묶음, [ADR-0053](../adr/0053-host-module-contract-v1.md))는 `@ap/contracts`와 `@ap/ui`(+ `@ap/ui` CSS 하위 경로·`@ap/ui/theme`·`@ap/ui/theme-tokens.json`)만 import한다. `@ap/kernel`·`@ap/shell`·`@ap/components`·`menu-*`·`mock-server`는 import하지 않는다. `tooling/eslint`의 `hostModule` 프리셋이 강제하며, 이 저장소의 실제 패키지에는 적용하지 않고, 고정 모듈 fixture(`packages/shell/src/__fixtures__/module-fixture/`, 패키지가 아닌 디렉터리 — `hostModuleDir`가 그 디렉터리를 경계로 강제하고 `tooling/eslint` 회귀 테스트가 고정)에만 쓴다. 고정 fixture는 앱에 마운트하지 않는다. 외부 모듈은 앱의 `src/modules.ts`에서 `mountModule`로 마운트하고 `menus.ts`가 레지스트리 호출에서만 합친다 — 첫 외부 모듈은 EV의 `eqv`(릴리스 tarball `@eqv/*`를 URL로 설치, ADR-0053 소비자, 설치 절차는 EV ADR-0014·`INTEGRATION.md`가 소유, #801). 모듈은 자기 패키지 루트 안의 상대 import만 쓴다(패키지 이름 접두사와 무관). 열린 어휘(`<moduleId>:` 권한·그룹)와 등록 `mountModule`은 Kernel이 소유한다. 모듈 id는 플랫폼 권한 네임스페이스(`KERNEL_PERMISSIONS`와 앱이 선언한 메뉴 권한의 `:` 앞)를 쓸 수 없고, 화면 id는 메뉴 id `<moduleId>:<screenId>`로 등록된다.
8. 어떤 플랫폼 패키지도 `@fops/*`를 import하지 않는다(ADR-0046, #441 — 디자인 시스템은 `@ap/ui`로 옮겨 왔고 `@fops/ui`가 `@ap/ui`에 의존한다). primitive는 모든 플랫폼 코드에서 `@ap/ui`를 통해 쓴다(ADR-0011). **예외는 다리 하나다**(ADR-0071, ADR-0081): `@ap/fo-bridge`는 `@fops/frontend/global-screens/core`만 import하고(프리셋 `foBridge`, 슬롯이 lazy로 여는 `src/pages/`만 `global-screens`도), 다리 메뉴(`@ap/menu-my-activity`, 이후 `menus/feedbackops/*`)는 정확한 FeedbackOps 진입(`global-screens`·`global-screens/core`, 이후 `operator-screens/<entry>`)과 `@ap/fo-bridge` root를 import한다(프리셋 `foBridgeMenu`). 다른 `@fops/*` 경로와 다른 메뉴·층은 그대로 막힌다. 영구 로드 코드(루트·슬롯)가 화면 배럴을 들이지 않는 것과 진입점의 import 그래프(라우터·로그인 셸·`@/lib/api` 배럴 없음, 네트워크 호출은 `client.ts` 하나)는 `packages/fo-bridge/src/fo-entry-graph.test.ts`가 고정한다.
9. **실어댑터** `http-adapter`는 `contracts`만 import한다(React 없음). 이를 import할 수 있는 곳은 앱의 운영 조립 `apps/platform-web/src/real/**`(와 그 테스트)뿐이고, `main.tsx`·`src/dev/**`·그 밖의 앱 파일·다른 패키지·메뉴는 `tooling/eslint`가 막는다(#154). 플랫폼 밖 예외는 FeedbackOps 백엔드 테스트 코드 하나다([ADR-0073](../adr/0073-feedbackops-backend-tests-may-import-conformance-and-http-adapter.md), #674) — FeedbackOps 런타임 코드는 `products/feedbackops/scripts/check-boundaries.mjs` 규칙 11이 막는다.

## 4. Kernel 포트: `PlatformAdapter`

포트 타입과 입출력 DTO는 `@ap/contracts`에 둔다. `mock-server`(허용 의존: `contracts`뿐)가 이를 구현하고, Kernel은 소비만 한다. 포트가 Kernel에 있으면 구현체가 Kernel을 import해야 해 §3 규칙과 충돌한다. 포트는 함수 시그니처뿐이라 React·DOM 의존이 없다. 멤버 목록의 원본은 `packages/contracts/src/adapter.ts`, 메서드별 규칙은 [실서버 연결 체크리스트](real-server-checklist.md) §2, HTTP 매핑은 [전송 형식 초안](http-adapter-contract.md) §1이다. 필드명은 Candidate다.

- **포트에 두는 것과 메뉴 엔드포인트로 두는 것(2026-10-01, 메뉴 조회 포트 #100):** 포트 메서드는 ① Kernel·셸이 직접 부르고 메뉴 어휘가 없거나(세션·Scope·Context 선택지·활용률·오류 보고·주석) ② 권한·감사처럼 Kernel 책임 저장소를 읽는 것(`accessDirectory`·`auditTrail`·`entityAudit`)만이다. 메뉴의 데이터 조회는 메서드를 늘리지 않고 범용 `menuQuery` 하나로 보낸다 — 메뉴가 `src/endpoints.ts`에 선언하고 서버는 요청이 아니라 자기 선언 사본으로 판정한다(06 §5 "조회 엔드포인트"). 이 기준으로 VOC 두 메서드(`myVocHistory`·`mySurveyHistory`)는 #131에서 포트에서 빠져 `@ap/menu-notice-voc` 엔드포인트가 됐다. 결정 기록은 [ADR-0019](../adr/0019-menu-query-endpoint-declaration.md). 실서버가 지킬 것과 적합성 묶음 실행 방법은 [실서버 연결 체크리스트](real-server-checklist.md).
- **쓰기는 동작 선언 + 범용 `menuAction` 하나(2026-10-20, [ADR-0054](../adr/0054-write-port-declared-actions-idempotency-version.md), #501):** 메뉴의 서버 쓰기도 포트 메서드를 늘리지 않는다. 메뉴가 `ActionSpec`을 선언하고(`packages/contracts/src/action.ts`) 서버는 자기 선언 사본으로 판정한다. 판정 순서·등록 검증·적합성은 [실서버 연결 체크리스트](real-server-checklist.md) §3·§4. 주석 저장·삭제는 이번에 옮기지 않았다(ADR-0054 결과).
- **엔드포인트 선언의 한도(`limits`, #175):** `maxHours`(적용 기간 상한)와 `maxRows`(결과 전체 행 상한). 기준·판정 순서·등록 검증은 [실서버 연결 체크리스트](real-server-checklist.md) §3, 적합성 검사는 §4.
- **세션형 데이터는 동기 스냅샷 + `subscribe`:** 셸이 로딩 공백 없이 그려지도록 `session()`·`publishedMetrics()`는 동기로 둔다. 실서버 어댑터는 Provider를 마운트하기 전에 세션을 받아 둔다(부트스트랩). 요청마다 달라지는 검증(`validateScope`, `evaluateSelection`)만 비동기다.

- 역할 전환과 응답 시나리오 시뮬레이터(`setRole`, `setScenario`)는 **실서버에 없는 개발 기능**이다. `Platform` 컨텍스트에서 빼고 `apps/platform-web`의 dev 도구가 레일 아래 `topBarTools` 슬롯에 붙인다. 운영 빌드에는 포함하지 않는다 — mock 조립(`src/dev/mock-assembly.tsx`)이 `topBarTools`로 넘기고, 운영 빌드는 그 조립을 쓰지 않으며 빌드 단계 그래프 검사가 막는다(#153, ADR-0009).
- **무효화 계약 보존:** 현재 `usePlatformQuery`는 결과 identity에 `role`·`scenario`를 넣어, 전환 즉시 이전 결과를 숨기고 재조회한다. 분리 후에는 dev 도구가 mock 어댑터의 상태를 바꾸고 어댑터가 `subscribe` 리스너를 호출한다. Kernel은 알림을 받으면 ① `session()`을 다시 읽고 ② 세션 객체가 바뀌었으면 현재 Scope를 재검증하고 ③ revision을 올린다(시나리오처럼 세션이 그대로인 변경은 ③만). `usePlatformQuery`의 identity는 `[revision, user 식별자, 전역 Context, page 입력]`이 되어 지금과 같은 시점에 이전 결과를 숨긴다. 실서버에서는 재로그인·권한 변경 알림이 같은 경로를 탄다. 검증: 역할·시나리오 전환 직후 이전 결과가 한 프레임도 보이지 않을 것(`kernel/adapter.test.tsx`).
- listAxisOptions·searchEquipment·resolveSelection은 필수 어댑터 멤버다. 외부 어댑터도 구현해야 한다. 의미·오류·페이징·Kernel 훅/화면 캐시 원본은 [06 §6.4](../06_platform_ui_contract.md#64-url-계약-decided-필드명enum-문자열은-candidate)다. contextOptions·evaluateSelection은 deprecated 호환 포트로 남는다.
- `matchesCondition` 같은 조건 판정은 서버 책임이다. 셸은 조건·방·Selection이 바뀔 때 `evaluateSelection`을 다시 호출하고 결과(후보, 조건 결과 개수, 조건 밖 선택)만 표시한다. 이전 요청 결과를 새 결과로 보이지 않는 요청 수명주기는 `usePlatformQuery`와 같은 규칙을 따른다.

## 5. 메뉴 패키지 계약과 템플릿

메뉴 패키지 하나의 모양(생성기 `pnpm gen:menu <group>`이 만드는 것):

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
const registry = createRegistry({ spaces: SPACES, groups: GROUPS, menus: [...home.manifests, ...equipment.manifests, ...] });
```

`createRegistry`가 검증할 것(현재 코드는 일부를 런타임에만 암묵적으로 가정):

- 메뉴 `id` 중복 없음, `parent`가 존재하는 메뉴를 가리킴
- **route 충돌 없음:** 파라미터 이름을 지운 정규형(`/metrics/:metricId` → `/metrics/:`)이 같은 두 패턴은 거부한다. 정적 세그먼트와 파라미터가 같은 위치에서 겹치는 경우(`/metrics/new` vs `/metrics/:metricId`)는 허용하되, `matchRoute`가 등록 순서가 아니라 **정적 세그먼트 우선**(앞 세그먼트부터 정적 > 파라미터)으로 고른다. 현재 `matchRoute`는 선언 순서 first-match라 메뉴 패키지로 나누면 등록 순서가 결과를 바꿀 수 있다
- 그룹마다 `primary` 정확히 하나(06 §5)
- `pageKeys`가 전역 Context 키와 겹치지 않음(06 §6.1)
- **공간:** 검증 규칙은 [06 §9.1](../06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26)과 [`packages/kernel/src/registry/registry.ts`](../../packages/kernel/src/registry/registry.ts)가 소유한다. 전역 유틸리티 그룹은 `space: null`이고, 그 외에는 등록된 공간만 허용한다.

생성기는 manifest 뼈대, `pageType`별 06 §12 슬롯 뼈대(화면 슬롯은 12.6), 조회 선언·mock 핸들러, 테스트를 만들고 앱 등록 목록에 연결한다. 메뉴 템플릿이 Sidebar·Breadcrumb·권한 숨김을 직접 구현하지 못하게 하는 것은 06 §5 "금지" 목록을 lint로 옮겨 막는다(§6).

## 6. 경계 강제와 도구

| 항목 | 제안 | 비고 |
| --- | --- | --- |
| 패키지 관리 | pnpm workspace + Turborepo | 버전의 원본은 루트 `packageManager`·`turbo.json` |
| 내부 패키지 빌드 | 빌드 없이 TS 소스를 `exports`로 노출, 앱의 Vite가 번들 | 패키지별 `tsc --noEmit`으로 타입 경계 검사 |
| 경계 검사 | ESLint `no-restricted-imports` + 계약 규칙 — `tooling/eslint`(`@ap/eslint-config`)의 레이어별 프리셋을 각 패키지 `eslint.config.js`가 한 줄로 가져다 쓴다 | §3 규칙 1–4를 패키지별 설정으로. 규칙·프리셋 원본은 `tooling/eslint/src/` |
| 계약 lint | URL 직접 조립 금지(`?`/`&` 문자열 조합 대신 `linkTo`/`buildQuery`), `window.location` 직접 쓰기 금지, 메뉴 코드에서 `localStorage` 금지 | 인터뷰 기록의 "URL 직접 조립 금지 lint" |
| 테스트 | Vitest를 패키지별로. 층을 넘는 테스트는 위층(메뉴 또는 앱)의 통합 테스트로 둔다(§3 규칙 6) | `pnpm --filter <패키지> test`로 좁혀 돌린다 |
| CI | `platform-workspace` Job이 다음 순서로 단계를 돈다(`.github/workflows/ci.yml`이 원본, Turbo 태스크 그래프). ① 문서 링크 검사(`check-doc-links.mjs`, 설치 전) ② `pnpm install --frozen-lockfile` ③ turbo 범위 가드 `check-platform-turbo-scope.mjs`와 그 `--self-test` — root 스크립트 lint·typecheck·test·build 태스크 그래프에 FeedbackOps 태스크(`@fops/*`·`feedbackops`)가 하나도 없고 typecheck에 `@ap/ui`가 있는지 확인한다(#390) ④ `pnpm lint` ⑤ `pnpm typecheck` ⑥ `pnpm test` ⑦ `pnpm build` ⑧ `pnpm check:lazy-chunks`와 `--self-test`(지연 엔진이 시작 청크에 없는지, #706) ⑨ `pnpm sdk:api`·`pnpm sdk:api --self-test`·`pnpm sdk:test` ⑩ `pnpm --filter @ap/contracts check:pack` ⑪ `pnpm sdk:pack` → `pnpm sdk:consumer-check`(ADR-0056, #519·#520) ⑫ `pnpm --filter @ap/platform-web check:prod-graph` — 운영 모듈 그래프(조립 모듈 external)에 mock·`src/dev`가 없음을 확인한다(#153, ADR-0009) ⑬ 두 강제 실패 단계(`--force-mock`·`--force-mock-build`) — 검사와 빌드 단계 가드가 아직 무는지 확인한다(통과하면 단계 실패). root 스크립트는 `--filter='!@fops/*' --filter='!feedbackops'`로 FeedbackOps 태스크를 뺀다(의존 패키지 해시는 스크립트 없는 `transit` 태스크가 전파한다, #390). 동시 패키지 수는 `turbo.json`의 `concurrency: 2`로 제한한다(패키지별 vitest 워커가 겹쳐 러너 CPU를 초과 구독해 5초 타임아웃이 나던 문제, #166). lint는 별도 Job이 아니라 같은 Job의 단계다. 플랫폼 계약 E2E는 별도 Job(브라우저 설치가 무거워 분리, #44)으로, shard 3개 matrix `platform-contracts-e2e-shard`와 blob을 합쳐 보고·판정을 내는 `platform-contracts-e2e`(#666). 소개 사이트 캡처 Job `site-shots`(`Intro site captures`, 필수 아님)는 캡처가 기대는 경로를 바꾼 PR에서만 mock 데모를 하위 경로로 빌드해 `shots.mjs` → `assemble.mjs` → `check-assembled.mjs --browser`를 돈다(#608). 병합 게이트: `main` ruleset `main: required CI`(2026-10-23, #670 D2)가 `Platform workspace (pnpm monorepo)`·`Platform contracts (E2E)`를 필수 검사로 요구하고 force push·삭제를 막는다. strict가 아니라 브랜치가 최신일 필요는 없다 | Node 26.7.0 유지. `pnpm -r typecheck test build`처럼 한 줄로 쓰면 뒤 두 개가 첫 스크립트의 인자가 되어 실행되지 않는다 |

**lint 도구 — ESLint (Decided, §8 #4):** FeedbackOps는 Biome을 쓰지만 경계 규칙과 URL 조립 금지 같은 커스텀 AST 규칙이 필요해 ESLint를 택했다(Biome 플러그인 GritQL은 이런 규칙에 제한적). `tooling/eslint`(`@ap/eslint-config`)의 층별 preset으로 구현했다. 문법 기반이라 변수에 담아 조립한 URL, computed 속성(`window['localStorage']`), optional chaining 호출 같은 우회는 잡지 않는다 — 규칙이 허용한다는 뜻이 아니다.

## 8. 결정 (Decided, 2026-09-26)

| # | 항목 | 결정 | 이유 |
| --- | --- | --- | --- |
| 1 | 패키지 구성·의존 방향 | §3 그대로 | 현재 폴더 구조와 거의 일치해 이동 비용이 적고, `contracts` 분리로 향후 백엔드와 계약 공유 가능 |
| 2 | 메뉴 패키지 단위 | **그룹 단위** (`menu-analytics`에 생산성 개요·사이클타임·실행 상세) | 같은 그룹 안 목록→상세 import가 자연스럽고, 사이드바 그룹(06 §9)·소유 단위와 일치. 커지면 그때 분할 |
| 3 | 프로토타입 처리 | `prototypes/platform-app` → `apps/platform-web`으로 **`git mv`** | 이력·리뷰 보고서 연결 유지, 코드 두 벌 방지 |
| 4 | lint 도구 | **ESLint** | 경계·URL 조립 금지 같은 커스텀 규칙이 목적. FeedbackOps는 Biome을 쓰지만 루트 lint는 `@fops/*` 태스크를 제외한다. 앱·백엔드 등 나머지는 별도 workspace다 |
| 5 | 이름 | 접두사 `@ap/`, 메뉴 폴더 `menus/<space>/<group>/` | 공간별 소속은 폴더가 원본이며 선언과 일치하는지 검사([ADR-0031](../adr/0031-menu-folders-by-space.md)) |

**`@ap/`는 임시 접두사다.** 회사 시스템 이름이 정해지면 일괄 변경한다. 변경 비용을 낮게 유지하려고 다음을 지킨다.

- 접두사는 `package.json` 이름·의존성, import 문, lint 경계 설정과 생성기 설정의 상수 한 곳에만 쓴다. 생성기 상수는 `tooling/gen-menu/src/prefix.ts`에 있다.
- localStorage 키·이벤트 이름 등 런타임 문자열에 접두사를 넣지 않는다.
- 변경 절차: 문자열 일괄 치환 → `pnpm install`(lockfile 재생성) → typecheck·test·build.
