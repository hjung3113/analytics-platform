# FeedbackOps path map (bash). The one place the tools learn where the FO apps and packages live; source it:
#   . "$(dirname "${BASH_SOURCE[0]}")/../paths.sh"      (adjust the depth to the caller)
# Values are repository-root relative. The repository root is two levels above this file (ops/platform-api/).
# Feature documentation follows platform subject ownership (#1101).
FO_OPS=ops/platform-api
FO_BACKEND=apps/platform-api
FO_FRONTEND=apps/feature-screens
FO_SHARED=packages/feature-shared
FO_UI=packages/feature-ui
FO_DOCS=(docs/product/features docs/architecture/platform-api docs/design/features docs/design/history/feedbackops-prototype docs/user-guide/features docs/user-guide/history/feedbackops docs/adr/history/feedbackops docs/integration/history/feedbackops-local-development.md docs/integration/feature-code-index.md docs/agents/feature-implementation.md)
FO_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
