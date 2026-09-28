"""Regression tests for guard-git-push.py (PR #97 review: implicit main push, grouped -f, + refspec).

Run: python3 .claude/hooks/test_guard_git_push.py
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

GUARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guard-git-push.py")


def make_repo(branch):
    d = tempfile.mkdtemp()
    run = lambda *a: subprocess.run(["git", "-C", d, *a], check=True, capture_output=True)
    run("init", "-q", "-b", "main")
    run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init")
    if branch != "main":
        run("switch", "-q", "-c", branch)
    return d


def decision(command, cwd):
    payload = {"hook_event_name": "PreToolUse", "tool_name": "Bash", "cwd": cwd, "tool_input": {"command": command}}
    out = subprocess.run([sys.executable, GUARD], input=json.dumps(payload), capture_output=True, text=True, check=True).stdout
    return json.loads(out)["hookSpecificOutput"]["permissionDecision"] if out.strip() else "allow"


class GuardGitPush(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main = make_repo("main")
        cls.topic = make_repo("topic")

    def test_implicit_push_on_main_is_denied(self):
        for cmd in ["git push", "git push origin", "git push -u origin", "git push --all"]:
            self.assertEqual(decision(cmd, self.main), "deny", cmd)

    def test_explicit_main_refspec_is_denied_from_any_branch(self):
        for cmd in ["git push origin main", "git push origin HEAD:main", "git push origin topic:refs/heads/main"]:
            self.assertEqual(decision(cmd, self.topic), "deny", cmd)

    def test_force_spellings_are_denied(self):
        for cmd in ["git push -f origin topic", "git push -uf origin HEAD", "git push --force origin topic",
                    "git push --force-with-lease origin topic", "git push origin +HEAD:topic"]:
            self.assertEqual(decision(cmd, self.topic), "deny", cmd)

    def test_cd_and_git_C_follow_the_target_repo(self):
        self.assertEqual(decision(f"cd {self.main} && git push", self.topic), "deny")
        self.assertEqual(decision(f"git -C {self.main} push", self.topic), "deny")
        self.assertEqual(decision(f"cd {self.topic} && git push", self.main), "allow")

    def test_normal_topic_pushes_are_allowed(self):
        for cmd in ["git push", "git push -u origin HEAD", "git push origin topic", "git status && git push -q -u origin HEAD",
                    "gh pr merge 1 --merge", "echo git push origin main-docs"]:
            self.assertEqual(decision(cmd, self.topic), "allow", cmd)


if __name__ == "__main__":
    unittest.main()
