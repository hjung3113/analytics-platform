# FeedbackOps path map (bash). The one place the tools learn where the FO apps and packages live; source it:
#   . "$(dirname "${BASH_SOURCE[0]}")/../paths.sh"      (adjust the depth to the caller)
# Values are repository-root relative. The repository root is two levels above this file (ops/platform-api/).
# 1098 b relocated the apps/packages to role-based folders (the four FO_* values); docs remain in docs/feedbackops.
FO_OPS=ops/platform-api
FO_BACKEND=apps/platform-api
FO_FRONTEND=apps/feature-screens
FO_SHARED=packages/feature-shared
FO_UI=packages/feature-ui
FO_DOCS=docs/feedbackops
FO_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
