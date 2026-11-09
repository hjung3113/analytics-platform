# archive/ — Kernel unit prototypes (preserved)

Independent prototypes that validated Kernel units one at a time before integration into `apps/platform-web`. Each is a separate project with its own npm lockfile, outside the pnpm workspace.

- `kernel-app-shell` (Unit A), `kernel-chart-frame` (Unit B), `kernel-platform-table` (Unit C): Vite + React.
- `kernel-context-url-scope`: Python URL codec reference implementation.
- `ops-platform-api-conductor`: conductor profile and addenda from the feature-repo era. Read-only record; current rules are in `.agents/conductor/`.

## Rules

- Add no new features here. Platform code goes in `packages/*`; assembly and screens in `apps/platform-web`.
- CI jobs (Unit A–C, Python codec) still run; make only the minimal fix when one breaks.
- READMEs and logs are the verification record of their time. Do not cite them as the basis of a current contract.
