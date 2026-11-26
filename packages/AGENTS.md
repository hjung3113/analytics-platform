# packages/ — common rules for platform packages

The source of boundaries and dependency direction is [package boundary](../docs/integration/platform-packages.md) §3. This file is a summary; on conflict follow that document.

## Rules for every package

- The only road to the server is `PlatformAdapter` ([package boundary](../docs/integration/platform-packages.md) §3-§4); do not add menu-vocabulary methods to the port.
- A package that uses Tailwind classes registers its own source with `@source` in `styles.css`, and the app `src/style.css` imports it. Add both when creating a package. A package without Tailwind (`mock-server`) has no `styles.css`.
- New tests go in the `__tests__/` folder of the feature folder they test ([ADR-0090](../docs/adr/0090-repo-structure-by-branch.md)).
- Build adapter stubs with `testAdapter({ … })`, never by hand.
- `@ap/components/testing/engines`: `mockEchartsCanvas`, `probeDockEngine` (engine seams registered with `vi.doMock` from inside the package, so tests outside it never import `echarts` or `dockview-react`). Call as `await vi.hoisted(async () => (await import('@ap/components/testing/engines')).fn())`.
- Export every new public API explicitly from `src/index.ts`.
- The `@ap/` prefix is provisional. Never put it in runtime strings (localStorage keys, event names).

## Verification

- For public API changes, follow [SDK change notes and release baselines](sdk/AGENTS.md).
- When you touch the release shape (package `exports`, CSS `@source`, `tsconfig.build.json`, a new file kind), run `pnpm sdk:pack --out <temp folder>` then `pnpm sdk:consumer-check <same folder>`.
