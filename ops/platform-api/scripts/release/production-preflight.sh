#!/usr/bin/env bash
# Production preflight (#1266 b1b): static check of the env file for docker-compose.production.yml. No network,
# no Docker. Usage: production-preflight.sh <env-file>. Prints one line per problem; exits 1 if any, 2 on usage.
set -u

env_file="${1:-}"
if [ -z "$env_file" ] || [ ! -f "$env_file" ]; then
  echo "usage: production-preflight.sh <env-file>" >&2
  exit 2
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
demo_file="$here/../../.env.release.example"

# Read KEY=VALUE lines without sourcing (values are data, never executed). Last assignment wins; one pair of
# matching quotes is stripped.
read_env() {
  local file="$1" line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    [ "$key" = "$line" ] && continue
    val="${line#*=}"
    key="${key//[[:space:]]/}"
    case "$val" in
      \"*\") val="${val#\"}"; val="${val%\"}" ;;
      \'*\') val="${val#\'}"; val="${val%\'}" ;;
    esac
    printf '%s\t%s\n' "$key" "$val"
  done <"$file"
}

# bash 3.2 (macOS) has no associative arrays: keep the parsed pairs in strings and look keys up by function.
parsed="$(read_env "$env_file")"
demo_parsed=""
[ -f "$demo_file" ] && demo_parsed="$(read_env "$demo_file")"

lookup() { # key, pairs -> last value
  printf '%s\n' "$2" | awk -F'\t' -v k="$1" '$1 == k { v = $2; found = 1 } END { if (found) printf "%s", v }'
}
val_of() { lookup "$1" "$parsed"; }
demo_values() { printf '%s\n' "$demo_parsed" | awk -F'\t' 'NF >= 2 && $2 != "" { print $2 }'; }

problems=0
fail() { echo "preflight: $1"; problems=$((problems + 1)); }

secret_ok() { # name
  local name="$1" val demo
  val="$(val_of "$name")"
  if [ -z "$val" ]; then fail "$name is empty"; return; fi
  if [ "$val" = "CHANGE_ME" ]; then fail "$name is still CHANGE_ME"; return; fi
  while IFS= read -r demo; do
    if [ "$val" = "$demo" ]; then
      fail "$name equals a demo value from .env.release.example"; return
    fi
  done < <(demo_values)
}

for name in POSTGRES_PASSWORD OIDC_CLIENT_SECRET MINIO_ROOT_PASSWORD MINIO_ROOT_USER OIDC_CLIENT_ID; do
  secret_ok "$name"
done

issuer="$(val_of OIDC_ISSUER_URL)"
case "$issuer" in
  https://?*) [ "$issuer" = "https://CHANGE_ME" ] && fail "OIDC_ISSUER_URL is still a placeholder" ;;
  *) fail "OIDC_ISSUER_URL must start with https://" ;;
esac

redirect="$(val_of OIDC_REDIRECT_URI)"
case "$redirect" in
  https://?*)
    rest="${redirect#https://}"
    path="/${rest#*/}"
    [ "$rest" = "${rest#*/}" ] && path=""
    [ "$path" = "/auth/callback" ] || fail "OIDC_REDIRECT_URI path must be exactly /auth/callback"
    case "$redirect" in *CHANGE_ME*) fail "OIDC_REDIRECT_URI is still a placeholder" ;; esac
    ;;
  *) fail "OIDC_REDIRECT_URI must start with https://" ;;
esac

hops="$(val_of TRUSTED_PROXY_HOPS)"
if ! [[ "$hops" =~ ^[0-9]+$ ]] || [ "$hops" -lt 1 ]; then
  fail "TRUSTED_PROXY_HOPS must be an integer >= 1"
fi

ws="$(val_of WORKSPACE_ID)"
if ! [[ "$ws" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  fail "WORKSPACE_ID must be a UUID"
fi

[ "$problems" -eq 0 ] || exit 1
echo "preflight: ok"
