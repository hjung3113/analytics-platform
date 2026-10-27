## analytics-platform addendum (AP addendum, base ref `origin/main`)

AP paths and examples for shared items:

- Item 2 (copy the rules): Sources of truth are the relevant section of `docs/contract/platform-ui-contract.md`, related ADRs, `packages/sdk/contracts`, `registry.ts`, and mock-server endpoint declarations (`MOCK_ENDPOINTS` in `apps/platform-web/src/dev/mock-assembly.tsx`, `PARAMS` in `server-conformance.test.ts`). Key count, required status, and scope must match these sources.
- Item 1: Include i18n keys in the named targets. Base prompt: saying only "Parse with common X" leaves the worker to invent X.
- Item 8: Name the test files the worker can run (E2E belongs to the coordinator).
- Item 11: Example: `pnpm patch --offline` is unavailable.
- Item 12: Example — ref/DOM access during render can fail.
- AP report format: Put the findings after the verdict line (`ready`/`fix brief`), ordered by review-round cost. End with the task file's sentinel.
