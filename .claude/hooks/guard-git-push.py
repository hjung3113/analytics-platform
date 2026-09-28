#!/usr/bin/env python3
"""PreToolUse(Bash) guard: deny pushes that update main or force-update any ref.

Branch-aware, so a bare `git push` while main is checked out is caught (a regex rule cannot see the branch).
Tests: .claude/hooks/test_guard_git_push.py
"""
import json
import os
import re
import shlex
import subprocess
import sys

MAIN_REFS = {"main", "refs/heads/main"}


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)


def current_branch(cwd):
    r = subprocess.run(["git", "-C", cwd, "branch", "--show-current"], capture_output=True, text=True)
    return r.stdout.strip()


def check_push(args, cwd):
    """args: tokens after `push`."""
    positional = []
    for a in args:
        if a.startswith("--"):
            if a.startswith("--force") or a == "--mirror":
                deny("force push는 막혀 있다. 사용자가 명시적으로 요청했다면 `! git push --force-with-lease …`로 직접 실행해 달라고 한다.")
            if a in ("--all", "--branches"):
                deny("--all은 main도 push한다. 브랜치를 지정해 push하고 PR로 올린다.")
        elif a.startswith("-") and len(a) > 1:
            if "f" in a[1:]:
                deny("force push(-f)는 막혀 있다. 사용자가 명시적으로 요청했다면 직접 실행해 달라고 한다.")
        else:
            positional.append(a)
    refspecs = positional[1:]
    for spec in refspecs:
        if spec.startswith("+"):
            deny("`+` refspec은 force push다. 사용자가 명시적으로 요청했다면 직접 실행해 달라고 한다.")
        dst = spec.split(":", 1)[-1]
        if dst in MAIN_REFS or (dst == "HEAD" and current_branch(cwd) == "main"):
            deny("main에 직접 push하지 않는다. 브랜치를 만들어 PR로 올린다(루트 AGENTS.md \"작업 관리\").")
    if not refspecs and current_branch(cwd) == "main":
        deny("main이 체크아웃된 상태의 `git push`는 main을 갱신한다. 브랜치를 만들어 PR로 올린다.")


def main():
    data = json.load(sys.stdin)
    command = (data.get("tool_input") or {}).get("command", "")
    cwd = data.get("cwd") or os.getcwd()
    for segment in re.split(r"&&|\|\||[;|\n]", command):
        try:
            tokens = shlex.split(segment)
        except ValueError:
            tokens = segment.split()
        if not tokens:
            continue
        if tokens[0] == "cd" and len(tokens) > 1:
            cwd = os.path.join(cwd, os.path.expanduser(tokens[1]))
            continue
        if tokens[0] != "git":
            continue
        i, git_cwd = 1, cwd
        while i < len(tokens) and tokens[i].startswith("-"):
            if tokens[i] in ("-C", "-c") and i + 1 < len(tokens):
                if tokens[i] == "-C":
                    git_cwd = os.path.join(cwd, os.path.expanduser(tokens[i + 1]))
                i += 2
            else:
                i += 1
        if i < len(tokens) and tokens[i] == "push":
            check_push(tokens[i + 1:], git_cwd)


if __name__ == "__main__":
    main()
