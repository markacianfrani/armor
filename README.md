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

## Init

This repo is setup as a light `armor` CLI. 

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

## Skills

Skills can be installed individually with: 

`npx skills add https://github.com/markacianfrani/armor`

### Code Skills
- sow - sets your project up with strict linting and guardrails

### Documentation Skills
- diataxis
- jira
- docs-triage

### Tool Skills
- brave-search
- drawio
- web-fetch

### UI Skills
- component-authoring
- keyboard-focus-invariants
- layout-shift-qa

### Design Skills
- pattern-miner

## Agents
- Auron - looks at your types
- Kimahri - looks at your error handling
- Lulu - looks at your tests
- Steiner - looks at your REST API
- Paine - looks at your complexity
- Mog - looks at your tickets
- Matoya - looks at another LLM for help
