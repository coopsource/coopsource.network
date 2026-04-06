---
name: Always start on a feature branch
description: User expects work to begin on a feature branch or worktree, not directly on main
type: feedback
---

Always create a feature branch (or use a worktree) before making changes. Never work directly on main.

**Why:** CLAUDE.md git workflow rules require all work on feature branches. User had to grant a one-time exception to commit directly to main.

**How to apply:** At the start of any task that will modify files, create a branch like `feature/<short-description>` before making any edits.
