# menus/log-dev/ — products, not samples

Every menu package in this group folder is built to be used for real: `log-analysis`, `log-cross`, `log-knowledge` (log knowledge hub, epic #1192), `log-models`, `log-my-work`, `log-rules`. Root `AGENTS.md` describes menu screens as samples that verify the platform; that rule does not limit these packages.

- Build features to the product scope their issues and docs set (for example [`log-knowledge/docs/search.md`](log-knowledge/docs/search.md)). "Touch a menu screen only as far as the platform contract it verifies" does not apply here. Reason: the sample rule would cut a product's features short, and its size is not a sign of over-building.
- Every other menu rule still applies ([`menus/AGENTS.md`](../AGENTS.md)): package boundaries, no `@ap/menu-*` imports, SDK pieces before local code, version and CHANGELOG per change. Planned-only groups (`log-cross`, `log-my-work`) still add screens only by a separate request.
- A general-purpose piece found here still goes to the SDK by the root promotion rule; product scope does not make it menu-local.
- Per-package permissions and API sources: [`menus/AGENTS.md`](../AGENTS.md) (for example the `@ap/menu-log-knowledge` line).
