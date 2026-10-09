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
- **범위 밖:** 워크스페이스 층 구현(06 §9.1), Storybook·시각 회귀. 이들은 이 경계 위에서 후속 PR로 진행한다. FeedbackOps 앱·백엔드는 자체 pnpm workspace에 두고, `packages/ui`와 `packages/shared`만 플랫폼 workspace에 포함한다. 플랫폼 코드는 UI primitive를 `@ap/ui`를 통해 소비한다.

## 3. 패키지 구성

루트에 pnpm workspace를 두고 세 갈래로 나눈다: `packages/`(플랫폼), `menus/`(Consumer), `apps/`(조립 지점). 이름 접두사는 Candidate `@ap/`.

| 패키지 | 06 갈래 | 내용(현재 파일 기준) | React | 의존 가능 |
| --- | --- | --- | --- | --- |
| `@ap/contracts` | Kernel 계약 | 순수 URL codec(`safeReturnTo`는 Registry가 필요해 Kernel에 남는다), manifest **메타데이터** 타입(`MenuMeta`: `MenuEntry`에서 `icon`·`component`를 뺀 선언부, `ContextKey`, `Capability`, `PageType`, `Permission`), 응답·Trust envelope(`ApiResponse`, `Trust`, `Assessment`, `Outcome`), `AuditEvent`, `Text`(i18n 문자열 쌍), `PlatformAdapter` 포트와 그 입출력 타입(§4), 메뉴 조회 선언 `EndpointSpec`·`defineEndpoint`·`projectContext`·`MenuQuery`(§5), 서버 페이징 모양 `PageQuery`·`PageResult`·`sortAndPage`, wall-clock 기간 계산 `periodHours`·`bucketStart` | 없음(타입 포함) | 없음 |
| `@ap/ui` | 공통 컴포넌트(UI Primitive) | `styles/tokens.css`(플랫폼 확장), `ui/components/shadcn/*`·`Button`·`cn`(`@fops/ui` 재수출), `StatusBadge`(`Tone`), `DetailPanelSlot`(셸 상세 슬롯 등록 primitive: Provider·등록/host hook, 06 §13·ADR-0013) | 있음 | 외부 라이브러리, `@fops/ui`(FeedbackOps 외부 원본; 직접 소비는 여기만) |
| `@ap/kernel` | Kernel 기능 | `PlatformProvider`/`usePlatform`/`PlatformLink`, `usePlatformQuery`, 메뉴 조회 `useMenuQuery`(렌더 시점)·`useMenuFetch`(표 `loadPage`·내보내기 같은 호출형), i18n Provider, Registry 런타임(`createRegistry`, `matchRoute`, `pathFor`, `safeReturnTo`), React binding 타입 `MenuEntry = MenuMeta & { icon: LucideIcon; component?: LazyExoticComponent<…> }`, 어댑터 주입(`PlatformProvider adapter={…}`)과 세션 revision, 슬롯 등록 | 있음 | `contracts` |
| `@ap/components` | 공통 컴포넌트(Platform Component) + 차트 계약 + 레이아웃 | `PlatformPage`, `PlatformDataTable`, `DetailDrawer`, `AuditTimeline`, `DataTrustIndicator`, `StateView`, `StatCard`, `RadioGroup`, `AnalysisChartFrame`, `EChart` | 있음 | `contracts`, `kernel`, `ui` |
| `@ap/shell` | Kernel 기능(App Shell) | `AppShell`, `AppRail`, `AppSidebar`, `ScopeSelector`, `CommandPalette`, `GlobalContextBar`, `RouteOutlet`(미등록·계약 오류·권한 없음·미구현 상태) | 있음 | `contracts`, `kernel`, `components`, `ui` |
| `@ap/mock-server` | (개발용) | `world`·`server`·`jobs`와 이들만 보는 단위 테스트(`explicit-empty`, `time-domain`). `PlatformAdapter` mock 구현 `createMockAdapter({ endpoints, registry })`, 메뉴 조회 엔진 `serveEndpoint`(선언 사본으로 요청 모양·권한·Scope·한도 판정)와 핸들러 정의 `defineMockEndpoint`. 메뉴별 핸들러는 메뉴 패키지가 소유한다 | 없음 | `contracts` |
| `@ap/server-conformance` | (검사) | 서버 경계 적합성 묶음(#145, #152): 엔드포인트 선언과 표본 요청으로 `PlatformAdapter`가 메뉴 조회 계약과 포트 메서드 계약(세션·Scope·목적지·감사·콘솔 조회·주석·활용률·오류 보고)을 지키는지 판정. mock과 사내 실어댑터에 같은 잣대 | 없음 | `contracts`(+ vitest) |
| `@ap/menu-<group>` | Consumer | Registry의 7개 그룹마다 하나: `home`(overview), `equipment`, `master-data`, `analytics`, `metrics`, `notice-voc`, `admin`. 화면이 아직 없는 계획 메뉴(공정·레시피 마스터, Wafer Journey, 공지 등)도 `component` 없는 manifest로 자기 그룹 패키지가 소유한다(셸이 미구현 화면으로 표시). 각 패키지가 `manifests`(여러 메뉴 가능)와 화면·도메인 컴포넌트, 조회 선언 `src/endpoints.ts`, 서버 쪽 핸들러 `src/mock/`(서브패스 `./mock`, 앱 mock 조립 `src/dev/mock-assembly.tsx`만 import — 운영 빌드에는 없음, ADR-0009)을 가진다 | 있음 | `contracts`, `kernel`, `components`, `ui` (`src/mock/**`는 `contracts`·`mock-server`·자기 `endpoints.ts`만) |
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
        │          │
        └────┬─────┘
             ▼
     apps/platform-web
```

규칙:

1. 화살표 반대 방향 import 금지. 특히 `kernel`·`components`·`shell`은 `menu-*`와 `mock-server`를 import하지 않는다.
2. `menu-*`끼리 import 금지. 교차 메뉴 이동은 `linkTo(menuId, ...)`만 쓴다(06 §22).
3. `menu-*`에서 `mock-server` import는 그 메뉴의 `src/mock/**`에서만 허용한다.
4. 각 패키지는 `package.json` `exports`로 공개 진입점만 연다. `@ap/components/src/...` 같은 깊은 경로 import 금지.
5. `contracts`는 React·브라우저 API에 타입 수준으로도 의존하지 않는다(향후 백엔드와 공유할 수 있게). 아이콘·화면 컴포넌트처럼 React 타입이 필요한 manifest 필드는 `kernel`의 `MenuEntry`가 소유한다.
6. 규칙 1–3은 테스트 파일에도 적용한다. 층을 넘는 검증은 그 위층(메뉴 또는 앱)의 통합 테스트로 둔다.
7. `@fops/*` 직접 import는 `@ap/ui`에서 공개 진입점 `@fops/ui`를 소비하는 경우만 허용한다. primitive는 나머지 모든 플랫폼 코드에서 `@ap/ui`를 통해 쓴다(ADR-0011).

## 4. Kernel 포트: `PlatformAdapter`

포트 타입과 입출력 DTO는 `@ap/contracts`에 둔다. `mock-server`(허용 의존: `contracts`뿐)가 이를 구현하고, Kernel은 소비만 한다. 포트가 Kernel에 있으면 구현체가 Kernel을 import해야 해 §3 규칙과 충돌한다. 포트는 함수 시그니처뿐이라 React·DOM 의존이 없다. 멤버 목록의 원본은 `packages/contracts/src/adapter.ts`, 메서드별 규칙은 [실서버 연결 체크리스트](real-server-checklist.md) §2, HTTP 매핑은 [전송 형식 초안](http-adapter-contract.md) §1이다. 필드명은 Candidate다.

- **포트에 두는 것과 메뉴 엔드포인트로 두는 것(2026-10-01, 메뉴 조회 포트 #100):** 포트 메서드는 ① Kernel·셸이 직접 부르고 메뉴 어휘가 없거나(세션·Scope·Context 선택지·활용률·오류 보고·주석) ② 권한·감사처럼 Kernel 책임 저장소를 읽는 것(`accessDirectory`·`auditTrail`·`entityAudit`)만이다. 메뉴의 데이터 조회는 메서드를 늘리지 않고 범용 `menuQuery` 하나로 보낸다 — 메뉴가 `src/endpoints.ts`에 선언하고 서버는 요청이 아니라 자기 선언 사본으로 판정한다(06 §5 "조회 엔드포인트"). 이 기준으로 VOC 두 메서드(`myVocHistory`·`mySurveyHistory`)는 #131에서 포트에서 빠져 `@ap/menu-notice-voc` 엔드포인트가 됐다. 결정 기록은 [ADR-0019](../adr/0019-menu-query-endpoint-declaration.md). 실서버가 지킬 것과 적합성 묶음 실행 방법은 [실서버 연결 체크리스트](real-server-checklist.md).
- **엔드포인트 선언의 한도(`limits`, #175):** `maxHours`(적용 기간 상한)와 `maxRows`(결과 전체 행 상한). 기준·판정 순서·등록 검증은 [실서버 연결 체크리스트](real-server-checklist.md) §3, 적합성 검사는 §4.
- **세션형 데이터는 동기 스냅샷 + `subscribe`:** 셸이 로딩 공백 없이 그려지도록 `session()`·`publishedMetrics()`는 동기로 둔다. 실서버 어댑터는 Provider를 마운트하기 전에 세션을 받아 둔다(부트스트랩). 요청마다 달라지는 검증(`validateScope`, `evaluateSelection`)만 비동기다.

- 역할 전환과 응답 시나리오 시뮬레이터(`setRole`, `setScenario`)는 **실서버에 없는 개발 기능**이다. `Platform` 컨텍스트에서 빼고 `apps/platform-web`의 dev 도구가 레일 아래 `topBarTools` 슬롯에 붙인다. 운영 빌드에는 포함하지 않는다 — mock 조립(`src/dev/mock-assembly.tsx`)이 `topBarTools`로 넘기고, 운영 빌드는 그 조립을 쓰지 않으며 빌드 단계 그래프 검사가 막는다(#153, ADR-0009).
- **무효화 계약 보존:** 현재 `usePlatformQuery`는 결과 identity에 `role`·`scenario`를 넣어, 전환 즉시 이전 결과를 숨기고 재조회한다. 분리 후에는 dev 도구가 mock 어댑터의 상태를 바꾸고 어댑터가 `subscribe` 리스너를 호출한다. Kernel은 알림을 받으면 ① `session()`을 다시 읽고 ② 세션 객체가 바뀌었으면 현재 Scope를 재검증하고 ③ revision을 올린다(시나리오처럼 세션이 그대로인 변경은 ③만). `usePlatformQuery`의 identity는 `[revision, user 식별자, 전역 Context, page 입력]`이 되어 지금과 같은 시점에 이전 결과를 숨긴다. 실서버에서는 재로그인·권한 변경 알림이 같은 경로를 탄다. 검증: 역할·시나리오 전환 직후 이전 결과가 한 프레임도 보이지 않을 것(`kernel/adapter.test.tsx`).
- `matchesCondition` 같은 조건 판정은 서버 책임이다. 셸은 조건·방·Selection이 바뀔 때 `evaluateSelection`을 다시 호출하고 결과(후보, 조건 결과 개수, 조건 밖 선택)만 표시한다. 이전 요청 결과를 새 결과로 보이지 않는 요청 수명주기는 `usePlatformQuery`와 같은 규칙을 따른다.

## 5. 메뉴 패키지 계약과 템플릿

메뉴 패키지 하나의 모양(생성기 `pnpm gen:menu <group>`이 만드는 것):

```text
menus/<group>/
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

생성기는 한 번에 스켈레톤 하나를 만든다 — manifest 1개, archetype은 manifest의 `pageType`(다섯 중 선택), `endpoints.ts`·`mock/`(표본 엔드포인트 1개)·테스트 — 그리고 앱의 마커 영역에 연결 다섯 줄(`menus.ts` import·spread, `style.css` `@import`, `src/dev/mock-assembly.tsx`의 `/mock` import·`MOCK_ENDPOINTS` spread, #153)과 앱 `package.json` 의존 1줄을 추가한다(#126). `GROUPS`와 `GroupId`는 편집하지 않는다(사람이 먼저 추가한다).

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
- **공간:** 검증 규칙은 [06 §9.1](../06_platform_ui_contract.md#91-워크스페이스-decided-2026-09-26)과 [`packages/kernel/src/registry.ts`](../../packages/kernel/src/registry.ts)가 소유한다. 전역 유틸리티 그룹은 `space: null`이고, 그 외에는 등록된 공간만 허용한다.

생성기는 manifest 뼈대, `pageType`별 06 §12 슬롯 뼈대(화면 슬롯은 12.6), 조회 선언·mock 핸들러, 테스트를 만들고 앱 등록 목록에 연결한다. 메뉴 템플릿이 Sidebar·Breadcrumb·권한 숨김을 직접 구현하지 못하게 하는 것은 06 §5 "금지" 목록을 lint로 옮겨 막는다(§6).

## 6. 경계 강제와 도구

| 항목 | 제안 | 비고 |
| --- | --- | --- |
| 패키지 관리 | pnpm workspace + Turborepo | 버전의 원본은 루트 `packageManager`·`turbo.json` |
| 내부 패키지 빌드 | 빌드 없이 TS 소스를 `exports`로 노출, 앱의 Vite가 번들 | 패키지별 `tsc --noEmit`으로 타입 경계 검사 |
| 경계 검사 | ESLint `no-restricted-imports` + 계약 규칙 — `tooling/eslint`(`@ap/eslint-config`)의 레이어별 프리셋을 각 패키지 `eslint.config.js`가 한 줄로 가져다 쓴다 | §3 규칙 1–4를 패키지별 설정으로. 규칙·프리셋 원본은 `tooling/eslint/src/` |
| 계약 lint | URL 직접 조립 금지(`?`/`&` 문자열 조합 대신 `linkTo`/`buildQuery`), `window.location` 직접 쓰기 금지, 메뉴 코드에서 `localStorage` 금지 | 인터뷰 기록의 "URL 직접 조립 금지 lint" |
| 테스트 | Vitest를 패키지별로. 층을 넘는 테스트는 위층(메뉴 또는 앱)의 통합 테스트로 둔다(§3 규칙 6) | `pnpm --filter <패키지> test`로 좁혀 돌린다 |
| CI | `platform-workspace` Job에서 `pnpm lint`·`pnpm typecheck`·`pnpm test`·`pnpm build`를 각각 별도 단계로(Turbo 태스크 그래프). test 단계는 `pnpm test --concurrency=2`를 쓰며 root 스크립트의 `--filter='!@fops/*' --only`로 FeedbackOps 태스크를 제외하고 동시 패키지 수를 제한한다(패키지별 vitest 워커가 겹쳐 러너 CPU를 초과 구독해 5초 타임아웃이 나던 문제, #166). CI의 dry-run guard는 root 스크립트 lint·typecheck·test·build 태스크 그래프에 `@fops/*` 태스크가 없는지 확인한다. `pnpm build` 다음 단계 `pnpm --filter @ap/platform-web check:prod-graph`가 운영 모듈 그래프(조립 모듈 external)에 mock·`src/dev`가 없음을 확인한다(#153, ADR-0009). 이어서 두 강제 실패 단계(`--force-mock`·`--force-mock-build`)가 검사와 빌드 단계 가드가 아직 무는지 확인한다(통과하면 단계 실패). lint는 별도 Job이 아니라 같은 Job의 단계. 플랫폼 계약 E2E는 별도 Job `platform-contracts-e2e`(브라우저 설치가 무거워 분리, #44) | Node 26.7.0 유지. `pnpm -r typecheck test build`처럼 한 줄로 쓰면 뒤 두 개가 첫 스크립트의 인자가 되어 실행되지 않는다 |

**lint 도구 — ESLint (Decided, §8 #4):** FeedbackOps는 Biome을 쓰지만 경계 규칙과 URL 조립 금지 같은 커스텀 AST 규칙이 필요해 ESLint를 택했다(Biome 플러그인 GritQL은 이런 규칙에 제한적). `tooling/eslint`(`@ap/eslint-config`)의 층별 preset으로 구현했다. 문법 기반이라 변수에 담아 조립한 URL, computed 속성(`window['localStorage']`), optional chaining 호출 같은 우회는 잡지 않는다 — 규칙이 허용한다는 뜻이 아니다.

## 8. 결정 (Decided, 2026-09-26)

| # | 항목 | 결정 | 이유 |
| --- | --- | --- | --- |
| 1 | 패키지 구성·의존 방향 | §3 그대로 | 현재 폴더 구조와 거의 일치해 이동 비용이 적고, `contracts` 분리로 향후 백엔드와 계약 공유 가능 |
| 2 | 메뉴 패키지 단위 | **그룹 단위** (`menu-analytics`에 생산성 개요·사이클타임·실행 상세) | 같은 그룹 안 목록→상세 import가 자연스럽고, 사이드바 그룹(06 §9)·소유 단위와 일치. 커지면 그때 분할 |
| 3 | 프로토타입 처리 | `prototypes/platform-app` → `apps/platform-web`으로 **`git mv`** | 이력·리뷰 보고서 연결 유지, 코드 두 벌 방지 |
| 4 | lint 도구 | **ESLint** | 경계·URL 조립 금지 같은 커스텀 규칙이 목적. FeedbackOps는 Biome을 쓰지만 루트 lint는 `@fops/*` 태스크를 제외한다. 앱·백엔드 등 나머지는 별도 workspace다 |
| 5 | 이름 | 접두사 `@ap/`, 메뉴 폴더 `menus/` | `menus/`는 "메뉴는 Consumer" 원칙을 구조로 드러냄 |

**`@ap/`는 임시 접두사다.** 회사 시스템 이름이 정해지면 일괄 변경한다. 변경 비용을 낮게 유지하려고 다음을 지킨다.

- 접두사는 `package.json` 이름·의존성, import 문, lint 경계 설정과 생성기 설정의 상수 한 곳에만 쓴다. 생성기 상수는 `tooling/gen-menu/src/prefix.ts`에 있다.
- localStorage 키·이벤트 이름 등 런타임 문자열에 접두사를 넣지 않는다.
- 변경 절차: 문자열 일괄 치환 → `pnpm install`(lockfile 재생성) → typecheck·test·build.
