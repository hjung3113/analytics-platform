#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  bash tooling/scripts/capture-page.sh <name> <route> [--variant <value>] [--role <engineer|admin|viewer>] [--ready <selector>]
  bash tooling/scripts/capture-page.sh --clean <name>

Creates a temporary apps/platform-e2e/tests/zz-<name>.spec.ts file.
The default ready selector is "main h1"; screenshots capture the 1440x900 viewport in .review/<name>-shots/.
USAGE
}

script_dir="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
spec_dir="$repo_root/apps/platform-e2e/tests"

validate_name() {
  if [[ ! "$1" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    printf 'Invalid name: use lowercase letters, digits, and hyphens.\n' >&2
    exit 2
  fi
}

if [[ "${1:-}" == "--clean" ]]; then
  if [[ "$#" -ne 2 ]]; then
    usage >&2
    exit 2
  fi
  name="$2"
  validate_name "$name"
  spec="$spec_dir/zz-$name.spec.ts"
  if [[ ! -f "$spec" ]]; then
    printf 'Temporary spec not found: %s\n' "$spec" >&2
    exit 1
  fi

  if command -v trash >/dev/null 2>&1; then
    trash "$spec"
    printf 'Sent temporary spec to Trash: %s\n' "$spec"
  else
    trash_dir="${HOME:?HOME is required to move the spec to Trash}/.Trash"
    mkdir -p "$trash_dir"
    destination="$trash_dir/$(basename "$spec")"
    suffix=1
    while [[ -e "$destination" || -L "$destination" ]]; do
      destination="$trash_dir/zz-$name-$suffix.spec.ts"
      suffix=$((suffix + 1))
    done
    mv "$spec" "$destination"
    printf 'Moved temporary spec to Trash: %s\n' "$destination"
  fi
  exit 0
fi

if [[ "$#" -lt 2 ]]; then
  usage >&2
  exit 2
fi

name="$1"
route="$2"
shift 2
validate_name "$name"

if [[ "$route" != /* || "$route" == //* ]]; then
  printf 'Route must be a local absolute path beginning with one slash.\n' >&2
  exit 2
fi

variant=''
role='engineer'
ready_selector='main h1'
variant_set=0
role_set=0
ready_set=0
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --variant)
      if [[ "$#" -lt 2 || "$variant_set" -eq 1 || -z "$2" ]]; then
        usage >&2
        exit 2
      fi
      variant="$2"
      variant_set=1
      shift 2
      ;;
    --role)
      if [[ "$#" -lt 2 || "$role_set" -eq 1 || -z "$2" ]]; then
        usage >&2
        exit 2
      fi
      role="$2"
      role_set=1
      shift 2
      ;;
    --ready)
      if [[ "$#" -lt 2 || "$ready_set" -eq 1 || -z "$2" ]]; then
        usage >&2
        exit 2
      fi
      ready_selector="$2"
      ready_set=1
      shift 2
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! "$role" =~ ^(engineer|admin|viewer)$ ]]; then
  printf 'Invalid role: choose engineer, admin, or viewer.\n' >&2
  exit 2
fi
if [[ -n "$variant" && ! "$variant" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  printf 'Invalid variant: use letters, digits, underscores, or hyphens.\n' >&2
  exit 2
fi
if [[ -z "$ready_selector" ]]; then
  printf 'Ready selector must not be empty.\n' >&2
  exit 2
fi

spec="$spec_dir/zz-$name.spec.ts"
if [[ -e "$spec" ]]; then
  printf 'Temporary spec already exists: %s\n' "$spec" >&2
  exit 1
fi

node - "$spec" "$name" "$route" "$variant" "$role" "$ready_selector" <<'NODE'
const fs = require('node:fs');

const [, , specPath, name, routeInput, variant, role, readySelector] = process.argv;
const origin = 'http://capture.local';
const routeUrl = new URL(routeInput, origin);
if (routeUrl.origin !== origin) {
  throw new Error('Route must stay on the local app origin.');
}
if (variant !== '') routeUrl.searchParams.set('variant', variant);
const route = `${routeUrl.pathname}${routeUrl.search}${routeUrl.hash}`;

const source = [
  "import { mkdir } from 'node:fs/promises';",
  "import path from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  "import { expect, test } from '@playwright/test';",
  '',
  `const route = ${JSON.stringify(route)};`,
  `const role = ${JSON.stringify(role)};`,
  `const readySelector = ${JSON.stringify(readySelector)};`,
  `const screenshotDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.review', ${JSON.stringify(`${name}-shots`)});`,
  `const screenshotPath = path.join(screenshotDirectory, ${JSON.stringify(`${name}.png`)});`,
  '',
  `test(${JSON.stringify(`capture ${name}`)}, async ({ page }) => {`,
  '  await page.setViewportSize({ width: 1440, height: 900 });',
  "  await page.addInitScript(r => localStorage.setItem('platform:role', JSON.stringify(r)), role);",
  '  await page.goto(route);',
  '  await expect(page.locator(readySelector)).toBeVisible();',
  `  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);`,
  '  await page.evaluate(async () => { await document.fonts.ready; });',
  '  await mkdir(screenshotDirectory, { recursive: true });',
  '  await page.screenshot({ path: screenshotPath });',
  '});',
  '',
].join('\n');

fs.writeFileSync(specPath, source, { flag: 'wx' });
NODE

printf 'Created temporary Playwright spec: %s\n' "${spec#"$repo_root"/}"
printf 'Run: cd %q && pnpm exec playwright test --reporter=list %q\n' "$repo_root/apps/platform-e2e" "tests/zz-$name.spec.ts"
