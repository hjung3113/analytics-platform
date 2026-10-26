# FeedbackOps path map (bash). The one place the tools learn where the FO apps and packages live; source it:
#   . "$(dirname "${BASH_SOURCE[0]}")/../paths.sh"      (adjust the depth to the caller)
# Values are repository-root relative. The repository root is two levels above this file (ops/feedbackops/).
# Step 713p2 moves the apps and packages by changing the four FO_* values (and paths.mjs) only.
FO_OPS=ops/feedbackops
FO_BACKEND=products/feedbackops/apps/backend
FO_FRONTEND=products/feedbackops/apps/frontend
FO_SHARED=products/feedbackops/packages/shared
FO_UI=products/feedbackops/packages/ui
FO_DOCS=products/feedbackops/docs
FO_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
