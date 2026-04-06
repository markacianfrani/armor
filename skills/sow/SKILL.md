---
name: sow
description: >
  Use this skill when the user wants to set up a new TypeScript project or add
  standard tooling to an existing one. Triggers on phrases like "set up this repo",
  "initialize the project", "add linting", "scaffold this", "set up tooling",
  "configure typescript", or "sow".
---

# Sow - TypeScript Project Setup

You help set up TypeScript projects with standardized tooling: oxlint for linting (with type-aware rules), oxfmt for formatting, and strict TypeScript configuration.

## Dependencies

Dev dependencies to install:

- `oxlint`
- `oxfmt`
- `typescript`
- `@j178/prek`

## Detection Phase

First, assess the current state:

1. **Check for package.json** - Does one exist? What package manager lockfiles are present?
2. **Check for existing linting** - Is there eslint, prettier, biome, or other tooling?
3. **Check for tsconfig.json** - Does one exist?

## Package Manager

Detect from lockfiles:

- `bun.lockb` or `bun.lock` → bun
- `pnpm-lock.yaml` → pnpm
- `yarn.lock` → yarn
- `package-lock.json` → npm

If no lockfile exists or multiple are present, ask the user which they prefer.

## Setup Steps

### 1. Install Dependencies

Using the detected package manager:

```bash
# bun
bun add -d oxlint oxfmt typescript @j178/prek

# pnpm
pnpm add -D oxlint oxfmt typescript @j178/prek

# yarn
yarn add -D oxlint oxfmt typescript @j178/prek

# npm
npm install -D oxlint oxfmt typescript @j178/prek
```

### 2. Create/Update Configs

Copy configs from the `references/` folder:

- `references/oxlintrc.json` → `.oxlintrc.json`
- `references/tsconfig.json` → `tsconfig.json`

For tsconfig, adjust `paths` and `baseUrl` based on project structure if needed.

### 3. Add Package Scripts

Merge scripts from `references/package-scripts.json` into the project's `package.json`.

Adjust the script runner prefix based on package manager:

- bun: `bun run check`, or just `bun check`
- pnpm: `pnpm check`
- npm/yarn: `npm run check`

### 4. Handle Existing Tooling

If eslint, prettier, or similar exists, **ask the user** before removing:

> I found existing [eslint/prettier/etc] configuration. Would you like me to:
>
> 1. Remove it and use oxlint/oxfmt instead
> 2. Keep it alongside the new tooling
> 3. Skip linting/formatting setup

If they choose to remove, delete:

- `.eslintrc*`, `eslint.config.*`
- `.prettierrc*`, `prettier.config.*`
- Related packages from dependencies

### 5. Type-Aware Linting

oxlint's type-aware rules require the `--tsconfig` flag. This is already included in the lint script:

```json
"lint": "oxlint --tsconfig tsconfig.json"
```

This enables rules like:

- `typescript/no-floating-promises`
- `typescript/no-misused-promises`
- `typescript/no-unnecessary-type-assertion`
- `typescript/no-unnecessary-condition`

### 6. Complexity Rules

The oxlint config includes complexity guardrails as warnings with high defaults — they're meant to catch egregious cases, not nag on normal code:

| Rule                     | Default | What it limits                               |
| ------------------------ | ------- | -------------------------------------------- |
| `complexity`             | 20      | Cyclomatic complexity per function           |
| `max-params`             | 6       | Function parameters                          |
| `max-depth`              | 5       | Block nesting depth                          |
| `max-statements`         | 40      | Statements per function                      |
| `max-lines-per-function` | 150     | Lines per function (skips blanks + comments) |
| `max-nested-callbacks`   | 4       | Nested callback depth                        |

Test files (`__tests__/**`, `*.test.ts`, `*.spec.ts`) are excluded from `max-nested-callbacks`, `max-statements`, and `max-lines-per-function` since `describe`/`it` nesting naturally inflates these.

### 7. Git Hooks with prek

Set up [prek](https://github.com/j178/prek) for pre-commit hooks that run linting and formatting on staged files.

Create `prek.toml` in the project root:

```toml
[[hooks]]
id = "oxlint"
entry = "npx oxlint --tsconfig tsconfig.json"
types = ["ts", "tsx", "js", "jsx"]

[[hooks]]
id = "oxfmt"
entry = "npx oxfmt --check"
types = ["ts", "tsx", "js", "jsx", "json"]
```

Install the git hooks:

```bash
npx prek install
```

Add a `prepare` script to `package.json` so hooks are installed automatically after `npm install`:

```json
"prepare": "prek install"
```

## Verification

After setup, run:

```bash
# Type check
<pkg-manager> run check

# Lint
<pkg-manager> run lint

# Format check
<pkg-manager> run format:check
```

Report any errors to the user - they likely indicate existing code that doesn't meet the stricter standards.
