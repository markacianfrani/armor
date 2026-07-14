---
name: sow
description: >
  Use this skill when the user wants to set up a new TypeScript project or add
  standard tooling to an existing one. Triggers on phrases like "set up this repo",
  "initialize the project", "add linting", "scaffold this", "set up tooling",
  "configure typescript", or "sow".
metadata:
  author: Mark Anthony Cianfrani
  version: "0.2"
---

# Sow - TypeScript Project Setup

You help set up TypeScript projects with standardized tooling: oxlint for linting, oxfmt for formatting, and strict TypeScript configuration. Type-aware linting is available but off by default — it is an opt-in (see "Type-Aware Linting" below).

## Dependencies

Dev dependencies to install:

- `oxlint`
- `oxfmt`
- `typescript`
- `@j178/prek`
- `knip`

## Detection Phase

First, assess the current state:

1. **Check for package.json** - Does one exist? What package manager lockfiles are present?
2. **Check for existing linting** - Is there eslint, prettier, biome, or other tooling?
3. **Check for tsconfig.json** - Does one exist? If it sets `emitDecoratorMetadata: true`, set `"typescript/consistent-type-imports": "off"` — oxlint's `--fix` rewrites value imports to `import type` and erases the emitted metadata ([typescript-eslint#10200](https://github.com/typescript-eslint/typescript-eslint/issues/10200)).
4. **Check for .gitignore** - Does one exist, and does it ignore `node_modules`? oxlint walks the working tree and obeys `.gitignore`. Without `node_modules` ignored, the default lint command hangs trying to lint every dependency.
5. **Check for existing Knip/dead-code tooling** - Look for `knip.json`, `knip.jsonc`, `.knip.json`, `knip.ts`, `package.json#knip`, `depcheck`, `ts-prune`, or similar tools. If Knip already exists, preserve it and tune from findings rather than replacing it.

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
bun add -d oxlint oxfmt typescript @j178/prek knip

# pnpm
pnpm add -D oxlint oxfmt typescript @j178/prek knip

# yarn
yarn add -D oxlint oxfmt typescript @j178/prek knip

# npm
npm install -D oxlint oxfmt typescript @j178/prek knip
```

### 2. Create/Update Configs

Copy configs from the `references/` folder:

- `references/oxlintrc.json` → `.oxlintrc.json`
- `references/oxfmtrc.json` → `.oxfmtrc.json`
- `references/tsconfig.json` → `tsconfig.json`

**Lint config posture.** Deliberately loud, and the `"off"` rules are intentional — they kill formatter conflicts, wrong-environment rules, two mutually-exclusive pairs, and cross-plugin double-reporting. Don't re-enable an off without checking why it's off. One invisible trap: `plugins` _overwrites_ oxlint's defaults instead of extending them, so the list must name every default too (`eslint`, `typescript`, `unicorn`, `oxc`) — drop `oxc` and you silently lose its rules.

For tsconfig, adjust the `@src/*` path mapping to match the project structure. The config has no `baseUrl` — TypeScript 6.0 made it a hard error, so `paths` values are relative (`./src/*`) and resolve from the tsconfig's location.\*

> \* **Version floors.** Relative `paths` without `baseUrl` works on TS 4.1+. This config's real floor is higher: `lib: ["ES2023"]` needs TS 5.0+, and `moduleResolution: nodenext` needs 4.7+. Dropping `baseUrl` did not lower compatibility — the old config already required 5.0+. To support an older TS, lower `lib` (e.g. `ES2022` reaches back to 4.7); the relative `paths` are fine down to 4.1.

### 2a. Ensure a .gitignore

The project **must** have a `.gitignore` that ignores `node_modules` (also ignore build output: `dist/`, `build/`, `coverage/`, and `.env`). oxlint obeys `.gitignore` to decide what to skip. Without `node_modules` ignored, `oxlint` walks the entire dependency tree and hangs. If a `.gitignore` exists, append the missing entries; otherwise create one.

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

### 5. Type-Aware Linting (opt-in)

Type-aware rules are **off by default** and not in `.oxlintrc.json`. They are powerful but still alpha: they need a second binary (`oxlint-tsgolint`, a Go backend that embeds the TypeScript compiler), are slower, and can use a lot of memory on large repos. Leaving them out keeps the default `lint` honest — every rule in the base config actually runs.

The `--tsconfig` flag on the default `lint` script does **not** enable these rules. It only points oxlint's import plugin at the tsconfig for path-alias resolution. Type-aware rules require a separate flag and binary.

To turn type-aware linting on for a project:

1. Install the backend:

   ```bash
   <pkg-manager> add -D oxlint-tsgolint
   ```

2. Add the rules to `.oxlintrc.json`:

   ```json
   "typescript/no-deprecated": "error",
   "typescript/no-floating-promises": "error",
   "typescript/no-misused-promises": "error",
   "typescript/no-unnecessary-type-assertion": "error",
   "typescript/no-unnecessary-condition": "error",
   "typescript/prefer-nullish-coalescing": "error",
   "typescript/prefer-optional-chain": "error"
   ```

   `no-deprecated` belongs here too: it resolves `@deprecated` JSDoc tags on symbols across files, so it needs type information and does nothing under plain `oxlint`.

   `prefer-nullish-coalescing` and `prefer-optional-chain` belong here, not in the base config: both need type information to know whether an operand is nullable, so under plain `oxlint` they silently do nothing.

3. Add `--type-aware` to the existing `lint` script so there is still one lint command, and it's the strong one:

   ```json
   "lint": "oxlint --tsconfig tsconfig.json --type-aware"
   ```

   Don't ship a separate `lint:type-aware` script — a second command just means people run the weaker one by reflex and feel covered when they aren't. Make `lint` the full check.

   `--type-aware` turns on the typescript plugin's **whole** type-aware rule set, not only the six you listed. Findings will surface from rules you never wrote down — commonly `typescript/unbound-method` and `typescript/no-redundant-type-constituents`. Decide each per project: fix the code, or set the rule `"off"` with a reason. (Example: `unbound-method` fires on every destructured method, so a codebase whose core pattern is `const { method } = ctx` turns it off rather than fight its own idiom.)

The pre-commit hook can stay syntactic-only (type-aware is too slow for the inner loop). Run the full type-aware `lint` in CI, where it's the real gate. That fast/slow split is local-vs-CI, not two scripts a developer juggles.

Without `oxlint-tsgolint` installed, `--type-aware` fails fast with: `Failed to find tsgolint executable. You may need to add the 'oxlint-tsgolint' package to your project?` — so it never silently no-ops.

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

### 7. Oxfmt Config

The formatter config should include:

- `$schema` for editor validation
- explicit defaults for the style choices we want to standardize (`printWidth`, semicolons, quotes, trailing commas, line endings)
- `sortImports: true` so the formatter owns import ordering (the lint `sort-imports` rule is off to avoid fighting it)
- `sortPackageJson: true` to use Oxfmt's package.json ordering
- `ignorePatterns` for common generated output directories

Oxfmt also respects `.gitignore`, skips `node_modules` and lockfiles by default, and supports `.prettierignore` for compatibility. Prefer config-level `ignorePatterns` for new projects.

**oxfmt is pre-1.0 (beta).** Its formatting output can change between minor versions, which surfaces as a large reformatting diff on an otherwise unrelated change. `npm install` saves a caret range (`^0.53.0`), and for a `0.x` version a caret only allows patch bumps — so day-to-day installs are stable. The risk is a deliberate minor bump (`0.53` → `0.54`). When bumping oxfmt, do it in its own commit and run `format` so the reformat is isolated and reviewable. Pin the exact version (`oxfmt@0.53.0`, no caret) if you want zero drift until you choose to move.

### 8. Git Hooks with prek

Set up [prek](https://github.com/j178/prek) for a pre-commit hook that runs linting and formatting.

prek reads pre-commit's config schema. Local commands live under a `repo = "local"` entry, and each hook needs `id`, `name`, `language`, and `entry`. The flat `[[hooks]]` shape some docs show does not parse — prek rejects it with `missing field 'repos'`.

Create `prek.toml` in the project root:

```toml
[[repos]]
repo = "local"

[[repos.hooks]]
id = "oxlint"
name = "oxlint"
language = "system"
entry = "npx oxlint --tsconfig tsconfig.json"
types_or = ["ts", "tsx", "javascript", "jsx"]
pass_filenames = false

[[repos.hooks]]
id = "oxfmt"
name = "oxfmt"
language = "system"
entry = "npx oxfmt --check"
types_or = ["ts", "tsx", "javascript", "jsx", "json"]
pass_filenames = false
```

`language = "system"` runs the command as-is (no managed toolchain), which is what `npx` needs. `pass_filenames = false` lets each tool resolve its own file set rather than having staged paths appended. Use `types_or` (match any) not `types` (match all) — a file is never both `ts` and `tsx`.

Install the git hooks (prek needs a git repo, so run `git init` first if the project isn't one yet):

```bash
git init   # only if not already a git repo
npx prek install
```

Note: `prek install` exits 0 and writes `.git/hooks/pre-commit` even when the config is malformed — so a bad config fails silently at commit time, not at install. Verify with `npx prek run --all-files` after installing.

Add a `prepare` script so the hook installs automatically after `npm install`:

```json
"prepare": "prek install || true"
```

The `|| true` keeps Docker builds alive. `prepare` runs on every `npm ci`, but a build context has no `.git` (and `--omit=dev` has no prek binary), so a bare `prek install` would exit non-zero and kill the build. prek has no `HUSKY=0` skip, so this is the guard.

### 9. Dead Code & Dependency Hygiene with Knip

Set up [Knip](https://knip.dev) to find unused files, exports, dependencies, unlisted dependencies, unresolved imports, and unused binaries.

Knip is project-graph tooling, so the correct configuration depends on the repo's real entry points, framework conventions, generated files, workspace boundaries, public API surface, scripts, and dynamic imports. Do **not** stamp a large shared Knip config onto every repo. Prefer Knip's defaults first, then tune from actual findings.

The package scripts include:

```json
"knip": "knip",
"knip:production": "knip --production"
```

Do not create a Knip config by default unless the first run shows false positives or missing coverage. If configuration is needed, create `knip.jsonc` with the schema and tune only what the project needs:

```jsonc
{
  "$schema": "https://unpkg.com/knip@6/schema-jsonc.json",
}
```

Common tuning:

- add missing runtime entry points to `entry`
- narrow analyzed source files with `project`
- use `ignoreFiles` for generated files, fixtures, or examples that should not count as unused files
- use `ignoreDependencies`, `ignoreUnresolved`, or `ignoreIssues` only for known false positives
- set `includeEntryExports: true` for private apps if unused exports from entry files should be reported
- usually leave `includeEntryExports` off for public libraries, where entry-file exports are public API
- rely on package-manager workspace detection before adding explicit `workspaces`
- prefer real workspace package dependencies over cross-workspace TypeScript path aliases or relative imports

Avoid broad `ignore` patterns. They hide too much. Prefer more specific configuration or better `entry` / `project` coverage.

Do not add Knip to the pre-commit hook. It is a whole-project maintenance check, not a staged-file check. Pre-push or CI enforcement is useful after the initial report is clean or intentionally configured.

### 10. Agent Instructions & Dependency Policy

Standardize the repo's agent-instructions file and record the dependency policy. `AGENTS.md` is the canonical file; `CLAUDE.md` is a symlink to it, so both tools read the same source.

Run the helper from the project root:

```bash
bash <skill-path>/scripts/setup-agents-md.sh
```

It is idempotent and safe to re-run. It handles every starting state:

- only `CLAUDE.md` → renames it to `AGENTS.md`, links `CLAUDE.md` → `AGENTS.md`
- only `AGENTS.md` → links `CLAUDE.md` → `AGENTS.md`
- a reversed or mis-pointed symlink → repoints it
- both files with **different** content → refuses and asks you to merge by hand (never clobbers)

Then it appends the dependency policy to `AGENTS.md`, once, guarded by a `<!-- sow:dependency-policy -->` marker so re-runs don't duplicate it. The policy also tells future agents to run Knip before handoff when their changes affect the project graph.

The script doesn't carry that text inline — it appends [`assets/dependency-policy.md`](assets/dependency-policy.md) verbatim. That file is the exact content written to `AGENTS.md`. Read it to see what gets appended; edit it to change the policy. There is one copy, so nothing can drift.

## Verification

On a fresh setup, normalize formatting first — an existing codebase has not been run through oxfmt, so `format:check` would fail on every unformatted file and tell you nothing useful:

```bash
# Normalize formatting once (writes changes)
<pkg-manager> run format
```

Then verify:

```bash
# Type check
<pkg-manager> run check

# Lint
<pkg-manager> run lint

# Format check (should pass now)
<pkg-manager> run format:check

# Dead code and dependency hygiene audit
<pkg-manager> run knip
```

Read the results by kind, they are not the same signal:

- **`format:check` failures** mean files need formatting. The fix is running `format` — not a code problem. This is why you normalize first.
- **`check` (tsc) and `lint` failures** are real: existing code that does not meet the stricter type and lint standards. Report these to the user; they may need code changes, not just a reformat.
- **`knip` failures** are project-graph findings. For fresh projects, fix them immediately. For existing projects, classify the findings: fix obvious issues caused by setup, tune precise Knip config for false positives, and ask before deleting unrelated files, removing dependencies, or changing public exports.

In CI, run `format:check` (not `format`) so the build fails on unformatted code instead of silently rewriting it.
