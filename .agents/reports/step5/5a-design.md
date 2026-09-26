# 5a — extract `@ap/mock-server`

Move `apps/platform-web/src/mock/*` into `packages/mock-server`. No behavior change. No `api.ts` (that is 5b). No `menus/*` (that is 5c). Do not touch `products/feedbackops`, `prototypes/`, `reports/`, `docs/reviews/`, `HANDOFF.md`, or `.agents/reports/` except this file.

Dependency direction: `@ap/contracts` → `@ap/mock-server` only. One export, `"."`. No deep imports (`@ap/mock-server/src/...`). The package must not depend on React. `apps/platform-web` may import it (it is the composition root, §3). `kernel` / `ui` / `components` / `shell` must not.

Sources today import only `@ap/contracts` plus sibling `./world`. No `className`, no `react`. Do not add `styles.css` or an app CSS `@source`. `platform:role` stays the localStorage key.

## 1. `git mv` (repo root)

```sh
mkdir -p packages/mock-server/src
git mv apps/platform-web/src/mock/world.ts    packages/mock-server/src/world.ts
git mv apps/platform-web/src/mock/server.ts   packages/mock-server/src/server.ts
git mv apps/platform-web/src/mock/jobs.ts     packages/mock-server/src/jobs.ts
git mv apps/platform-web/src/mock/adapter.ts  packages/mock-server/src/adapter.ts
git mv apps/platform-web/src/mock/adapter.test.ts        packages/mock-server/src/adapter.test.ts
git mv apps/platform-web/src/mock/explicit-empty.test.ts packages/mock-server/src/explicit-empty.test.ts
git mv apps/platform-web/src/mock/time-domain.test.ts    packages/mock-server/src/time-domain.test.ts
git mv apps/platform-web/src/mock/jobs.test.ts              apps/platform-web/src/jobs-population.test.ts
git mv apps/platform-web/src/mock/published-metrics.test.ts apps/platform-web/src/published-metrics.test.ts
```

Do not copy. After the moves, `apps/platform-web/src/mock/` is gone. Sibling imports inside the seven moved package files (`./server`, `./world`, `./adapter`, `./jobs`) stay as they are. Do not retarget them at `@ap/mock-server`.

`adapter.test.ts` (2), `explicit-empty.test.ts` (3), `time-domain.test.ts` (25) only import mock siblings + `@ap/contracts`. They stay package unit tests. They use `matchesCondition`, `evaluateTimeDomainMerge`, and the `TIME_DOMAIN_*` symbols via `./server` and `./world`. Those symbols stay **off** the public barrel.

## 2. Package files to add

`packages/mock-server/package.json` — same shape as `@ap/contracts`, plus a test script. No `build` (Turbo skips packages that lack the script; same as contracts). No `styles.css` export.

```json
{
  "name": "@ap/mock-server",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@ap/contracts": "workspace:*" },
  "devDependencies": {
    "@ap/tsconfig": "workspace:*",
    "jsdom": "^26.1.0",
    "typescript": "^5.9.3",
    "vitest": "^3.2.7"
  }
}
```

No `react`, `react-dom`, `@types/react`, `@testing-library/*`, or other `@ap/*`.

`packages/mock-server/tsconfig.json` — copy `packages/kernel/tsconfig.json` exactly: `{"extends":"@ap/tsconfig/base.json","include":["src","vitest.config.ts"]}`. Do **not** copy contracts' `"lib": ["ES2022"]`. `server.ts` uses `localStorage` and `DOMException`; base.json's DOM lib is required. No solution-style `references` exist anywhere; do not add any.

`packages/mock-server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] } });
```

`server.ts` does use `localStorage` (`ROLE_KEY = 'platform:role'`). `storedRole()` runs at module init (`let role = storedRole()`), which is **before** `beforeEach`. Node 26 + jsdom has no usable `localStorage` (Node's own global shadows jsdom and throws; HANDOFF). The existing `try/catch` hides that and returns `'engineer'`, so a missing stub can look green. Stub at setup-file top level, not only in `beforeEach`. Do not call `vi.unstubAllGlobals()`.

`packages/mock-server/src/test-setup.ts`:

```ts
import { vi } from 'vitest';

const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => { data.set(k, v); },
  removeItem: (k: string) => { data.delete(k); },
  clear: () => data.clear(),
  key: () => null,
  get length() { return data.size; },
});
```

Leave vitest `isolate` at the default (`true`) so each file gets a fresh `role` singleton. No jest-dom import (these tests do not use DOM matchers). jsdom is a devDependency only, because that is the environment these tests already pass in (`apps/platform-web/vite.config.ts`).

`packages/mock-server/src/index.ts` — explicit names only. No `export *`. This is every symbol imported by `apps/platform-web` pages, `main.tsx`, `DevTools.tsx`, and the two tests that stay in the app:

```ts
export { mockAdapter } from './adapter';

export {
  CYCLE_VERSION_NOTE, DATA_THROUGH, bucketStart, cycleMinutes, jobPercentile,
  jobsForEquipmentDay, jobsInPeriod, observableHours, type Grain, type Job,
} from './jobs';

export {
  getRole, getScenario, periodHours, resolveEquipment, serve, setRole, setScenario,
  subscribeServer, type Scenario,
} from './server';

export { EQUIPMENT, PUBLISHED_METRICS, USERS, type Equipment, type RoleId } from './world';
```

`PUBLISHED_METRICS` is on the barrel only because `published-metrics.test.ts` stays in the app until 5c. Do not also export `checkScope`, `validateScope`, `matchesCondition`, `evaluateTimeDomainMerge`, `SITES`, `DEFAULT_RANGE_TO`, or `TIME_DOMAIN_*`.

## 3. Cross-layer tests stay in the app (D10)

They import `pages/*`. Moving them into mock-server would make the package import the app. 5c moves them into menu packages. New paths sit next to `url-contract.test.ts` and `return-to.test.ts`.

`apps/platform-web/src/jobs-population.test.ts` (was `src/mock/jobs.test.ts`, 4 tests). Replace the four import lines with:

```ts
import { describe, expect, it } from 'vitest';
import { computeKpis, trendBuckets } from './pages/analytics/productivityData';
import { percentile, population } from './pages/analytics/cycleData';
import { cycleMinutes, EQUIPMENT, jobsInPeriod } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';
```

`apps/platform-web/src/published-metrics.test.ts` (was `src/mock/published-metrics.test.ts`, 3 tests). Replace imports with:

```ts
import { describe, expect, it } from 'vitest';
import { resolveMetric } from './pages/analytics/cycleData';
import { METRICS } from './pages/metrics/data';
import { classifyMetricInit as classify } from '@ap/kernel';
import { PUBLISHED_METRICS } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';
```

Keep the `classifyMetricInit` wrapper and every `it` body unchanged.

## 4. App import rewrites

Change only the module specifier. Keep names and aliases (`bucketStart as jobBucketStart`). Do not merge lines. Do not add `api.ts`. Pages keep calling `serve` directly.

| File | Old | New specifier |
| --- | --- | --- |
| `src/main.tsx` | `from './mock/adapter'` (`mockAdapter`) | `'@ap/mock-server'` |
| `src/dev/DevTools.tsx` | `from '../mock/server'` (`getRole, getScenario, setRole, setScenario, subscribeServer, type Scenario`) | `'@ap/mock-server'` |
| `src/dev/DevTools.tsx` | `from '../mock/world'` (`USERS, type RoleId`) | `'@ap/mock-server'` |
| `src/pages/home/OperationsHome.tsx` | `from '../../mock/server'` (`serve`) | `'@ap/mock-server'` |
| `src/pages/equipment/EquipmentMaster.tsx` | `from '../../mock/server'` (`serve`) | `'@ap/mock-server'` |
| `src/pages/equipment/EquipmentMaster.tsx` | `from '../../mock/world'` (`type Equipment`) | `'@ap/mock-server'` |
| `src/pages/equipment/EquipmentDetail.tsx` | `from '../../mock/world'` (`type Equipment`) | `'@ap/mock-server'` |
| `src/pages/equipment/data.ts` | `from '../../mock/world'` (`type Equipment`) | `'@ap/mock-server'` |
| `src/pages/equipment/data.ts` | `from '../../mock/server'` (`serve`) | `'@ap/mock-server'` |
| `src/pages/metrics/MetricCatalog.tsx` | `from '../../mock/server'` (`serve`) | `'@ap/mock-server'` |
| `src/pages/metrics/MetricDetail.tsx` | `from '../../mock/server'` (`serve`) | `'@ap/mock-server'` |
| `src/pages/metrics/data.ts` | `from '../../mock/world'` (`EQUIPMENT`) | `'@ap/mock-server'` |
| `src/pages/analytics/ExecutionDetail.tsx` | `from '../../mock/server'` (`serve`) | `'@ap/mock-server'` |
| `src/pages/analytics/ProductivityOverview.tsx` | `from '../../mock/jobs'` (`CYCLE_VERSION_NOTE`) | `'@ap/mock-server'` |
| `src/pages/analytics/ProductivityOverview.tsx` | `from '../../mock/server'` (`periodHours, serve`) | `'@ap/mock-server'` |
| `src/pages/analytics/CycleTimeDrilldown.tsx` | `from '../../mock/jobs'` (`CYCLE_VERSION_NOTE`) | `'@ap/mock-server'` |
| `src/pages/analytics/CycleTimeDrilldown.tsx` | `from '../../mock/server'` (`getScenario, periodHours, resolveEquipment, serve`) | `'@ap/mock-server'` |
| `src/pages/analytics/productivityData.ts` | `from '../../mock/jobs'` (`bucketStart, DATA_THROUGH, jobPercentile, jobsInPeriod, observableHours, type Grain, type Job`) | `'@ap/mock-server'` |
| `src/pages/analytics/productivityData.ts` | `from '../../mock/world'` (`type Equipment`) | `'@ap/mock-server'` |
| `src/pages/analytics/cycleData.ts` | `from '../../mock/world'` (`EQUIPMENT, type Equipment`) | `'@ap/mock-server'` |
| `src/pages/analytics/cycleData.ts` | `from '../../mock/jobs'` (`bucketStart as jobBucketStart, cycleMinutes, jobPercentile, jobsForEquipmentDay, jobsInPeriod, type Job`) | `'@ap/mock-server'` |

No other `apps/platform-web/src` file imports `mock/`. Comments inside the moved `server.ts` / `adapter.ts` that mention `mock/` stay; they are outside this grep root.

## 5. Workspace wiring

- `apps/platform-web/package.json` `dependencies`: add `"@ap/mock-server": "workspace:*"` between `@ap/kernel` and `@ap/shell`. Runtime dep, not devDep (`main.tsx` imports it).
- `pnpm-workspace.yaml`: no edit. `packages/*` already includes the new folder.
- `turbo.json`: no edit. `typecheck` / `test` fan out by script name. No `build` script on this package.
- `.github/workflows/ci.yml`: no edit. `platform-workspace` already runs root `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Tsconfig project `references`: none in the repo. Do not add any.
- Root `package.json`: no edit.
- Run `pnpm install` at the root and commit `pnpm-lock.yaml`. Frozen CI fails without it. No Vite alias and no app `paths` entry; package `exports` plus the workspace symlink is enough.

## 6. Docs in the same PR

Edit only these:

1. `packages/AGENTS.md` — add a table row after `shell/`: `` `mock-server/` (`@ap/mock-server`) | 개발용 서버 대역(`world`·`server`·`jobs`·`mockAdapter`). 앱이 주입. Tailwind 없음 | `contracts` ``. Replace the "어느 패키지도 … mock을 import하지 않는다" sentence with: 어느 패키지도 앱(`apps/*`)이나 메뉴 화면을 import하지 않는다. `mock-server`는 `contracts`만 import한다. kernel·components·shell·ui는 `mock-server`를 import하지 않는다. On the Tailwind bullet, add: Tailwind를 쓰지 않는 패키지(`mock-server`)는 `styles.css`를 만들지 않는다.
2. `packages/mock-server/AGENTS.md` (new). State: dev server stand-in; kernel never imports it; `main.tsx` injects `mockAdapter`; files `world.ts`, `server.ts`, `jobs.ts`, `adapter.ts`, `index.ts`; deps are `@ap/contracts` only; no React; do not import pages or the app; cross-layer tests stay in the app until 5c; pages calling `serve` directly is the temporary 5a state; no `api.ts` in this package. Verify with `pnpm --filter @ap/mock-server test`, then root `pnpm typecheck && pnpm test && pnpm build`.
3. From `packages/mock-server/`: `ln -s AGENTS.md CLAUDE.md`. Symlink, not a copy.
4. `apps/platform-web/AGENTS.md` — replace the `src/mock/` bullet with: 서버 대역은 `packages/mock-server`(`@ap/mock-server`). 앱에 남는 것은 `main.tsx`의 `mockAdapter` 주입, `src/dev/DevTools.tsx`, 그리고 5c까지 둘 통합 테스트 `src/jobs-population.test.ts`·`src/published-metrics.test.ts`. Replace the D8 sentence with: 페이지는 아직 `@ap/mock-server`의 `serve`를 직접 호출한다(D8). `api.ts`는 5b이므로 새 호출처를 늘리지 않는다.
5. `apps/platform-web/README.md` — line 3: `src/mock/` → `@ap/mock-server`(`packages/mock-server`); `src/mock/adapter.ts`를 `main.tsx`가 주입 → `mockAdapter`를 `main.tsx`가 주입. Line 31 parenthetical: add `mock-server` to the packages pages must not edit. Line 44: `` `src/mock/world.ts`의 `EQUIPMENT` `` → `` `packages/mock-server`의 `EQUIPMENT` ``.
6. `docs/integration/platform-packages.md` — §3 table row for `@ap/mock-server` is already correct; do not rewrite it. Banner (line 5): `5단계(메뉴 패키지)·6단계(경계 lint·생성기)가 남았다` → `5a(`@ap/mock-server` 추출) 완료. 5b(메뉴별 `api.ts`)·5c(메뉴 패키지)와 6단계(경계 lint·생성기)가 남았다`, and date `2026-09-26` → `2026-09-27` on that progress clause only. §7 item 5: split in place, do not mark 5b/5c done. 5a = this move, pages still call `serve`, cross-layer tests stay in the app. 5b = per-menu `api.ts` (D8, rule 3). 5c = `menus/*` + move those two tests into menu packages (D10 remainder). Leave the older "테스트 51개" sentence in the §7 intro; the gate is now 67 (below).
7. `docs/INDEX.md` — reading-path row "서버 계약·어댑터": folder cell becomes contracts → `packages/mock-server/AGENTS.md` → apps (주입·dev 도구). Code cell: `apps/platform-web/src/mock/adapter.ts` → `packages/mock-server/src/adapter.ts`. Line 83: `5–6단계 남음` → `5a(mock-server) 완료, 5b–5c·6단계 남음`.
8. `packages/contracts/AGENTS.md` line 19: `apps/platform-web/src/mock/adapter.ts` → `packages/mock-server/src/adapter.ts`.

## 7. Acceptance

From the repo root, in order: `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build`. All four must succeed.

Test total stays **67**. New split (counted from current `it(` bodies: time-domain 25, not 24):

| Package | Tests |
| --- | --- |
| `@ap/kernel` | 13 (unchanged) |
| `@ap/components` | 3 (unchanged) |
| `@ap/mock-server` | 30 = adapter 2 + explicit-empty 3 + time-domain 25 |
| `@ap/platform-web` | 21 = url-contract 11 + return-to 3 + jobs-population 4 + published-metrics 3 |
| Total | 67 |

`ui`, `shell`, `contracts` have no `test` script. Do not add tests.

CSS selector set unchanged (HANDOFF command). Capture before the move and diff after `pnpm build`. Mock has no Tailwind, and `src/style.css` is not edited, so the sets must be identical. Do not assert a hardcoded count (4d already added `.underline`).

```sh
tr '}' '\n' < apps/platform-web/dist/assets/*.css | sed 's/{.*//' | tr ',' '\n' | grep '^\.' | sort -u > /tmp/selectors.txt
```

```sh
grep -rn "mock/" apps/platform-web/src ; echo "exit:$?"
```

Expected: no output, `exit:1`. Also `test ! -d apps/platform-web/src/mock`.

`grep -rn "@ap/mock-server" packages/kernel packages/ui packages/components packages/shell packages/contracts` → no matches. `packages/mock-server/package.json` `dependencies` is exactly `@ap/contracts`.

## 8. Decisions and risks

- **React: no.** Confirmed: the four sources do not import it. Do not add it "because jsdom". jsdom is test-only.
- **Barrel is narrow** (section 2). Colocated tests reach private symbols by relative import. A wide `export *` would publish `evaluateTimeDomainMerge` and `checkScope`.
- **Rule 3 is not in force yet.** `menu-*` does not exist, so pages importing `@ap/mock-server` directly is allowed for 5a. Do not sneak in `api.ts`.
- **Module-init `role`.** The stub must run in `setupFiles` before `server.ts` evaluates. Resetting localStorage in `afterEach` without resetting the module `role` desyncs them; do not.
- **Lockfile.** Hand-editing `package.json` without `pnpm install` breaks CI `--frozen-lockfile`.
- **Do not "fix"** historical `src/mock` paths in `apps/platform-web/reports/` or `docs/reviews/`.
- **Non-blocking:** `HANDOFF.md` still describes step 5 as one lump and mock as living in the app. Left unchanged on purpose (session handoff, not this PR's doc list).
