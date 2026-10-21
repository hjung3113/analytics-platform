# SDK를 git 태그 의존성으로 소비하기 — 시험 결과와 소비자 조건

> 상태: **Candidate** — 2026-10-19 시험(#458). 사내에 패키지 레지스트리가 없어 FeedbackOps가 `@ap/ui`를 이 저장소의 **git 태그 의존성**으로 받기로 했다(사용자 2026-10-19, [`.planning/README.md`](../../.planning/README.md) 1번). 이 문서는 그 방식이 실제로 풀리는지와 소비자가 갖춰야 할 조건을 적는다. 태그 형식·발급은 [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md)의 묶음 릴리스를 따른다.

## 시험 조건

저장소 밖 임시 소비자(pnpm 11.1.1, Vite 8, Tailwind 4.3.3 + `@tailwindcss/vite`, TypeScript 5.9, React 19.3)가 이 저장소를 로컬 `file://` 클론의 태그로 받았다. 의존성 선언은 `"@ap/ui": "git+<저장소>#<태그>&path:/packages/ui"`다. 실제 원격(사설 GitHub, 사내 git 서버)과 소비자 개발 서버·테스트는 시험하지 않았다.

## 결과

| 확인 | 결과 | 소비자 조건 |
| --- | --- | --- |
| 하위 경로 패키지가 풀리는가 | 된다. `@ap/ui`의 `dependencies`에 `@ap/*`·`workspace:` 항목이 없어(`@ap/eslint-config`·`@ap/tsconfig`는 devDependencies) 다른 패키지를 끌어오지 않는다. 서브모듈은 받지 않는다 | `@ap/ui`가 `@ap/*` 런타임 의존을 갖게 되면 이 결과를 다시 확인한다 |
| TS 소스 export(`./src/index.ts`)로 빌드되는가 | 된다. Vite가 `node_modules`의 `.ts`·`.tsx`를 그대로 변환한다 | — |
| 소비자 `tsc --noEmit` | `@ap/ui` 소스가 `process.env.NODE_ENV`를 쓰므로(`components/Button.tsx`) 소비자 tsconfig에 `@types/node`가 필요하다. 그 밖의 오류는 없었다 | 소비자 `types`에 `node` 포함. 소스를 `tsc`가 통과시킬 `strict` 수준(`@ap/tsconfig/base.json`)이 소비자에도 필요한지는 미확인 |
| `@ap/ui/styles.css`와 클래스 스캔 | 된다. `styles/index.css`가 `@source "../"`를 가지고 있어 `node_modules` 안의 `@ap/ui` 소스 클래스(`inline-flex`, `h-8` 등)가 CSS에 생성된다. 소비자 CSS 첫 줄은 `@import "tailwindcss"`, 그다음 `@import "@ap/ui/styles.css"` | 이 순서를 지킨다(`index.css` 첫 주석) |
| `@tiptap/*` 버전 | **소비자가 고정해야 한다.** 잠금 없는 소비자는 starter-kit의 확장이 3.32.0으로 떠서 `@tiptap/core` 3.23.5와 어긋나 빌드가 `MISSING_EXPORT`로 실패한다 | 소비자에 `@tiptap/*` 22개 `overrides`를 3.23.5로(이 저장소 `pnpm-workspace.yaml`과 같음). FeedbackOps는 자기 잠금이 이미 3.23.5라 같은 잠금을 유지하면 된다 |
| `@formkit/auto-animate` 패치 | 소비자가 같은 `patchedDependencies`를 가져야 한다(패치가 `@ap/ui`와 함께 오지 않는다). FeedbackOps는 이미 같은 패치를 갖고 있다(`package.json`의 `pnpm.patchedDependencies`) | 패치 파일 내용이 `@ap/ui`와 같은지 전환 때 대조 |

테마 이름은 `@ap/ui/theme`의 `ThemeColorToken`·`THEME_COLOR_TOKENS`·`readColorToken`으로 소비하고, 도구는 `@ap/ui/theme-tokens.json`의 `color` 이름 목록을 읽는다. CSS는 계속 `rgb(var(--…))`로 쓰며, 제품 쪽 매핑 검사는 JSON 이름 목록과 대조한다. `$value.hex`는 매핑 키로 쓰지 않는다.

`sdk-v0.8.0`부터 `@ap/components`의 `token(name)`과 `ChartSeries.color`는 `string` 대신 `ThemeColorToken`을 받는다(ADR-0055). 런타임 문자열을 넘기는 호출자는 `isThemeColorToken(name)`으로 좁힌 뒤 부르거나, 자기 데이터 모델에 `ThemeColorToken`을 쓴다. 폐기 예고 없이 바꾼 이유: `@ap/components`를 저장소 밖에서 받는 소비자가 아직 없고(FeedbackOps·EV는 `@ap/ui`만 받는다, 2026-10-20 확인), 값과 출력 형식(`rgb(r,g,b)`)은 그대로다. 저장소 밖 소비자가 생긴 뒤의 같은 변경은 ADR-0044의 한 릴리스 예고를 따른다.

## 변경 기록

스냅샷 줄이 삭제되거나 바뀌면 같은 PR에서 이 표에 기록하고, [ADR-0044](../adr/0044-sdk-source-in-platform-repo-released-separately.md)에 따라 한 SDK 릴리스 전에 소비자에게 예고한다.

| 버전 | 패키지 | 바뀐 공개 API | 이전 방법 |
| --- | --- | --- | --- |
| 다음 릴리스 | contracts·kernel | `UsageEvent`에 선택 필드 `via`·`fromMenuId`, `navigate`·`PlatformLink`에 선택 `via` — 추가형 (#605) | 없음 — 기존 호출은 그대로 동작한다. 표시 없는 이동은 `link`로 기록된다 |
| `sdk-v0.11.0` | contracts | **깨짐** — `Condition`이 축 유니언(`{axis:'makerModel'…}`)에서 앱이 주입한 축의 다중값 맵 `Readonly<Record<string, readonly string[]>>`로 바뀌고 `ConditionAxis`가 없어짐(#552, ADR-0059) | 조건 값을 축 id → 값 목록 맵으로 만든다(축 간 AND·축 안 OR). 기존 링크는 플랫폼이 읽어 옮긴다 |
| `sdk-v0.11.0` | contracts | **깨짐** — `PlatformAdapter`에 필수 `listAxisOptions`·`searchEquipment`·`resolveSelection` 추가, `PortError`(#552, ADR-0059). `contextOptions`·`evaluateSelection`은 `@deprecated`(제거 아님) | 외부 어댑터가 세 메서드를 구현한다 |
| `sdk-v0.11.0` | contracts | **깨짐** — `ContextKey`에 `line`·`prcGroup`, `GlobalContext`·`SelectionInput`에 필수 `lineNames`·`prcGroups`·`membershipBasis`(#552) | 손으로 만든 `GlobalContext`·`Record<ContextKey, …>`에 새 필드·멤버를 더한다 |
| `sdk-v0.11.0` | kernel | **깨짐** — `QueryState.status`에 `'idle'`, 필수 `missing`·`completedAt`; `Platform`에 필수 `queryDraft`·`queryHistory`·`queryPolicy`(#553·#554, ADR-0061) | status를 빠짐없이 분기하는 `switch`에 `idle`을 더하고, 손으로 만든 `QueryState`·`Platform` mock에 필드를 채운다 |
| `sdk-v0.11.0` | kernel | 동작 — `query.mode: 'apply'` 메뉴에서 `useMenuQuery`·`useMenuFetch`·`ModuleHost.query`가 적용 조건·필수조건 게이트를 따른다. live 메뉴는 그대로 | 없음 — apply 모드를 선언한 메뉴만 |
| `sdk-v0.11.0` | components | **깨짐** — `AnalysisChart` 반환이 `JSX.Element \| null`(`topNBar.hideWhenEmpty`), `ChartSpec`에 `TopNBarSpec` 추가(#576, ADR-0064) | non-null로 받는 곳과 `never`로 끝나는 `switch (spec.kind)`를 고친다 |
| `sdk-v0.11.0` | components | `ChartPoint`·`ChartPointAction`·`AnalysisChartFrame` `pointActivation`/`pointActions`/`orientation`/`visibleSeriesIds`/`onVisibleSeriesChange`(#541, ADR-0063), `LaneTimeline`·`Timeline*`·`TopNBar*`(#576), `QueryBarExtension*`·`querySummary*`(#553), `PlatformPage` `queryBarExtension`/`queryResult`, `PageFilterBar mode` 추가. 드릴 깊이 상한 제거, `DrillPath`는 칩 5개 이상이면 접음 | 없음 — 추가만 |
| `sdk-v0.11.0` | contracts·kernel | 조회 포트·hook 추가: `QueryHistoryStore`·`QueryHistory*`·`compareQueryHistory`·`missingRequiredContext`·`requiredContextError`·`CONTEXT_FIELDS`(contracts), `useQueryDraft`·`useQueryHistory`·`useAxisOptions`·`useEquipmentSearch`·`useResolvedSelection`·`useEquipmentAxes`·`PaneQueryDraftProvider`, `PlatformProvider queryHistory?`(kernel), `MenuMeta.query?`·`EndpointSpec.requiredContext?`(#552–#554) | 없음 — 추가만 |
| `sdk-v0.11.0` | ui | `MultiCombobox*` 추가(#541) | 없음 — 추가만 |
| `sdk-v0.11.0` | shell | `QueryBar`·`QueryBarProps` 추가, `GlobalContextBar` 반환 타입 좁힘(호환) | 없음 |
| `sdk-v0.11.0` | contracts | `SpaceId`·`GroupId`에 `clas` 추가(#590) | `Record<SpaceId, …>`·`Record<GroupId, …>`나 빠짐없는 `switch`를 쓰는 소비자는 새 멤버를 더한다 |
| `sdk-v0.11.0` | contracts | `SpaceId`에 `log-dev`·`improvement`, `GroupId`에 `logMyWork`·`logModels`·`logCross`·`logRules`·`impMyWork`·`impTasks`·`impReports` 추가(#252, ADR-0065) | `Record<SpaceId, …>`·`Record<GroupId, …>`나 빠짐없는 `switch`를 쓰는 소비자는 새 멤버를 더한다 |
| `sdk-v0.10.0` | components | AnalysisSection.span·AnalysisLayout.density·차트 size 추가 | 없음 — 추가만 |
| `sdk-v0.10.0` | components | AnalysisChart·ChartSpec 추가 | 없음 — 추가만 |
| `sdk-v0.10.0` | components | LegendTree·LegendTreeNode·LegendTreeSort·LegendTreeProps 추가(#539) | 없음 — 추가만 |
| `sdk-v0.10.0` | components | chartTheme() 추가(#544) | 없음 — 추가만 |
| `sdk-v0.10.0` | ui | Checkbox 일부 선택(indeterminate) 표시 추가(#539) | 없음 — 추가만 |
| `sdk-v0.10.0` | components | ChartSpec에 scatter·boxPlot·pareto 추가 | 없음 — 추가만 |
| `sdk-v0.10.0` | ui | `useDetailPanelSlot(options?)` — 선택 옵션 `onSuperseded` 추가(하위 호환) | 없음 |
| `sdk-v0.11.0` | ui | `TransientOverlayScope` 추가 | 없음 — 추가만 |
| `sdk-v0.11.0` | kernel | `routeParamNames` 추가 | 없음 — 추가만 |
| `sdk-v0.11.0` | kernel | `paneHref` 추가 | 없음 — 추가만 |
| `sdk-v0.11.0` | kernel/testing | `memoryStorage` 추가 | 없음 — 추가만 |
| `sdk-v0.10.0` | kernel | `dropResetKeys` 제거 예고 | `withPaneContext` |
| `sdk-v0.10.0` | components | 차트 `size` 속성 타입에 이름 `ChartSize`(같은 union `'compact' \| 'hero' \| 'regular'`, #560) | 없음 — 같은 값 |
| `sdk-v0.10.0` | ui | `THEME_COLOR_TOKENS`·`ThemeColorToken`에 차트 역할 25개 추가(`chart-series-*`·`chart-heat-*`·`chart-status-*`·`chart-no-data*`·`chart-selection-outline`·`chart-median-on-fill`, #544) | 없음 — 추가만, 기존 이름 그대로 |
| `sdk-v0.8.0` | components | `token()`·`ChartSeries.color` → `ThemeColorToken` | `isThemeColorToken`으로 좁힌다 (ADR-0055) |

## Release tarball로 받기 (ADR-0056)

`@ap/ui` 말고 `@ap/kernel`·`@ap/components`·`@ap/shell`·`@ap/contracts`까지 받는 소비자(EV `platform-adapter`, 사내 메뉴)는 git 태그 `path:` 대신 **GitHub Release의 tarball**을 쓴다. 이유와 대안은 [ADR-0056](../adr/0056-sdk-release-github-release-tarballs.md)이다: 네 패키지는 서로를 `workspace:*`로 의존해 git `path:`로는 풀리지 않는다. 묶음 태그 `sdk-vX.Y.Z`마다 Release에 `ap-contracts-X.Y.Z.tgz`·`ap-kernel-…`·`ap-ui-…`·`ap-components-…`·`ap-shell-…`와 `SHA256SUMS`가 붙는다. 다섯 패키지는 같은 버전이고, tarball 안의 형제 의존은 그 버전으로 고정돼 있다. 내용은 ESM JS·`.d.ts`·CSS·`theme-tokens.json`뿐이라(TS 소스·tsconfig·테스트 없음) 소비자는 SDK 때문에 `@types/node`나 JSX 설정을 맞출 필요가 없다. 번들러(Vite·Vitest·webpack 계열) 소비자를 전제로 하며, `@ap/contracts`만 Node ESM에서도 그대로 읽힌다.

`package.json` (쓰는 패키지만 적는다. 아래는 다섯 모두를 쓰는 예):

```json
{
  "dependencies": {
    "@ap/contracts": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-contracts-X.Y.Z.tgz",
    "@ap/kernel": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-kernel-X.Y.Z.tgz",
    "@ap/ui": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-ui-X.Y.Z.tgz",
    "@ap/components": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-components-X.Y.Z.tgz",
    "@ap/shell": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-shell-X.Y.Z.tgz",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  }
}
```

`pnpm-workspace.yaml` — tarball 안의 형제 의존(`@ap/kernel@X.Y.Z` 등)을 같은 Release 파일로 풀고, 아래 소비자 조건을 건다:

```yaml
overrides:
  "@ap/contracts": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-contracts-X.Y.Z.tgz"
  "@ap/kernel": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-kernel-X.Y.Z.tgz"
  "@ap/ui": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-ui-X.Y.Z.tgz"
  "@ap/components": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-components-X.Y.Z.tgz"
  "@ap/shell": "https://github.com/hjung3113/analytics-platform/releases/download/sdk-vX.Y.Z/ap-shell-X.Y.Z.tgz"
  "@tiptap/core": 3.23.5
  # … 나머지 @tiptap/* 21개도 3.23.5로 (이 저장소 pnpm-workspace.yaml의 overrides와 같게)
patchedDependencies:
  "@formkit/auto-animate@0.10.0": patches/@formkit__auto-animate@0.10.0.patch
```

남는 소비자 조건:

- `@tiptap/*` 22개 `overrides`를 3.23.5로 고정하고 `@formkit/auto-animate@0.10.0` 패치를 갖는다(위 표와 같은 이유; tarball이 이 둘을 대신 해 주지 않는다).
- React 19: `react`·`react-dom`은 SDK 패키지의 peer다. 소비자가 한 벌만 설치한다(Provider·Context 짝이 한 사본이어야 한다). `@ap/kernel`도 한 벌이어야 하므로 위 `overrides`를 빼지 않는다.
- CSS: `@import "tailwindcss"` 다음에 `@ap/ui/styles.css`, `@ap/components/styles.css`, `@ap/shell/styles.css` 순서로 import한다. 각 파일의 `@source`가 tarball 안 `dist`를 스캔한다.
- `@ap/components/testing`은 `vitest`를 import한다(`vitest`는 선택 peer). 그 진입점을 쓰는 소비자만 `vitest`를 설치하면 된다. `@ap/kernel/testing`은 `vitest`가 필요 없다.
- 체크섬은 `SHA256SUMS`로 확인한다.

CI가 매 PR마다 같은 다섯 tarball을 만들고(`pnpm sdk:pack`), 깨끗한 임시 소비자가 위 조건 그대로 받아 `tsc --noEmit`(`@types/node` 없음)·Vite 빌드·CSS 클래스 생성·Vitest까지 통과해야 병합된다(`pnpm sdk:consumer-check`). 기존 `@ap/ui` git 태그 `path:` 경로(위 시험 결과)는 그대로 동작한다. tarball로 옮길지는 소비자(FeedbackOps) 판단이다.

## 결론과 남은 것

- git 태그 의존성은 **된다**. 결정(레지스트리 없이 태그)을 다시 열 이유는 시험에서 나오지 않았다.
- 소비자 조건은 둘이다: `@types/node`, 그리고 `@tiptap/*` overrides와 auto-animate 패치를 소비자가 이미 갖거나 갖추는 것. 둘 다 FeedbackOps 전환 작업의 수용 기준에 넣는다.
- 소비 묶음(#466, `sdk-v0.2.0`): FeedbackOps의 얇은 재수출에 맞춰 `@ap/ui`가 `@fops/ui`의 공개 이름 전부(`DetailPanelSlotContext` 제외)를 내보내고, shadcn 탭은 `TabsListBase`·`TabsTriggerBase`로, CSS는 `@ap/ui/styles/{tokens,semantic,theme,compat}.css`와 스캔용 `@ap/ui/styles/sources.css`로 받을 수 있다. `sdk-v0.1.0`에는 이 이름과 경로가 없다.
- 실제 전환 결과(FeedbackOps#1289, 1번 묶음): 소비자가 `@ap/ui`의 의존 범위(`^`)대로 받으면 radix가 새 버전으로 떠 동작이 바뀐다(Radix Tabs 1.2.x: 마우스다운에 `focus()`가 더해져 자동 활성화가 `onValueChange`를 두 번 부른다). 동작을 그대로 두려면 소비자가 `pnpm.overrides`로 radix·`lucide-react`를 이전 값에 고정한다. `@ap/ui`의 `react`·`react-dom` peer(`^19.3.0`)는 FeedbackOps(19.0.0)에서 경고를 낸다 — SDK 쪽 항목(#470).
- 시험하지 않은 것(전환 전 확인): 소비자 개발 서버·테스트, 사내 git 서버 접근(GitHub의 이 저장소는 공개라 인증이 필요 없다. 사내에서 GitHub에 닿는지 또는 사내 미러가 필요한지는 [#151](https://github.com/hjung3113/analytics-platform/issues/151)·[#232](https://github.com/hjung3113/analytics-platform/issues/232)와 함께 확인), 의존 `@ap/ui` 버전이 둘 이상일 때의 React Context 중복.
- 현재 다섯 SDK 패키지는 ADR-0056에 따라 빌드된 release tarball로 배포한다. tarball은 `dist`의 ESM JavaScript·`.d.ts`·CSS·JSON을 담으므로 소비자 번들러가 TypeScript 소스를 변환하도록 설정할 필요가 없다.

- React 하한(#470, 2026-10-19 결정, 되돌릴 수 있다): `@ap/ui`의 `react`/`react-dom` peer는 `^19.0.0`이다. SDK 자체 테스트는 19.3으로 돌고, 19.0.0에서는 소비자 FeedbackOps가 1~3번 묶음(#1289·#1291·#1295·#1299·#1304·#1307) 동안 단위 테스트와 시각 하네스 145/145를 통과시켜 확인했다. 그 사이에 19.0 미만에서 깨지는 API를 SDK가 쓰면 이 범위를 올리고 소비자 조건으로 기록한다.
