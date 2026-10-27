# Sourced, not run. The one list of shared paths (the merge.lock paths); tier.sh, shared-overlap.sh and merge-precheck.sh read it.
# Why one place: a hand-copied list drifts and a merge check then misses a shared change.
shared_re='^(tooling/sdk/api/|package\.json$|packages/sdk/(contracts|kernel|components|shell)/package\.json$|pnpm-lock\.yaml$|turbo\.json$|\.github/workflows/|apps/platform-e2e/)'
