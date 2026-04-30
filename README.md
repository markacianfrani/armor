# Armor

All my little AI snippets.

Shared coding harness config for:

- Claude Code
- pi

## Layout

- `agents/` — shared subagent definitions
- `commands/` — shared command definitions
- `skills/` — shared skills
- `extensions/` — pi extensions
- `scripts/link-config.sh` — config symlink installer
- `bin/armor` — small CLI wrapper

## Init

```bash
git clone git@github.com:markacianfrani/armor.git ~/Code/armor
cd ~/Code/armor
./bin/armor init
```

`armor init` creates:

- `~/.local/bin/armor` → your checkout's `bin/armor`
- all agent/config symlinks into `~/.agents`, `~/.claude`, and `~/.pi`

If `~/.local/bin` is not on your `PATH`, add this to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Commands

```bash
armor init    # install global CLI + link shared config
armor update  # git pull --ff-only + relink shared config
armor doctor  # print install and repo diagnostics
```

## What gets linked

`armor init` and `armor update` link shared config into `~/.agents/`:

- `agents/*.md` → `~/.agents/agents/`
- `commands/*.md` → `~/.agents/commands/`
- `skills/*` → `~/.agents/skills/`

Pi extensions get linked directly:

- `extensions/*.ts` → `~/.pi/agent/extensions/`

Claude also gets direct links:

- `agents/*.md` → `~/.claude/agents/`
- `commands/*.md` → `~/.claude/commands/`

For pi, commands stay in `~/.agents/commands/` and are loaded via prompt-template settings (see `.pi/settings.json`).
