# 플랫폼 모노레포 패키지 경계 (Candidate — 사용자 확인 대기)

> 상태: **Candidate.** 이 문서는 [05 Decided "다음 구현 범위: 프론트엔드 플랫폼 틀 + 메뉴 개발 환경"](../05_roadmap_and_open_questions.md)의 첫 단계로 패키지 경계와 의존 방향을 제안한다. 사용자 확인 전에는 코드를 옮기지 않는다. 패키지 이름·폴더명·도구 선택은 모두 Candidate다.
>
> 근거: `prototypes/platform-app/src`의 import 그래프(2026-09-26, `main` `ebb471c`), [06 §3 아키텍처](../06_platform_ui_contract.md#3-platform-ui-architecture), [§4 Kernel 책임](../06_platform_ui_contract.md#4-platform-kernel-responsibilities), [§5 Menu Extension Contract](../06_platform_ui_contract.md#5-menu-extension-contract), [§13 컴포넌트 층](../06_platform_ui_contract.md#13-shared-component-layers).

## 1. 목표와 범위

- `platform-app`에 모여 있는 Kernel·UI·공통 컴포넌트·셸을 패키지로 나눈다. 메뉴는 **패키지 경계 밖에서** 선언만으로 얹히게 한다(06 §3: "플랫폼 기능은 개별 메뉴 import 관계를 알지 못해야 한다").
- 새 메뉴를 만들 때 쓸 템플릿(생성기)의 모양을 정한다.
- 서버는 mock을 유지한다(05 Decided). mock은 교체 가능한 어댑터 뒤로 숨긴다.
- **범위 밖:** 워크스페이스 층 구현(06 §9.1), README "남은 플랫폼 과제", Storybook·시각 회귀. 이들은 이 경계 위에서 후속 PR로 진행한다. FeedbackOps(`products/feedbackops`)는 자체 pnpm workspace를 유지하고 이 workspace에 포함하지 않는다.

## 2. 현재 구조에서 끊어야 할 의존

`platform-app`은 폴더로는 이미 `kernel / ui / platform / shell / pages / mock`으로 나뉘어 있다. 그대로 패키지로 자르면 아래 역방향·누수 의존 때문에 순환이 생긴다.

| # | 현재 의존 | 문제 | 해소 방향 |
| --- | --- | --- | --- |
| D1 | `kernel/registry.ts` → `pages/*` (`lazy(() => import('../pages/...'))`로 메뉴 목록 `MENUS` 하드코딩) | Kernel이 메뉴를 안다. 새 메뉴마다 Kernel 수정 | 메뉴가 manifest를 export하고, 앱(조립 지점)이 Kernel에 등록 |
| D2 | `kernel/platform.tsx` → `mock/world`, `mock/server` (사용자·역할, Scope 검증, 응답 시나리오, 기본 기간, 게시 지표) | Kernel이 mock 구현에 묶임. 실서버로 교체 불가 | `PlatformAdapter` 포트를 Kernel이 정의하고 mock이 구현 |
| D3 | `platform/*`, `kernel/query.ts` → `mock/server`의 **타입** (`ApiResponse`, `Trust`, `Assessment`) | 응답·신뢰 envelope(06 §18–19 계약)이 mock 파일에 정의돼 있음 | 계약 타입을 `contracts`로 이동 |
| D4 | `platform/PlatformPage.tsx` → `shell/GlobalContextBar` | 공통 컴포넌트가 셸을 import(층 역전) | 셸이 PlatformPage의 Context Bar 슬롯을 채움(Kernel이 슬롯 제공) |
| D5 | `shell/GlobalContextBar`, `shell/TopBar` → `mock/world` (`EQUIPMENT`, `SITES`, `USERS`, 조건 옵션 목록) | 셸이 도메인 데이터 원천을 직접 읽음 | Context 선택지·사이트 목록을 어댑터에서 조회. 역할 전환·시나리오 시뮬레이터는 dev 전용 슬롯으로 |
| D6 | `mock/world.ts` → `kernel/registry`(`Permission` 타입, `import type`) | 런타임 의존은 아니지만 패키지 경계에서는 mock이 Kernel에 묶임 | `Permission`을 `contracts`로 |
| D7 | `pages/*/data.ts` → `platform/AuditTimeline`, `platform/StatusBadge`의 **타입** (`AuditEvent`, `Tone`) | 데이터 모듈이 컴포넌트 파일에 의존 | 타입을 `contracts`(`AuditEvent`) 또는 `ui`(`Tone`)로 |
| D8 | 각 메뉴 화면 → `mock/server.serve`, `mock/world`, `mock/jobs` 직접 호출 | 메뉴 곳곳에 mock 호출이 흩어져 실서버 전환 때 전부 수정 | 메뉴마다 `api.ts` 한 파일만 데이터 원천을 알게 함(§5) |
| D9 | `kernel/url.ts` → `kernel/registry.matchRoute` (`safeReturnTo`가 등록 메뉴·`pageKeys`로 복귀 경로 검증) | `url.ts`를 그대로 `contracts`로 옮기면 `contracts → kernel → contracts` 순환 | 순수 URL codec(`parseQuery`, `buildQuery`, `isAppRelativePath` 등)만 `contracts`로. `safeReturnTo`는 Registry를 인자로 받는 Kernel 함수로 남김 |
| D10 | 테스트의 층 교차: `mock/jobs.test.ts`·`mock/published-metrics.test.ts` → `pages/analytics/*`, `pages/metrics/data`. `kernel/url.test.ts`·`kernel/return-to.test.ts` → 실제 `MENUS` | 테스트를 원래 파일과 함께 옮기면 `mock-server → menu-*`, `kernel → menu-*` 역의존(런타임이 아니라 테스트 그래프의 순환) | 층 안의 단위 테스트와 교차 통합 테스트를 나눔. mock·메뉴 계산을 함께 보는 테스트는 해당 `menu-*`로, 실제 메뉴 목록이 필요한 URL·복귀 경로 테스트는 `apps/platform-web` 통합 테스트로. Kernel 단위 테스트는 fixture Registry 사용 |

D1–D8은 화면·런타임 코드, D9는 같은 폴더 안이라 폴더 구조로는 드러나지 않는 의존, D10은 테스트 그래프의 의존이다.

메뉴 간 직접 import는 `metrics/MetricDetail → metrics/MetricCatalog`(같은 그룹) 하나뿐이고, 교차 메뉴 이동은 이미 `linkTo(menuId)`로만 한다. 따라서 메뉴를 **그룹 단위 패키지**로 나눠도 추가로 끊을 의존은 없다.

## 3. 패키지 구성

루트에 pnpm workspace를 두고 세 갈래로 나눈다: `packages/`(플랫폼), `menus/`(Consumer), `apps/`(조립 지점). 이름 접두사는 Candidate `@ap/`.

| 패키지 | 06 갈래 | 내용(현재 파일 기준) | React | 의존 가능 |
| --- | --- | --- | --- | --- |
| `@ap/contracts` | Kernel 계약 | 순수 URL codec(`kernel/url.ts`에서 `safeReturnTo` 제외, D9), manifest **메타데이터** 타입(`MenuMeta`: `MenuEntry`에서 `icon`·`component`를 뺀 선언부, `ContextKey`, `Capability`, `PageType`, `Permission`), 응답·Trust envelope(`ApiResponse`, `Trust`, `Assessment`, `Outcome`), `AuditEvent`, `Text`(i18n 문자열 쌍) | 없음(타입 포함) | 없음 |
| `@ap/ui` | 공통 컴포넌트(UI Primitive) | `styles/tokens.css`, `ui/components/shadcn/*`, `Button`, `cn`, `StatusBadge`(`Tone`) | 있음 | 외부 라이브러리만 |
| `@ap/kernel` | Kernel 기능 | `PlatformProvider`/`usePlatform`/`PlatformLink`, `usePlatformQuery`, i18n Provider, Registry 런타임(`createRegistry`, `matchRoute`, `pathFor`, `safeReturnTo`), React binding 타입 `MenuEntry = MenuMeta & { icon: LucideIcon; component?: LazyExoticComponent<…> }`, `PlatformAdapter` 포트, 슬롯 등록 | 있음 | `contracts` |
| `@ap/components` | 공통 컴포넌트(Platform Component) + 차트 계약 + 레이아웃 | `PlatformPage`, `PlatformDataTable`, `DetailDrawer`, `AuditTimeline`, `DataTrustIndicator`, `StateView`, `StatCard`, `RadioGroup`, `AnalysisChartFrame`, `EChart` | 있음 | `contracts`, `kernel`, `ui` |
| `@ap/shell` | Kernel 기능(App Shell) | `AppShell`, `Sidebar`, `TopBar`, `CommandPalette`, `GlobalContextBar`, 계약 오류/미구현 화면(`App.tsx`의 fallback) | 있음 | `contracts`, `kernel`, `components`, `ui` |
| `@ap/mock-server` | (개발용) | `mock/world`, `mock/server`, `mock/jobs`와 이들만 보는 단위 테스트(`explicit-empty`, `time-domain`). `PlatformAdapter` mock 구현 | 없음 | `contracts` |
| `@ap/menu-<group>` | Consumer | `home`, `equipment`, `analytics`, `metrics`. 각 패키지가 `manifests`(여러 메뉴 가능)와 화면·도메인 컴포넌트·`api.ts`를 가진다 | 있음 | `contracts`, `kernel`, `components`, `ui` (+ `api.ts`에 한해 `mock-server`) |
| `apps/platform-web` | 조립 지점 | `main.tsx`, IA 설정(`GROUPS`, 향후 공간), 메뉴 등록, 어댑터 주입, dev 도구(역할 전환·응답 시나리오) | 있음 | 전부 |
| `tooling/*` | 개발 환경 | 공유 tsconfig, lint 설정(경계·계약 규칙), 메뉴 생성기 | — | — |

### 의존 방향

```text
                 contracts
        ┌──────────┼──────────────┐
        ▼          ▼              ▼
   (ui: 외부만)   kernel        mock-server
        │   ┌──────┤              │
        ▼   ▼      │              │
     components    │              │
        │          │              │
        ▼          ▼              │
      shell     menu-*  ◀─ api.ts ┘
        │          │
        └────┬─────┘
             ▼
     apps/platform-web
```

규칙:

1. 화살표 반대 방향 import 금지. 특히 `kernel`·`components`·`shell`은 `menu-*`와 `mock-server`를 import하지 않는다.
2. `menu-*`끼리 import 금지. 교차 메뉴 이동은 `linkTo(menuId, ...)`만 쓴다(06 §22).
3. `menu-*`에서 `mock-server` import는 그 메뉴의 `src/api.ts` 한 파일에서만 허용한다.
4. 각 패키지는 `package.json` `exports`로 공개 진입점만 연다. `@ap/components/src/...` 같은 깊은 경로 import 금지.
5. `contracts`는 React·브라우저 API에 타입 수준으로도 의존하지 않는다(향후 백엔드와 공유할 수 있게). 아이콘·화면 컴포넌트처럼 React 타입이 필요한 manifest 필드는 `kernel`의 `MenuEntry`가 소유한다.
6. 규칙 1–3은 테스트 파일에도 적용한다. 층을 넘는 검증은 그 위층(메뉴 또는 앱)의 통합 테스트로 둔다(D10).

## 4. Kernel 포트: `PlatformAdapter` (D2·D5 해소)

Kernel이 인터페이스를 정의하고 앱이 구현을 주입한다. 필드명은 Candidate이고, 현재 mock이 하는 일만 옮긴다.

```ts
// @ap/kernel
export type PlatformAdapter = {
  session(): Promise<User>;                                    // 현재 USERS[role]
  validateScope(scopeId: string, signal?: AbortSignal): Promise<ScopeCheck>;
  scopes(): Promise<Site[]>;                                   // TopBar 사이트 목록 (현재 SITES)
  contextOptions(scopeId: string): Promise<ContextOptions>;    // 조건 축(stgroup·team·makerModel) 선택지
  evaluateSelection(input: {                                   // GlobalContextBar 설비 풀·조건 판정
    scopeId: string; roomNames: IdSet; condition: Condition | null; selection: IdSet;
  }, signal?: AbortSignal): Promise<SelectionEvaluation>;
  publishedMetrics(): Promise<PublishedMetric[]>;              // metricId 단독 진입 보완
  defaultRangeTo(): string;                                    // 현재 DEFAULT_RANGE_TO
};

// 현재 GlobalContextBar.tsx:290 부근이 클라이언트에서 계산하는 값을 그대로 옮긴다
type SelectionEvaluation = {
  pool: EquipmentOption[];            // 허용 방 ∩ roomNames 안의 선택 후보
  inCondition: EquipmentOption[];     // 그중 condition에 맞는 설비(조건 결과 개수)
  outOfCondition: string[];           // 현재 selection 중 condition 밖 id(표시용)
};
```

- 역할 전환과 응답 시나리오 시뮬레이터(`setRole`, `setScenario`)는 **실서버에 없는 개발 기능**이다. `Platform` 컨텍스트에서 빼고 `apps/platform-web`의 dev 도구가 TopBar 슬롯에 붙인다. 운영 빌드에는 포함하지 않는다.
- `matchesCondition` 같은 조건 판정은 서버 책임이다. 셸은 조건·방·Selection이 바뀔 때 `evaluateSelection`을 다시 호출하고 결과(후보, 조건 결과 개수, 조건 밖 선택)만 표시한다. 이전 요청 결과를 새 결과로 보이지 않는 요청 수명주기는 `usePlatformQuery`와 같은 규칙을 따른다.

## 5. 메뉴 패키지 계약과 템플릿

메뉴 패키지 하나의 모양(생성기 `pnpm gen:menu <group>`이 만드는 것):

```text
menus/<group>/
  package.json          # name: @ap/menu-<group>, exports: "." 만
  src/
    index.ts            # export const manifests: MenuManifest[]
    api.ts              # 이 메뉴의 데이터 원천 유일 접점 (지금은 mock-server, 나중에 HTTP)
    pages/<Page>.tsx    # PlatformPage 위에 archetype 하나
    components/         # Domain Component (06 §13, 플랫폼으로 승격하지 않음)
    *.test.ts(x)
```

`manifests`의 각 항목은 `kernel`의 `MenuEntry`(= `contracts`의 `MenuMeta` + `icon` + `component`, 06 §5 선언)이고, 화면은 `component: lazy(() => import('./pages/X'))`로 지연 로드한다. 앱은 다음처럼 조립한다.

```ts
// apps/platform-web
const registry = createRegistry({ groups: GROUPS, menus: [...home.manifests, ...equipment.manifests, ...] });
```

`createRegistry`가 검증할 것(현재 코드는 일부를 런타임에만 암묵적으로 가정):

- 메뉴 `id`·`path` 중복 없음, `parent`가 존재하는 메뉴를 가리킴
- 그룹마다 `primary` 정확히 하나(08 §4 Candidate)
- `pageKeys`가 전역 Context 키와 겹치지 않음(06 §6.1)

생성기는 manifest 뼈대, archetype별 PlatformPage 예시, `api.ts`, 테스트 1개를 만들고 앱 등록 목록에 한 줄을 추가한다. 메뉴 템플릿이 Sidebar·Breadcrumb·권한 숨김을 직접 구현하지 못하게 하는 것은 06 §5 "금지" 목록을 lint로 옮겨 막는다(§6).

## 6. 경계 강제와 도구

| 항목 | 제안 | 비고 |
| --- | --- | --- |
| 패키지 관리 | pnpm workspace + Turborepo | FeedbackOps와 동일(pnpm 9 / turbo 2). 버전은 구현 시점 최신으로 |
| 내부 패키지 빌드 | 빌드 없이 TS 소스를 `exports`로 노출, 앱의 Vite가 번들 | 패키지별 `tsc --noEmit`으로 타입 경계 검사 |
| 경계 검사 | ESLint `no-restricted-imports` + 계약 규칙 | §3 규칙 1–4를 패키지별 설정으로 |
| 계약 lint | URL 직접 조립 금지(`?`/`&` 문자열 조합 대신 `linkTo`/`buildQuery`), `window.location` 직접 쓰기 금지, 메뉴 코드에서 `localStorage` 금지 | 인터뷰 기록의 "URL 직접 조립 금지 lint" |
| 테스트 | Vitest를 패키지별로. 기존 51개 테스트는 원래 파일과 같이 옮기되, 층을 넘는 테스트 파일은 D10대로 메뉴·앱 통합 테스트로 재배치 | 테스트 개수 합계가 줄지 않았는지 단계마다 확인 |
| CI | `platform-app` Job을 `pnpm -r typecheck test build` + lint Job으로 교체 | Node 26.7.0 유지 |

**결정 필요 — lint 도구:** FeedbackOps는 Biome을 쓴다. 제안은 ESLint다. 경계 규칙과 URL 조립 금지 같은 커스텀 AST 규칙이 필요한데, Biome 플러그인(GritQL)은 아직 이런 규칙을 쓰기에 제한적이기 때문이다. 포맷팅만 Biome으로 맞추는 혼합안도 가능하다.

## 7. 폴더 배치와 이행 순서

```text
/                        # 루트 package.json, pnpm-workspace.yaml (products/** 제외)
  apps/platform-web/
  packages/{contracts,ui,kernel,components,shell,mock-server}/
  menus/{home,equipment,analytics,metrics}/
  tooling/{tsconfig,eslint,gen-menu}/
  prototypes/            # 기존 단위 프로토타입은 그대로 둠
  products/feedbackops/  # 자체 workspace, 포함 안 함
```

각 단계는 별도 커밋(또는 PR)이며 매 단계 테스트 51개와 브라우저 동작이 그대로여야 한다.

1. **골격:** 루트 workspace·tooling 추가, `prototypes/platform-app`을 `apps/platform-web`으로 `git mv`(내용 변경 없음), CI 경로 수정.
2. **contracts 추출:** 먼저 `safeReturnTo`가 Registry를 인자로 받게 바꿔 `url.ts`의 Registry 의존을 끊고(D9), `MenuEntry`를 `MenuMeta`와 React binding으로 나눈 뒤, 순수 codec과 D3·D6·D7 타입을 이동. 런타임 변화 없음.
3. **Kernel 포트:** `PlatformAdapter` 도입, mock 구현 주입, dev 도구 분리(D2·D5 일부).
4. **ui → components → shell 순서로 추출:** PlatformPage Context Bar 슬롯(D4), GlobalContextBar·TopBar 어댑터 전환(D5).
5. **메뉴 패키지:** 그룹별로 `menus/*`로 이동, `api.ts` 도입(D8), Registry를 manifest 등록 방식으로(D1). 교차 테스트를 메뉴·앱 통합 테스트로 재배치하고 Kernel 테스트를 fixture Registry로 전환(D10).
6. **경계 lint와 생성기:** 규칙 켜고 CI에 추가, `gen:menu`로 빈 메뉴 하나를 만들어 검증한 뒤 삭제.

이 순서를 마치면 D1–D10이 모두 해소되고, 워크스페이스 층(06 §9.1)은 Registry `space` 필드와 셸 공간 전환기로 이 구조 위에 얹는다.

## 8. 사용자 확인 필요

1. 위 패키지 7종 구성과 의존 방향(§3)을 이대로 가져갈지.
2. 메뉴 패키지 단위: **그룹 단위**(제안, `menu-analytics`에 생산성 개요·사이클타임·실행 상세) vs 메뉴 단위.
3. `prototypes/platform-app`을 `apps/platform-web`으로 **옮길지**(제안, 이력 유지) vs 프로토타입은 동결하고 새로 복사할지.
4. lint 도구: ESLint(제안) / Biome / 혼합(§6).
5. 패키지 접두사 `@ap/`과 폴더명 `menus/`.
