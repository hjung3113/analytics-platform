# 6b — menu package generator (`pnpm gen:menu`)

Design only. One new package plus marker comments. Do not land a real menu: the probe menu is created, verified, and deleted, and the committed tree has no new `menus/<folder>`. No existing menu behavior changes. Do not edit `HANDOFF.md`.

Reading of §5 "archetype별 PlatformPage 예시": one invocation stamps **one** skeleton page whose manifest `pageType` is the chosen archetype. It does not emit five pages (that would be the "3개 이상 연속 제작" case, and `createRegistry` wants one primary).

## User decision

**D1 — May the generator create a sidebar group?** Recommend **no**. Implement this document as written.

`GroupId` in `packages/contracts/src/menu.ts` is the closed union `'overview' | 'equipment' | 'masterData' | 'analytics' | 'metrics' | 'noticeVoc' | 'admin'`. A new id does not typecheck until that union changes. A group also needs a ko/en label and a lucide icon in `GROUPS` (`apps/platform-web/src/menus.ts`). Sidebar order is `registry.groups`, an app IA choice. All seven ids already own a package (`overview` lives in `menus/home`, not `menus/overview` — historical; the generator must not invent a second mapping). The generator's job is the *next* group, after a human has added the union member and the `GROUPS` row.

The §7 "create then delete" check still happens. The **probe** (not the generator) inserts throwaway `genProbe` into `GroupId` and `GROUPS`, runs the generator, verifies, and reverts both edits. Committed `GroupId` / `GROUPS` stay the seven current ids.

If D1 is rejected: add `--with-group` (off unless passed) that inserts the `GroupId` member and a `GROUPS` row (`icon: LayoutDashboard`, labels from required `--group-ko` / `--group-en`) above the groups marker, and teach `--remove` to revert those two edits. Do not invent a third behavior. No other open decision.

## Resolved

- **Runtime.** `tooling/gen-menu` (`@ap/gen-menu`), TypeScript ESM, no emit. Node 26.7 runs it (`node tooling/gen-menu/src/cli.ts`); relative imports inside this package use `.ts` extensions. Menu output does **not** (every other menu omits extensions). No runtime dependency: `node:fs`, `node:path`, `node:util` `parseArgs`. Not a template engine and not an AST parser — three edits are marker line inserts plus one sorted JSON line. Devdeps only, copied from `@ap/eslint-config`: `@ap/eslint-config`, `@ap/tsconfig`, `@types/node@^26.6.3`, `eslint@^10.11.0`, `typescript@^5.9.3`, `vitest@^3.2.7`. Scripts: `lint` / `typecheck` (`tsc --noEmit`) / `test`. `tsconfig.json` extends `@ap/tsconfig/base.json` and includes `src` and `scripts`. `eslint.config.js`: `export { tooling as default } from '@ap/eslint-config';`. Vitest `environment: 'node'`, `include: ['src/**/*.test.ts']`. Root `package.json`: `"gen:menu": "node tooling/gen-menu/src/cli.ts"`. pnpm forwards args; docs show `pnpm gen:menu <group>` with no extra `--`.
- **Prefix.** `export const PACKAGE_PREFIX = '@ap/'` only in `tooling/gen-menu/src/prefix.ts`. Every specifier, including generated comments, is built from it — the listings in §3 are expanded probe output, not source to paste. A test fails if `src/**/*.ts` or `scripts/**/*.ts` other than `prefix.ts` contains `@ap/`. `package.json` name and devDependency are the §8 exceptions (not scanned). Generated files may contain the prefix (name / dependency / import).
- **Tooling lint allowlist is empty.** The generator must not import `@ap/kernel` or any workspace package. It checks `GroupId` and routes by reading source text.
- **One package, one menu, `primary: true`.** Does not add entries to an existing package. Does not create `components/`. `index.ts` exports only `manifests`.
- **Skeleton policy (all five archetypes, same TSX).** `pageKeys: []`. `context` all `'unsupported'`. `features` all `false`. `permission: 'platform:view'` (valid today; human replaces it before real use — no permission flag, no new union member). `requiresScope: false`. Page calls `serve` with `requiresScope: false`, `mergeTimeDomain: false`, no `role`, no `kinds`. Icon `LayoutDashboard`. Description equals the label. No `@ap/ui`, no `@tanstack/*`, no `echarts`.
- **Wiring appends.** Do not reorder existing imports, spreads, or CSS. Sidebar order is `GROUPS`, not spread order (`overview` → binding `home` is not derivable). `package.json` is the exception: insert in the contiguous `@ap/menu-*` block, lexicographic, always with a comma. Do not `JSON.stringify` the file.
- **Refuse to overwrite.** A second generate exits 1 and changes nothing. Not an upsert.
- **`--remove` exists.** Byte-match against re-rendered templates. Manual deletion is only the fallback when `--remove` refuses. The generator does not run `pnpm install`; stdout ends with `next: pnpm install`.
- **Probe is not a turbo/CI task.** CI runs the committed suite only.

## 1. CLI

```text
pnpm gen:menu <group> [--menu <id>] [--label-ko <s>] [--label-en <s>]
                      [--path <route>] [--page-type <archetype>] [--dry-run] [--root <dir>]
pnpm gen:menu --remove <group> [--dry-run] [--root <dir>]
```

| Input | Rule |
| --- | --- |
| `<group>` | Required positional. camelCase `/^[a-z][a-zA-Z0-9]*$/`, not a reserved word, kebab has no leading/double hyphen. `masterData` → folder `master-data`, package `${PREFIX}menu-master-data`, import binding `masterData` (camelCase of the folder, which equals the group id). Reject `master-data`, `MasterData`, `HTMLParser`. |
| `--menu` | Default: the folder kebab (`gen-probe`). kebab-case `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`, matching `metric-catalog`. Page name: hyphen parts capitalized (`gen-probe` → `GenProbe`). |
| `--label-ko`, `--label-en` | Required on generate (including dry-run). Non-empty. Reject `'`, `\`, CR, LF so the template can use single-quoted literals. Korean is fine. |
| `--path` | Default `/<folder>` (`/gen-probe`). Reject `/` (home owns that shape). Each segment is `[a-z0-9]+(-[a-z0-9]+)*` or `:[a-z][a-zA-Z0-9]*`. No `?`, `#`, `\`, whitespace, empty segment. |
| `--page-type` | Default `overview`. One of `overview` \| `analysis` \| `management` \| `catalog` \| `workflow`. |
| `--dry-run` | Validate and print paths plus the four edit lines. Write nothing. Exit 0. With `--remove`, print what would be deleted. |
| `--root` | Default: walk up from the cli file for `pnpm-workspace.yaml`. Tests pass a temp root. Refuse a root without that file. |

stderr prefix `gen:menu:`. Exit 0 success or dry-run. Exit 1 validation, usage, or a refused remove. First error wins. No writes until every check below has passed.

Generate checks, in order: flag clashes (`--remove` with label/menu/path/page-type); shapes; labels; path; root; markers present (section 4); group id is a quoted member of the `GroupId` line **and** `id: '<group>'` appears above `// </gen:menu-groups>`; no `menus/*/src/index.ts` already contains `group: '<group>'` (this rejects `overview`, owned by `menus/home`); `menus/<folder>` absent; menu id and path **shape** (parameter names erased to `:`) not already in any `id: '…'` / `path: '…'` in those index files; binding `manifests as <binding>` not already imported; dependency line not already present. Textual scans are quote-bounded so `admin` does not match `adminExtra`. Do not put `group: '…'` in comments.

Errors name the offending file: unknown group (tell the human to edit `GroupId` and `GROUPS`; the generator will not); group not in the union; group already owned; folder exists; unknown page type; bad group id; bad menu id; id taken; bad path; path shape collision (name the other menu id); bad label; missing marker; non-contiguous menu dependency block.

`--remove` checks: folder exists; `.gen-menu.json` parses and its `group` matches; re-rendered files equal disk; each stored insert line is still present; no directory entry other than the known files and `node_modules`. Else exit 1 and delete nothing (`--remove: <path> was edited` / `unexpected file` / `not a generated package`). A missing insert during rollback-after-a-failed-write counts as already gone. Second remove (folder gone) exits 1.

Write order: package files including `.gen-menu.json`, then the three app edits. If an edit throws, run the remove routine and exit 1.

`.gen-menu.json` stores only inputs (`group`, `folder`, `menuId`, `page`, `path`, `pageType`, `labelKo`, `labelEn`, `binding`). Insert lines are derived. LF, trailing newline, UTF-8.

## 2. Markers (this PR, behavior-neutral)

`apps/platform-web/src/menus.ts` — wrap the existing imports; split the one spread line onto one binding per line, same order; add the groups end marker. Do not reorder.

```ts
// <gen:menu-imports>
import { manifests as home } from '@ap/menu-home';
// …equipment, masterData, analytics, metrics, noticeVoc, admin, unchanged…
// </gen:menu-imports>
```

```ts
export const GROUPS: GroupDef[] = [
  // …seven rows, unchanged…
  // </gen:menu-groups>
];
export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
  ...home,
  ...equipment,
  ...masterData,
  ...analytics,
  ...metrics,
  ...noticeVoc,
  ...admin,
  // </gen:menu-spreads>
];
```

`apps/platform-web/src/style.css` — platform `@import`s stay **outside**. Menu imports move inside, same order:

```css
@import "@ap/shell/styles.css";
/* <gen:menu-styles> */
@import "@ap/menu-home/styles.css";
@import "@ap/menu-equipment/styles.css";
@import "@ap/menu-analytics/styles.css";
@import "@ap/menu-metrics/styles.css";
/* </gen:menu-styles> */
```

Generator inserts **above the end marker only** (import, `  ...binding,`, `@import "…/styles.css";`). It never writes a `GROUPS` row. `package.json` insert: one line `    "<pkg>": "workspace:*",` in lexicographic order inside the contiguous `menu-*` dependency lines (`gen-probe` lands between `menu-equipment` and `menu-home`). All of those lines already have commas because `@ap/mock-server` follows the block.

## 3. Emitted files

Substitution for the probe: group `genProbe`, folder `gen-probe`, menu `gen-probe`, page `GenProbe`, path `/gen-probe`, pageType `overview`, labels `생성 확인` / `Gen probe`, binding `genProbe`, pkg `${PREFIX}menu-gen-probe`. Same bytes for every other group with those fields replaced. Versions match `menus/home`.

`package.json` — deps are what the template imports. `@types/node` is the known `menus/AGENTS.md` debt (`@ap/ui` `process.env` is reachable through `@ap/components`). No `@ap/ui` dependency. No `build` script.

```json
{
  "name": "@ap/menu-gen-probe",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts", "./styles.css": "./src/styles.css" },
  "scripts": { "lint": "eslint .", "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": {
    "@ap/components": "workspace:*",
    "@ap/contracts": "workspace:*",
    "@ap/kernel": "workspace:*",
    "@ap/mock-server": "workspace:*",
    "lucide-react": "^1.48.0"
  },
  "peerDependencies": { "react": "^19.3.0", "react-dom": "^19.3.0" },
  "devDependencies": {
    "@ap/eslint-config": "workspace:*",
    "@ap/tsconfig": "workspace:*",
    "@types/node": "^26.6.3",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "eslint": "^10.11.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "typescript": "^5.9.3",
    "vitest": "^3.2.7"
  }
}
```

`tsconfig.json`: `{"extends": "@ap/tsconfig/base.json", "include": ["src", "vitest.config.ts"]}`

`eslint.config.js`: `export { menu as default } from '@ap/eslint-config';`

`vitest.config.ts`: `import { defineConfig } from 'vitest/config';` / `export default defineConfig({ test: { environment: 'node' } });`

`src/styles.css`: `@source "./";`

`src/api.ts`: `export { serve } from '@ap/mock-server';` — the only mock-server import. The page imports `../api`. Tests are not exempt.

`src/index.ts` — among `@ap/*`, only `contracts` and `kernel` (6a). `react` and `lucide-react` are not `@ap`. No `sessionStorage`, no `window.location`, no hand-built query.

```ts
/** @ap/menu-gen-probe — genProbe group. Scaffold: one primary menu, no domain data. */
import { lazy } from 'react';
import { LayoutDashboard } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'gen-probe', primary: true, group: 'genProbe',
    label: { ko: '생성 확인', en: 'Gen probe' },
    description: { ko: '생성 확인', en: 'Gen probe' },
    path: '/gen-probe', icon: LayoutDashboard, permission: 'platform:view',
    requiresScope: false, context: none, pageType: 'overview', features: noFeatures, pageKeys: [],
    component: lazy(() => import('./pages/GenProbe')),
  },
];
```

`src/pages/GenProbe.tsx` — same file for every archetype; only `pageType` on the manifest changes. `PlatformPage` + `usePlatformQuery` + `QueryView`. The caption is the label, not domain data. `t-caption` / `text-text-muted` are why `styles.css` and the app `@import` exist.

```tsx
import { useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { PlatformPage, QueryView } from '@ap/components';
import { serve } from '../api';

export default function GenProbe() {
  const { global } = usePlatform();
  const { lang } = useI18n();
  const query = usePlatformQuery(signal => serve({
    global, signal, requiresScope: false, mergeTimeDomain: false,
    compute: () => ({ ready: true }),
    isEmpty: () => false,
  }));
  const caption = lang === 'ko' ? '생성 확인' : 'Gen probe';
  return <PlatformPage>
    <QueryView query={query}>{() => <p className="t-caption text-text-muted">{caption}</p>}</QueryView>
  </PlatformPage>;
}
```

`src/manifest.test.ts` — own package + `createRegistry` only. The fixture group reuses `manifests[0].icon`, so the test does not import `lucide-react`. One group in the fixture, so the "exactly one primary" rule is satisfied without the other six groups. Node environment (no jsdom, no Testing Library).

```ts
import { describe, expect, it } from 'vitest';
import { createRegistry, type GroupDef } from '@ap/kernel';
import { manifests } from './index';

describe('manifest', () => {
  it('is the only menu of its group and passes createRegistry', () => {
    expect(manifests).toHaveLength(1);
    const menu = manifests[0];
    expect(menu.primary).toBe(true);
    expect(menu.pageKeys).toEqual([]);
    expect(menu.pageType).toBe('overview');
    expect(menu.group).toBe('genProbe');
    const groups: GroupDef[] = [{ id: menu.group, label: { ko: 'g', en: 'g' }, icon: menu.icon }];
    const registry = createRegistry({ groups, menus: manifests });
    expect(registry.menuById('gen-probe').path).toBe('/gen-probe');
  });
});
```

Known file set for `--remove`: the nine files above plus `.gen-menu.json`. `node_modules` may appear after install and is deleted with the directory (`fs.rm` recursive). Any other extra file refuses the remove.

## 4. Verification

**Committed** (turbo picks up `@ap/gen-menu`; CI `platform-workspace` is unchanged). From the repo root, Node 26.7.0:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`tooling/gen-menu` tests, all in temp dirs except the locks:

1. Real repo, read-only: markers exist; spread bindings and `GROUPS` ids are the seven current ones in today's order; `GroupId` line is exactly the seven-member union; menu dependency block is contiguous and lexicographic; style menu imports are the four current lines inside the marker. `genProbe` is absent.
2. Prefix scan (section Resolved).
3. Temp workspace (tiny `pnpm-workspace.yaml`, `GROUPS` + `GroupId` already containing `genProbe`, markers, one existing menu index with a taken id and path): generate writes the file set and the four edits; bytes equal the templates; second generate exits 1 with bytes unchanged; `--dry-run` prints and writes nothing.
4. Each validation error exits 1 and writes nothing (unknown group, unknown page type, bad ids, existing folder, owned group, id collision, path-shape collision, missing marker, non-contiguous deps).
5. `--remove` on an untouched package restores the three app files and deletes the folder. A one-byte page edit makes `--remove` exit 1 and leave the tree. `--dry-run --remove` writes nothing.

Do not hardcode the 6a total of 141. After this PR, `pnpm test` is the previous count plus these generator tests. The probe's temporary test is gone before commit.

**Probe** (coordinator, once, not CI — commit the implementation first so the worktree is clean): `node tooling/gen-menu/scripts/probe.ts`. It imports `prefix.ts` / `generate.ts` (no `@ap` import). Sequence:

1. Exit 1 if `git status --porcelain` is non-empty.
2. Insert ` | 'genProbe'` before the semicolon of the `GroupId` line. Insert `  { id: 'genProbe', label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard },` immediately above `// </gen:menu-groups>` (`LayoutDashboard` is already imported).
3. `pnpm gen:menu genProbe --label-ko '생성 확인' --label-en 'Gen probe' --path /gen-probe --page-type overview`.
4. Write `apps/platform-web/src/gen-probe.test.ts` (probe-owned, not a generator template): import `registry` from `./menus`, expect `menuById('gen-probe')` has `group === 'genProbe'`, `path === '/gen-probe'`, `primary === true`, `pageKeys` deep-equal `[]`, and `groupById('genProbe')` returns. This is the registry check. Do not add `vite-node`.
5. `pnpm install`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. All must exit 0. No browser pass: nothing shipped is a new screen, and the menu is deleted in the same script.
6. `finally`, even on failure: revert the `GroupId` member, the `GROUPS` row, and `gen-probe.test.ts` (a missing file is fine). Run `--remove` and ignore exit 1 only when the folder is already gone; a byte-mismatch refusal stops the script and leaves the tree. Then `pnpm install`. `git status --porcelain` must be empty, else exit 1 and print it.

## 5. Docs (wording, not a rewrite)

- `tooling/AGENTS.md`: move `gen-menu/` into 현재 (`@ap/gen-menu`, `pnpm gen:menu`). Drop the 계획 heading. One sentence: it scaffolds a package for a group that is already in `GroupId` and `GROUPS`; it does not add sidebar groups; verify with the root four commands plus the probe.
- `menus/AGENTS.md`: short "새 그룹 패키지" — human adds the `GroupId` literal and a `GROUPS` row (label, icon), then `pnpm gen:menu <group> --label-ko … --label-en …`, then `pnpm install`. The result is a skeleton, not Domain Done. Do not generate real menus in batch. `overview` stays `menus/home`.
- `apps/platform-web/AGENTS.md`: one sentence on the `menus.ts` bullet — package wiring is the marker region and is done by `gen:menu`; `GROUPS` stays hand-written.
- `apps/platform-web/README.md` page guide, after the intro paragraph: a new group package comes from `pnpm gen:menu`; the page it writes is this skeleton (`PlatformPage`, `usePlatformQuery`, `QueryView`), not a domain screen. Point at `tooling/AGENTS.md`.
- `docs/integration/platform-packages.md`: banner — 6b done, step 6 complete. §5 tree lists the emitted files (including `eslint.config.js`, `tsconfig.json`, `vitest.config.ts`, `manifest.test.ts`, `.gen-menu.json`) and says `components/` is where later domain components go, not a generator output. §5 generator sentence: one skeleton, archetype = `pageType`; does not edit `GROUPS` or `GroupId`. §7 item 6b marked done (probe created a menu, verified, deleted; the tree does not keep it). §8: generator constant is `tooling/gen-menu/src/prefix.ts`.
- `docs/INDEX.md` line 83: 6a boundary lint and 6b generator both done (step 6 complete).
- Root `AGENTS.md` folder table, `tooling/` cell only: `공유 tsconfig·경계 lint·메뉴 생성기(\`pnpm gen:menu\`)`. No new principle.

## 6. Out of scope

No edit to existing menu runtime, kernel validation, `Permission`, or the seven `GroupId`s in the committed tree. No new CI job. No allowlist change. The implementation PR does not run `gen:menu` except via the probe, and the probe's menu is not in the diff. A generated skeleton is not a reason to generate the next one.
