# Disabled Skills

Keep the skills here outside the loading paths (`.agents/skills` and the `.claude/skills` symlink). They are not deleted; restore a skill with `git mv .agents/skills-off/<name> .agents/skills/`.

These copies remain available for conditional reactivation without loading by default. Keep candidates called by other skills or documents enabled (`frontend-design`, and the `design-deslop` and `design-review` commands).

| Skill | Note |
| --- | --- |
| `fastapi`, `supabase-postgres-best-practices` | External official copies (#162). **Re-enable when work on #155 (internal FastAPI server) begins.** |

