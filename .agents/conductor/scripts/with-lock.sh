#!/usr/bin/env bash
# Temporary shim (conductor-engine#223): the tool lives in the engine. Removed once no running lane depends on it.
if [ -z "${CONDUCTOR_MAIN:-}" ]; then
  if [ -n "${AP_MAIN:-}" ]; then CONDUCTOR_MAIN=$AP_MAIN
  else common=$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && CONDUCTOR_MAIN=$(dirname "$common"); fi
fi
export CONDUCTOR_MAIN
exec bash "$HOME/.agents/skills/issue-wave-conductor/scripts/lanes/$(basename "$0")" "$@"
