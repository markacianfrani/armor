# Armor

All my little AI snippets.

Shared coding harness config for:
- Claude Code
- pi

## Layout

- `agents/` — shared subagent definitions
- `commands/` — shared command definitions
- `skills/` — shared skills
- `scripts/init.sh` — symlink installer
- `bin/armor` — small CLI wrapper

## Init

```bash
armor init
```

That links shared config into `~/.agents/`:
- `agents/*.md` → `~/.agents/agents/`
- `commands/*.md` → `~/.agents/commands/`
- `skills/*` → `~/.agents/skills/`

Claude also gets direct links:
- `agents/*.md` → `~/.claude/agents/`
- `commands/*.md` → `~/.claude/commands/`

The init script also:
- creates an OpenCode-compatible `my-review.md` alias for `commands/review.md` in `~/.agents/commands/`
- removes stale repo-backed links from old pi/OpenCode install dirs
- backs up conflicting real files to `*.bak`
