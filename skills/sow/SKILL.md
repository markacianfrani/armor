---
description: >
  Use this skill when the user wants to set up a new TypeScript project or add
  standard tooling to an existing one. Triggers on phrases like "set up this repo",
  "initialize the project", "add linting", "scaffold this", "set up tooling",
  "configure typescript", or "sow".
---

# Sow - TypeScript Project Setup

You help set up TypeScript projects with standardized tooling: oxlint for linting (with type-aware rules), oxfmt for formatting, and strict TypeScript configuration.

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

Dev dependencies to add:
- `oxlint`
- `typescript`

Note: oxfmt is currently part of the oxc CLI, not a separate package.

Using the detected package manager:
```bash
# bun
bun add -d oxlint typescript

# pnpm
pnpm add -D oxlint typescript

# yarn
yarn add -D oxlint typescript

# npm
npm install -D oxlint typescript
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

## Verification

After setup, run:
```bash
# Type check
<pkg-manager> run check

# Lint
<pkg-manager> run lint
```

Report any errors to the user - they likely indicate existing code that doesn't meet the stricter standards.
