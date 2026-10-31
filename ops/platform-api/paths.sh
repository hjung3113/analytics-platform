# Feature path map (bash). The one place the tools learn where the screen apps and packages live; source it:
#   . "$(dirname "${BASH_SOURCE[0]}")/../paths.sh"      (adjust the depth to the caller)
# Values are repository-root relative. The repository root is two levels above this file (ops/platform-api/).
# Feature documentation follows platform subject ownership (#1101).
FEATURE_OPS=ops/platform-api
FEATURE_BACKEND=apps/platform-api
FEATURE_FRONTEND=apps/feature-screens
# The platform assembly that serves the feature screens in real mode (ADR-0097); app-preview.py previews it.
PLATFORM_FRONTEND=apps/platform-web
FEATURE_SHARED=packages/feature-shared
FEATURE_UI=packages/feature-ui
FEATURE_DOCS=(docs/product/features docs/architecture/platform-api docs/design/features docs/design/history/feedbackops-prototype docs/user-guide/features docs/user-guide/history/feedbackops docs/adr/history/feedbackops docs/integration/history/feedbackops-local-development.md docs/integration/feature-code-index.md docs/agents/feature-implementation.md)
FEATURE_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
