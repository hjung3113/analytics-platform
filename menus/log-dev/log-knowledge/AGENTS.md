# @ap/menu-log-knowledge — a product, not a sample

This menu (log knowledge hub, epic #1192) is built to be used for real. Root `AGENTS.md` describes menu screens as samples that verify the platform; that rule does not limit this package.

- Build features to the product scope its issues and [`docs/search.md`](docs/search.md) set. "Touch a menu screen only as far as the platform contract it verifies" does not apply here. Reason: the sample rule would cut a product's features short, and its size is not a sign of over-building.
- Every other menu rule still applies ([`menus/AGENTS.md`](../../AGENTS.md)): package boundaries, no `@ap/menu-*` imports, SDK pieces before local code, version and CHANGELOG per change.
- A general-purpose piece found here still goes to the SDK by the root promotion rule; product scope does not make it menu-local.
- Permissions and API source: [`menus/AGENTS.md`](../../AGENTS.md) (`@ap/menu-log-knowledge` line) and [`docs/architecture/platform-api/api/log-knowledge.md`](../../../docs/architecture/platform-api/api/log-knowledge.md).
