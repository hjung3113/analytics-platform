# FeedbackOps path map (bash). The one place the tools learn where the FO apps and packages live; source it:
#   . "$(dirname "${BASH_SOURCE[0]}")/../paths.sh"      (adjust the depth to the caller)
# Values are repository-root relative. The repository root is two levels above this file (ops/feedbackops/).
# 713p2 moved the apps and packages to apps/fo-* and packages/fo-* (the four FO_* values); the docs stay until 713p3.
FO_OPS=ops/feedbackops
FO_BACKEND=apps/fo-backend
FO_FRONTEND=apps/fo-frontend
FO_SHARED=packages/fo-shared
FO_UI=packages/fo-ui
FO_DOCS=products/feedbackops/docs
FO_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
