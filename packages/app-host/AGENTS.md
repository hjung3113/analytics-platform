# @ap/app-host

The Host assembly function ([host contract](../../docs/design/host-entry-contract.md) §3): `startAppHost` mounts what an assembler injects. Release unit 2; not in `SDK_PACKAGES`.

## Rules

- Import only `@ap/contracts`, `@ap/kernel` (+ `@ap/kernel/host`), `@ap/components`, `@ap/ui`, `@ap/shell` (lint preset `appHost`). Never a menu, `@ap/feature-bridge`, `@eqv/*`, `@ap/mock-server` or `@ap/http-adapter`: the assembler injects those.
- Domain-free: no space, menu or permission names, no `import.meta.env`, no Vite alias such as `#platform-assembly`, no font or CSS imports. Base path, assembly, slots and axes arrive as options.
- A registry rejection must surface as the Kernel's own `RegistryError` from `buildRegistry`; `startAppHost` shows `StartupFailure` (fixed copy, no error text).
- `styles.css` carries the `@source` line; the app's `src/style.css` imports it.
