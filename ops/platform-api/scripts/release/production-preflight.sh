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

# Strict dotenv reader that mirrors what `docker compose --env-file` consumes for the forms accepted here, so the
# checks below see the value Compose will use. Values are data, never sourced or executed. Accepted: KEY=value,
# KEY="value", KEY='value', blank lines, full-line # comments, and a trailing " #..." comment after the value.
# Anything else is refused with one "!error<TAB>message" record naming the key (or the line number when no key
# can be read): `export KEY=...`, ${...}/$VAR interpolation, backslashes in double quotes, an unterminated
# (multi-line) quote, text after a closing quote, stray quotes in an unquoted value, duplicate keys.
read_env() { # file
  local file="$1" line key val n=0 seen=$'\n' rest
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    case "$line" in ''|'#'*) continue ;; esac
    if [[ "$line" =~ ^export[[:space:]] ]]; then
      printf '!error\tline %s: "export KEY=..." is not supported\n' "$n"; continue
    fi
    if ! [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_.-]*)=(.*)$ ]]; then
      printf '!error\tline %s: not a KEY=value line\n' "$n"; continue
    fi
    key="${BASH_REMATCH[1]}"; val="${BASH_REMATCH[2]}"
    case "$seen" in *$'\n'"$key"$'\n'*)
      printf '!error\t%s: duplicate key\n' "$key"; continue ;;
    esac
    seen="$seen$key"$'\n'
    case "$val" in
      \"*)
        if ! [[ "$val" =~ ^\"([^\"]*)\"([[:space:]]+\#.*|[[:space:]]*)$ ]]; then
          printf '!error\t%s: unterminated or malformed double-quoted value\n' "$key"; continue
        fi
        val="${BASH_REMATCH[1]}"
        case "$val" in *'$'*|*'\'*) printf '!error\t%s: interpolation or escapes are not supported\n' "$key"; continue ;; esac
        ;;
      \'*)
        if ! [[ "$val" =~ ^\'([^\']*)\'([[:space:]]+\#.*|[[:space:]]*)$ ]]; then
          printf '!error\t%s: unterminated or malformed single-quoted value\n' "$key"; continue
        fi
        val="${BASH_REMATCH[1]}"
        ;;
      *)
        rest="$val"
        if [[ "$rest" =~ ^(.*[^[:space:]])?[[:space:]]+\#.*$ ]]; then rest="${BASH_REMATCH[1]}"; fi
        if [[ "$val" =~ ^[[:space:]]*\#.*$ ]]; then rest=""; fi
        rest="${rest%"${rest##*[![:space:]]}"}"
        rest="${rest#"${rest%%[![:space:]]*}"}"
        case "$rest" in *'$'*) printf '!error\t%s: interpolation is not supported\n' "$key"; continue ;; esac
        case "$rest" in *'"'*|*"'"*) printf '!error\t%s: quote inside an unquoted value\n' "$key"; continue ;; esac
        val="$rest"
        ;;
    esac
    printf '%s\t%s\n' "$key" "$val"
  done <"$file"
}

# bash 3.2 (macOS) has no associative arrays: keep the parsed pairs in strings and look keys up by function.
parsed="$(read_env "$env_file")"
demo_parsed=""
[ -f "$demo_file" ] && demo_parsed="$(read_env "$demo_file" | awk -F'\t' '$1 != "!error"')"
if printf '%s\n' "$parsed" | awk -F'\t' '$1 == "!error"' | grep -q .; then
  printf '%s\n' "$parsed" | awk -F'\t' '$1 == "!error" { print "preflight: " $2 }'
  exit 1
fi

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

for name in POSTGRES_PASSWORD OIDC_CLIENT_SECRET MINIO_ROOT_PASSWORD MINIO_ROOT_USER MINIO_IMAGE OIDC_CLIENT_ID PLATFORM_APP_DB_PASSWORD PLATFORM_MIGRATE_DB_PASSWORD; do
  secret_ok "$name"
done

# DB login-role passwords sit unencoded in postgresql://user:pass@host URLs: restricted charset, and two different values.
for name in PLATFORM_APP_DB_PASSWORD PLATFORM_MIGRATE_DB_PASSWORD; do
  v="$(val_of "$name")"
  if [ -n "$v" ] && [ "$v" != "CHANGE_ME" ] && ! [[ "$v" =~ ^[A-Za-z0-9_-]{24,}$ ]]; then
    fail "$name must match ^[A-Za-z0-9_-]{24,}\$ (openssl rand -hex 24)"
  fi
done
if [ -n "$(val_of PLATFORM_APP_DB_PASSWORD)" ] && [ "$(val_of PLATFORM_APP_DB_PASSWORD)" != "CHANGE_ME" ] && [ "$(val_of PLATFORM_APP_DB_PASSWORD)" = "$(val_of PLATFORM_MIGRATE_DB_PASSWORD)" ]; then
  fail "PLATFORM_APP_DB_PASSWORD and PLATFORM_MIGRATE_DB_PASSWORD must differ"
fi

# Absolute https URL with a host, no userinfo, query or fragment. Prints the path (possibly empty) on success.
https_path() {
  local url="$1" rest authority
  case "$url" in https://?*) ;; *) return 1 ;; esac
  case "$url" in *[[:space:]?#@]*|*'\'*) return 1 ;; esac
  rest="${url#https://}"
  authority="${rest%%/*}"
  if [[ "$authority" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$ ]] ||
     [[ "$authority" =~ ^\[[0-9a-fA-F:.]+\](:[0-9]{1,5})?$ ]]; then
    [ "$authority" = "$rest" ] && { printf ''; return 0; }
    printf '/%s' "${rest#*/}"
    return 0
  fi
  return 1
}

issuer="$(val_of OIDC_ISSUER_URL)"
case "$issuer" in
  *CHANGE_ME*) fail "OIDC_ISSUER_URL is still a placeholder" ;;
  *) https_path "$issuer" >/dev/null || fail "OIDC_ISSUER_URL must be an absolute https URL with a host, no credentials, query or fragment" ;;
esac

redirect="$(val_of OIDC_REDIRECT_URI)"
case "$redirect" in
  *CHANGE_ME*) fail "OIDC_REDIRECT_URI is still a placeholder" ;;
  *)
    if path="$(https_path "$redirect")"; then
      [ "$path" = "/auth/callback" ] || fail "OIDC_REDIRECT_URI path must be exactly /auth/callback"
    else
      fail "OIDC_REDIRECT_URI must be an absolute https URL with a host, no credentials, query or fragment"
    fi
    ;;
esac

hops="$(val_of TRUSTED_PROXY_HOPS)"
if ! [[ "$hops" =~ ^[0-9]+$ ]] || [ "$hops" -lt 1 ]; then
  fail "TRUSTED_PROXY_HOPS must be an integer >= 1"
fi

# The edge is the only published service and trusts X-Forwarded-* from whoever reaches it: it must bind to a specific
# interface, or to all interfaces only with an explicit acknowledgement (a firewall then restricts EDGE_PORT).
edge_bind="$(val_of EDGE_BIND)"
# Every spelling of the IPv6 unspecified address (::, ::0, 0:0:0:0:0:0:0:0, bracketed or not) binds all interfaces.
edge_bare="${edge_bind#[}"
edge_bare="${edge_bare%]}"
edge_any=no
if [ "$edge_bind" = "0.0.0.0" ]; then
  edge_any=yes
elif [[ "$edge_bare" =~ ^[0:]+$ ]] && [[ "$edge_bare" == *:* ]] && [[ "$edge_bare" != *:::* ]] &&
  [[ "${edge_bare/::/}" != *::* ]] && ! [[ "$edge_bare" =~ 00000 ]]; then
  edge_any=yes
fi
if [ "$edge_any" = yes ]; then
  [ "$(val_of EDGE_BIND_ALL_INTERFACES_ACK)" = "yes" ] ||
    fail "EDGE_BIND binds all interfaces: bind the ingress-facing address, or set EDGE_BIND_ALL_INTERFACES_ACK=yes with a firewall allowing only the ingress"
fi
case "$edge_bind" in
  '') fail "EDGE_BIND is empty: set the interface only the company ingress reaches" ;;
  *CHANGE_ME*) fail "EDGE_BIND is still a placeholder" ;;
  *)
    if [ "$edge_any" = no ] && ! [[ "$edge_bind" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && ! [[ "$edge_bind" =~ ^\[[0-9a-fA-F:.]+\]$ ]]; then
      fail "EDGE_BIND must be an IPv4 address or a bracketed IPv6 address"
    fi
    ;;
esac

ws="$(val_of WORKSPACE_ID)"
if ! [[ "$ws" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  fail "WORKSPACE_ID must be a UUID"
fi

# Notification email: the channel is an explicit choice (compose has no default). Values are never echoed.
mock_notice=no
# The backend rejects any supplied SMTP_PORT that is not a positive integer, whatever the channel.
smtp_port="$(val_of SMTP_PORT)"
if [ -n "$smtp_port" ] && { ! [[ "$smtp_port" =~ ^[0-9]+$ ]] || [ "${#smtp_port}" -gt 5 ] || [ "$((10#$smtp_port))" -lt 1 ]; }; then
  fail "SMTP_PORT must be a positive integer when set"
fi
channel="$(val_of NOTIFICATION_EMAIL_CHANNEL)"
case "$channel" in
  mock) mock_notice=yes ;;
  smtp)
    [ -n "$(val_of SMTP_HOST)" ] || fail "SMTP_HOST is required when NOTIFICATION_EMAIL_CHANNEL=smtp"
    [ -n "$smtp_port" ] || fail "SMTP_PORT is required when NOTIFICATION_EMAIL_CHANNEL=smtp"
    [ -n "$(val_of SMTP_FROM)" ] || fail "SMTP_FROM is required when NOTIFICATION_EMAIL_CHANNEL=smtp"
    smtp_user="$(val_of SMTP_USERNAME)"
    smtp_pass="$(val_of SMTP_PASSWORD)"
    if [ -n "$smtp_user" ] && [ -z "$smtp_pass" ]; then
      fail "SMTP_PASSWORD is required when SMTP_USERNAME is set (both or neither)"
    elif [ -z "$smtp_user" ] && [ -n "$smtp_pass" ]; then
      fail "SMTP_USERNAME is required when SMTP_PASSWORD is set (both or neither)"
    elif [ -n "$smtp_pass" ]; then
      secret_ok SMTP_PASSWORD
    fi
    ;;
  *) fail "NOTIFICATION_EMAIL_CHANNEL must be mock or smtp" ;;
esac

# Out-of-repo menu assembly (#1881): with MENU_DECLARATIONS_FILE set the backend reads the bundle, its snapshot and the
# identity key from the two read-only mounts (container paths /menu-assembly and /menu-identity, host dirs
# MENU_ASSEMBLY_DIR and MENU_KEY_DIR, relative ones from ops/platform-api). Unset: nothing here applies.
host_dir() { # var-name, default -> absolute host path
  local d
  d="$(val_of "$1")"; [ -n "$d" ] || d="$2"
  case "$d" in /*) printf '%s' "$d" ;; *) printf '%s/../../%s' "$here" "${d#./}" ;; esac
}
menu_file_ok() { # var-name, container-prefix, host-dir
  local name="$1" prefix="$2" hostdir="$3" cpath
  cpath="$(val_of "$name")"
  if [ -z "$cpath" ]; then fail "$name is required when MENU_DECLARATIONS_FILE is set"; return 1; fi
  case "$cpath" in
    "$prefix"/*) ;;
    *) fail "$name must be under $prefix/ (the read-only mount)"; return 1 ;;
  esac
  case "$cpath" in *..*) fail "$name must not contain .."; return 1 ;; esac
  if [ ! -f "$hostdir/${cpath#"$prefix"/}" ] || [ ! -r "$hostdir/${cpath#"$prefix"/}" ]; then
    fail "$name: file not found or not readable on the host ($hostdir/${cpath#"$prefix"/})"
    return 1
  fi
  return 0
}
if [ -n "$(val_of MENU_DECLARATIONS_FILE)" ]; then
  assembly_dir="$(host_dir MENU_ASSEMBLY_DIR ./menu-assembly)"
  key_dir="$(host_dir MENU_KEY_DIR ./menu-assembly)"
  menu_file_ok MENU_DECLARATIONS_FILE /menu-assembly "$assembly_dir" || true
  menu_file_ok MENU_DECLARATIONS_SNAPSHOT_FILE /menu-assembly "$assembly_dir" || true
  if menu_file_ok MENU_IDENTITY_KEY_FILE /menu-identity "$key_dir"; then
    key_path="$key_dir/$(val_of MENU_IDENTITY_KEY_FILE | sed 's|^/menu-identity/||')"
    perm="$(stat -c '%a' "$key_path" 2>/dev/null || stat -f '%Lp' "$key_path" 2>/dev/null || echo 0)"
    case "$perm" in
      *[0-9]) [ "$(( 8#${perm: -1} & 4 ))" -eq 0 ] || fail "MENU_IDENTITY_KEY_FILE is world-readable (mode $perm): chmod 600" ;;
    esac
  fi
  [ -n "$(val_of MENU_IDENTITY_KEY_ID)" ] || fail "MENU_IDENTITY_KEY_ID is required when MENU_DECLARATIONS_FILE is set"
  systems="$(val_of PLATFORM_SYSTEMS_FILE)"
  case "$systems" in
    /menu-assembly/*) menu_file_ok PLATFORM_SYSTEMS_FILE /menu-assembly "$assembly_dir" || true ;;
  esac
fi

[ "$problems" -eq 0 ] || exit 1
[ "$mock_notice" = yes ] && echo "preflight: email disabled (mock): notifications reach the inbox only"
# The release topology is company TLS ingress -> edge -> backend (oidc-and-images.md «Hops»). With 1 the backend takes the
# edge's address for every request, so all anonymous requests share one rate-limit bucket. A warning, not a failure: a site
# without the ingress hop legitimately uses 1.
[ "$hops" = "2" ] || echo "preflight: warning: TRUSTED_PROXY_HOPS=$hops, the release topology (ingress -> edge -> backend) needs 2; with 1 all anonymous requests share one rate-limit bucket"
echo "preflight: ok"
