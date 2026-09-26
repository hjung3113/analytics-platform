# 5c — menu packages (`menus/*`)

Start only after 5a and 5b are in the tree (pages import `./api`, not `@ap/mock-server`; `jobs-population.test.ts` imports mock symbols from `./pages/analytics/api`). This move does not change behavior, copy, or menu ids. Do not touch `products/feedbackops`, `prototypes/`, `reports/`, `docs/reviews/`, `HANDOFF.md`.

`GroupId` stays camelCase (`masterData`, `noticeVoc`). Package folders use the §7 hyphen names. Do not rename ids.

`pnpm-workspace.yaml` already lists `menus/*`. Do not edit it. `turbo.json` and `.github/workflows/ci.yml` need no edit. Run `pnpm install` and commit `pnpm-lock.yaml` (CI uses `--frozen-lockfile`). No package gets a `build` script.

## 1. `none` / `noFeatures` — duplicate, do not extract

Copy these two locals into each group's `src/index.ts`. Do not export them. Do not add them to `@ap/contracts` or `@ap/kernel`.

```ts
const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
```

06 §24: this is a repeated literal, not a shared behavior. `Record<ContextKey, Capability>` already fails typecheck if a key is dropped, so seven copies cannot drift silently. A helper would be a new platform API with one consumer shape.

## 2. `git mv` (repo root, after 5b)

```sh
mkdir -p menus/{home,equipment,analytics,metrics}/src/pages menus/{master-data,notice-voc,admin}/src
git mv apps/platform-web/src/pages/home/OperationsHome.tsx menus/home/src/pages/OperationsHome.tsx
git mv apps/platform-web/src/pages/home/api.ts            menus/home/src/api.ts
git mv apps/platform-web/src/pages/equipment/EquipmentMaster.tsx menus/equipment/src/pages/EquipmentMaster.tsx
git mv apps/platform-web/src/pages/equipment/EquipmentDetail.tsx menus/equipment/src/pages/EquipmentDetail.tsx
git mv apps/platform-web/src/pages/equipment/data.ts             menus/equipment/src/pages/data.ts
git mv apps/platform-web/src/pages/equipment/api.ts              menus/equipment/src/api.ts
git mv apps/platform-web/src/pages/analytics/ProductivityOverview.tsx menus/analytics/src/pages/ProductivityOverview.tsx
git mv apps/platform-web/src/pages/analytics/CycleTimeDrilldown.tsx   menus/analytics/src/pages/CycleTimeDrilldown.tsx
git mv apps/platform-web/src/pages/analytics/ExecutionDetail.tsx       menus/analytics/src/pages/ExecutionDetail.tsx
git mv apps/platform-web/src/pages/analytics/cycleData.ts              menus/analytics/src/pages/cycleData.ts
git mv apps/platform-web/src/pages/analytics/productivityData.ts       menus/analytics/src/pages/productivityData.ts
git mv apps/platform-web/src/pages/analytics/api.ts                    menus/analytics/src/api.ts
git mv apps/platform-web/src/jobs-population.test.ts                   menus/analytics/src/jobs-population.test.ts
git mv apps/platform-web/src/pages/metrics/MetricCatalog.tsx menus/metrics/src/pages/MetricCatalog.tsx
git mv apps/platform-web/src/pages/metrics/MetricDetail.tsx  menus/metrics/src/pages/MetricDetail.tsx
git mv apps/platform-web/src/pages/metrics/data.ts           menus/metrics/src/pages/data.ts
git mv apps/platform-web/src/pages/metrics/api.ts            menus/metrics/src/api.ts
```

Do not create empty `components/` directories. `apps/platform-web/src/pages/` is gone. Sibling imports (`./cycleData`, `./data`, `./EquipmentDetail`, `./MetricCatalog`) stay. Every `from './api'` under `src/pages/` becomes `from '../api'` (home `OperationsHome`; equipment `EquipmentMaster`, `EquipmentDetail`, `data.ts`; analytics `ProductivityOverview`, `CycleTimeDrilldown`, `ExecutionDetail`, `cycleData.ts`, `productivityData.ts`; metrics `MetricCatalog`, `MetricDetail`). `metrics/data.ts` has no api import after 5b.

`menus/analytics/src/jobs-population.test.ts` imports become:

```ts
import { computeKpis, trendBuckets } from './pages/productivityData';
import { percentile, population } from './pages/cycleData';
import { cycleMinutes, EQUIPMENT, jobsInPeriod } from './api';
import { emptyGlobal } from '@ap/contracts';
```

Leave the `it` bodies. The test does not touch `localStorage` or the DOM. Vitest `environment: 'node'`, no setup file, no jsdom. `server.ts` `storedRole()` already try/catches a missing `localStorage`.

## 3. `src/index.ts` — manifests only

One file per package. Paste the current `MENUS` objects for that group **verbatim** (labels, paths, `pageKeys`, `initializesMetric`, `navHidden`, `parent`, feature spreads). Only the `lazy` path changes. Screenless entries have **no** `component` and must not gain one.

| Package | `manifests` ids, in this order | `lazy(() => import(...))` |
| --- | --- | --- |
| `@ap/menu-home` | `home` | `./pages/OperationsHome` |
| `@ap/menu-equipment` | `equipment-master`, `equipment-detail` | `./pages/EquipmentMaster`, `./pages/EquipmentDetail` |
| `@ap/menu-master-data` | `master-process`, `master-recipe` | none |
| `@ap/menu-analytics` | `productivity-overview`, `cycle-time`, `execution-detail`, `wafer-journey` | `./pages/ProductivityOverview`, `./pages/CycleTimeDrilldown`, `./pages/ExecutionDetail`; wafer has no component |
| `@ap/menu-metrics` | `metric-catalog`, `metric-detail` | `./pages/MetricCatalog`, `./pages/MetricDetail` |
| `@ap/menu-notice-voc` | `notices`, `voc` | none |
| `@ap/menu-admin` | `admin-roles`, `admin-audit`, `admin-usage` | none |

```ts
export const manifests: MenuEntry[] = [ /* those objects */ ];
```

Groups with a component: `import { lazy } from 'react'` plus the icons that group uses today. Screenless: icons + `import type { MenuEntry } from '@ap/kernel'` + `import type { Capability, ContextKey } from '@ap/contracts'`. Do **not** re-export `resolveMetric`, `METRICS`, or pages. A static re-export from this file would load `cycleData` / `data.ts` when the app imports `manifests`, and the routes would no longer be lazy.

## 4. `package.json` / tsconfig / CSS

Shared header: `"private": true`, `"version": "0.0.0"`, `"type": "module"`, `"scripts": { "typecheck": "tsc --noEmit" }`. Analytics adds `"test": "vitest run"`. Exports `"."` → `./src/index.ts`. No `echarts` anywhere (charts stay behind `@ap/components`).

`peerDependencies` on all 7: `react` and `react-dom` `^19.3.0` (kernel's `MenuEntry` is a React type; pnpm must see the peer). `devDependencies` on all 7: `@ap/tsconfig`, `typescript` `^5.9.3`, `react`, `react-dom`, `@types/react`, `@types/react-dom` at the app's versions (`^19.3.0`).

| Package | `dependencies` beyond `@ap/contracts`, `@ap/kernel`, `lucide-react` `^1.48.0` |
| --- | --- |
| home | `@ap/components`, `@ap/ui`, `@ap/mock-server` |
| equipment | those three + `@tanstack/react-table` `^8.21.3` |
| analytics | those three + `@tanstack/react-table` |
| metrics | those three + `@tanstack/react-table` |
| master-data, notice-voc, admin | none (no `mock-server`, no ui, no components, no table) |

`@tanstack/react-table` is type-only (`ColumnDef`) but pnpm will not hoist it. Declare it on those three only.

Tsconfig: `{"extends":"@ap/tsconfig/base.json","include":["src"]}` except analytics, which also includes `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

Analytics `devDependencies` also get `vitest` `^3.2.7`. No other package gets a test script.

**Tailwind.** home, equipment, analytics, metrics each get `src/styles.css` containing only `@source "./";` and an export `"./styles.css": "./src/styles.css"`. Screenless packages get neither (no classes). App `src/style.css`, after the shell import:

```css
@import "@ap/menu-home/styles.css";
@import "@ap/menu-equipment/styles.css";
@import "@ap/menu-analytics/styles.css";
@import "@ap/menu-metrics/styles.css";
```

No other CSS edit. Missing an import drops selectors; an extra class string adds them. Do not restyle.

## 5. App assembly

`apps/platform-web/package.json` dependencies: add the seven `@ap/menu-*` at `workspace:*`. Drop `@tanstack/react-table` from the app if nothing left under `apps/platform-web/src` imports it. Keep `lucide-react` (GROUPS icons), `react`, and the existing `@ap/*` platform deps including `@ap/mock-server` (`main.tsx`, `DevTools.tsx`).

Replace `apps/platform-web/src/menus.ts` with GROUPS copied verbatim, then:

```ts
import { manifests as home } from '@ap/menu-home';
import { manifests as equipment } from '@ap/menu-equipment';
import { manifests as masterData } from '@ap/menu-master-data';
import { manifests as analytics } from '@ap/menu-analytics';
import { manifests as metrics } from '@ap/menu-metrics';
import { manifests as noticeVoc } from '@ap/menu-notice-voc';
import { manifests as admin } from '@ap/menu-admin';

export const MENUS: MenuEntry[] = [
  ...home, ...equipment, ...masterData, ...analytics, ...metrics, ...noticeVoc, ...admin,
];
export const registry = createRegistry({ groups: GROUPS, menus: MENUS });
```

Keep the name `MENUS`. `url-contract.test.ts` imports it; do not edit that test. `main.tsx` still imports `registry` from `./menus`.

`published-metrics.test.ts` stays in `apps/platform-web/src/` (coordinator: permanent app integration test). Rewrite only the two page imports, so index.ts stays lazy:

```ts
import { resolveMetric } from '../../../menus/analytics/src/pages/cycleData';
import { METRICS } from '../../../menus/metrics/src/pages/data';
```

That relative path is the one D10 exception. It is not an `@ap/menu-*/src/...` specifier. Do not "fix" it into a barrel export.

## 6. Docs

One `menus/AGENTS.md` plus `ln -s AGENTS.md CLAUDE.md` from `menus/`. No per-package AGENTS. State: each package exports `manifests` only; no `@ap/menu-*` imports another; `@ap/mock-server` only from that package's `src/api.ts`; screenless groups own their planned menus with no `component`; this move is not a license to add screens.

Also edit:

- Root `AGENTS.md` folder table: add `menus/` (Consumer packages). Change the apps row so it no longer says the app owns menu screens. The workspace sentence already says `menus/*`; drop "향후".
- `packages/AGENTS.md` line that says screens live in `apps/platform-web/src/pages` until step 5: they now live in `menus/<group>`.
- `apps/platform-web/AGENTS.md`: app keeps GROUPS, `createRegistry` concatenation, dev tools, adapter injection, `url-contract.test.ts`, `return-to.test.ts`, `published-metrics.test.ts`. It does not own `src/pages`.
- `apps/platform-web/README.md` page guide: paths `menus/<group>/src/pages`, data import `../api`, no cross-menu imports.
- `packages/mock-server/AGENTS.md`: `jobs-population` now lives in `@ap/menu-analytics`; `published-metrics` stays in the app.
- `docs/INDEX.md` menu-screen reading path: `menus/AGENTS.md`, then `menus/<group>/src/index.ts` and `src/pages/`. Code cell for components' consumers: `menus/*/src/pages`.
- `docs/integration/platform-packages.md` §7 item 5: mark **5 done** (5a mock-server, 5b `api.ts`, 5c these packages). Banner: 5 완료, 6(경계 lint·생성기)만 남음. Do not claim rule 3 is lint-enforced; that is step 6.

## 7. Acceptance

Root `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Total **67**:

| Package | Tests |
| --- | --- |
| `@ap/kernel` | 13 |
| `@ap/components` | 3 |
| `@ap/mock-server` | 30 |
| `@ap/menu-analytics` | 4 (`jobs-population`) |
| `@ap/platform-web` | 17 (url-contract 11, return-to 3, published-metrics 3) |

No new test file (the count stays 67). Other menu packages have no `test` script.

`vite-node` 3.2.4 has no `-e`. From `apps/platform-web`, write a throwaway (do not commit it; vitest will not pick up `*.check.ts`):

```sh
cat > src/menu-order.check.ts << 'EOF'
import { GROUPS, registry } from './menus';
console.log(GROUPS.map(g => g.id).join(' '));
console.log(registry.menus.map(m => m.id).join(' '));
EOF
../../node_modules/.pnpm/node_modules/.bin/vite-node src/menu-order.check.ts
rm src/menu-order.check.ts
```

Expected, exactly:

```text
overview equipment masterData analytics metrics noticeVoc admin
home equipment-master equipment-detail master-process master-recipe productivity-overview cycle-time execution-detail wafer-journey metric-catalog metric-detail notices voc admin-roles admin-audit admin-usage
```

```sh
grep -rn "from '@ap/menu-" menus ; echo "cross:$?"
grep -rn "@ap/mock-server" menus -g '!**/api.ts' ; echo "mock:$?"
```

Both greps print nothing (`cross` and `mock` exit 1). The four `src/api.ts` files are the only mock importers under `menus/`.

CSS selector diff against the 5b build is empty:

```sh
tr '}' '\n' < apps/platform-web/dist/assets/*.css | sed 's/{.*//' | tr ',' '\n' | grep '^\.' | sort -u
```

Browser (`pnpm dev`, http://127.0.0.1:5173), engineer, scope ICH. Sidebar top to bottom: 운영 개요, 설비관리, 기준정보관리, 생산성 분석, 지표관리, 공지·VOC, 관리·감사. Click 공정 마스터, 공지, 권한/역할: unimplemented state, not a crash. Then `/`, `/equipment` (open first row's detail), `/analytics/productivity` (KPI numbers), `/analytics/cycle-time` (export still downloads), one execution detail, `/metrics` → `cycle_time`. Switch role to viewer on productivity and back: previous numbers do not stick. Dev-tools scenario `error` still shows the error state, then restore `normal`.

## 8. Resolved vs open

Resolved: duplicate `none`/`noFeatures`; one `menus/AGENTS.md`; no per-package AGENTS; no barrel re-exports (lazy); `published-metrics.test.ts` stays in the app via relative paths; workspace already includes `menus/*`; no echarts; screenless packages get no CSS and no `api.ts`; `MENUS` stays exported so `url-contract.test.ts` is untouched.

No user decision blocks the implementer. Step 6 (import lint) is out of scope.

## 9. Coordinator override (2026-09-27) — replaces the `published-metrics.test.ts` part of §5 and §7

The relative `../../../menus/*/src/...` imports are deep imports (rule 4, and rule 6 applies rules to tests). Do not use them. The file's three `it` blocks each touch only one group, so split it instead of keeping a cross-menu test:

| `it` | New home | Imports |
| --- | --- | --- |
| "equals the catalog published pointers, in catalog order" | `menus/metrics/src/published-pointers.test.ts` | `METRICS` from `./pages/data`, `PUBLISHED_METRICS` from `./api` (add `PUBLISHED_METRICS` to `menus/metrics/src/api.ts` re-exports) |
| "confirms a published id and blocks unknown or unpublished" | stays in `apps/platform-web/src/published-metrics.test.ts` (kernel `classifyMetricInit` + `@ap/mock-server` `PUBLISHED_METRICS`; no menu import) | unchanged apart from dropping the two page imports |
| "does not fill a missing cycle_time version with the page default" | `menus/analytics/src/resolve-metric.test.ts` | `resolveMetric` from `./pages/cycleData`, `emptyGlobal` from `@ap/contracts` |

Keep every assertion byte-identical. `@ap/menu-metrics` gets `"test": "vitest run"`, `vitest` devDependency, the same node `vitest.config.ts` as analytics, and tsconfig include of `vitest.config.ts`.

Test split becomes: kernel 13, components 3, mock-server 30, menu-analytics 5 (jobs-population 4 + resolve-metric 1), menu-metrics 1, platform-web 15 (url-contract 11, return-to 3, published-metrics 1). Total 67.

Add to the §7 greps: `grep -rn "menus/" apps/platform-web/src --include='*.ts' --include='*.tsx' | grep -v "@ap/menu-"` prints nothing.
