# §10.4 round trip — mock 통과

Synthetic browser fixture for `tests-kit/round-trip.spec.ts`. The spec copies this directory into the prepared external kit and starts a separate Vite server on a free loopback port. It uses only that kit's installed tarballs and toolchain. The normal kit entry and the real-adapter entry remain independent.

The Host injects two equipment axes (`chamberType`, `team`). The menu owns `rtAxis` and `rtFilter`; neither changes GlobalContext. One mock endpoint aggregates synthetic equipment facts by the selected axis and filters the facts by their condition. Its response supplies Trust and MeasureMeta, both rendered in the table.

The assembly injects the exported `createLocalSavedViewStore` from `@ap/mock-server`. Only actor/seed data is synthetic; storage, locking, validation and persistence use the real implementation. Save writes a menu view; restore lists stored views again after a reload and applies its page keys.

The transport intentionally ignores cancellation. The stale-response spec intercepts the first HTTP response, lets the newer response render, then releases the first response and checks the rendered rows after transport completion.

Decision: use a separate fixture server because the ordinary kit's mock adapter has no HTTP boundary to intercept. This is reversible by removing this fixture and its spec, and does not change SDK exports or defaults.

Host verification (the worker addendum prohibits local browser/E2E runs):

```sh
AP_SDK_KIT_DIR_FILE=/tmp/kit-directory pnpm sdk:consumer-check <new-pack-directory>
AP_SDK_KIT_DIR="$(cat /tmp/kit-directory)" E2E_KIT_PORT=4192 pnpm --filter @ap/platform-e2e exec playwright test --config playwright.kit.config.ts tests-kit/round-trip.spec.ts
```

The browser spec prepares this fixture inside the external kit. After that preparation, typecheck it with the external kit's `tsc --noEmit -p round-trip/tsconfig.json`; build with `vite build round-trip --config round-trip/vite.config.ts`. Completion is **mock 통과** only; this fixture does not verify a real server.

The mock accepts only axis ids that the mock equipment catalogue carries (`stgroup`, `team`, `maker`, `model`, `chamberType`). `chamberType` is the injected axis beyond the four built-in descriptors.
