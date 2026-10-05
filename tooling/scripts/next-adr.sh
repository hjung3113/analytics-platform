#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
adr_dir="$repo_root/docs/adr"
highest=0

for file in "$adr_dir"/*.md; do
  [[ -e "$file" ]] || continue
  filename="$(basename "$file")"
  if [[ "$filename" =~ ^([0-9]{4})-.+\.md$ ]]; then
    number=$((10#${BASH_REMATCH[1]}))
    if ((number > highest)); then
      highest="$number"
    fi
  fi
done

if ((highest >= 9999)); then
  printf 'No 4-digit ADR number remains after %04d.\n' "$highest" >&2
  exit 1
fi

next=$((highest + 1))
printf '다음 ADR 번호: %04d\n' "$next"
printf '파일명 형식: %04d-<영문-요약>.md\n' "$next"
printf '주의: 현재 로컬 docs/adr 트리만 확인했습니다. origin/main을 fetch해 비교하고 열린 브랜치와 worktree도 별도로 확인하세요.\n'
