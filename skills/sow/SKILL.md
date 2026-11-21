---
name: sow
description: >
  Use this skill when the user wants to set up a new TypeScript project or add
  standard tooling to an existing one. Triggers on phrases like "set up this repo",
  "initialize the project", "add linting", "scaffold this", "set up tooling",
  "configure typescript", or "sow".
metadata:
  author: Mark Anthony Cianfrani
  version: "0.9"
---

# Sow - TypeScript Project Setup

You help set up TypeScript projects with standardized tooling: oxlint for linting, oxfmt for formatting, and strict TypeScript configuration. Type-aware linting ships on — the `lint` script runs with `--type-aware` backed by tsrs (see "Type-Aware Linting" below)

## Dependencies

Dev dependencies to install:

- `@cianfrani/oxlint-config`
- `oxlint`
- `tsrs`
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
bun add -d @cianfrani/oxlint-config oxlint tsrs oxfmt typescript @j178/prek knip

# pnpm
pnpm add -D @cianfrani/oxlint-config oxlint tsrs oxfmt typescript @j178/prek knip

# yarn
yarn add -D @cianfrani/oxlint-config oxlint tsrs oxfmt typescript @j178/prek knip

# npm
npm install -D @cianfrani/oxlint-config oxlint tsrs oxfmt typescript @j178/prek knip
```

### 2. Create/Update Configs

Copy configs from the `references/` folder:

- `references/oxlintrc.json` → `.oxlintrc.json` (a thin stub — it `extends` the base config shipped in `@cianfrani/oxlint-config`; only per-project overrides live in the stub)
- `references/oxfmtrc.json` → `.oxfmtrc.json`
- `references/tsconfig.json` → `tsconfig.json`

The lint posture itself — error-only categories, the deliberate `"off"` list, complexity guardrails, test overrides, and the 12 quality rules — is **not copied**: it ships in `packages/oxlint-config/base.json` inside `@cianfrani/oxlint-config` (this repo is the source). The stub `extends` it; updates flow through the package manager (`npm update @cianfrani/oxlint-config`), not through re-copying configs. If the project disagrees with the posture, the stub overrides — for example, if its tsconfig sets `emitDecoratorMetadata: true`, the stub sets `"typescript/consistent-type-imports": "off"`.

**Lint config posture.** Error, never warn — warnings are noise that gets ignored; either it's an issue or it isn't, so every enabled category (`correctness`, `suspicious`, `pedantic`, `style`, `perf`) and every explicit rule is `"error"`. Findings get fixed or suppressed with an explicit `// oxlint-disable` comment, never tolerated as background noise. The `"off"` rules are intentional — they kill formatter conflicts, wrong-environment rules, mutually-exclusive pairs that ping-pong under `--fix`, and cross-plugin double-reporting. The ping-pong pairs are: `no-ternary`/`prefer-ternary`, and the vitest `prefer-to-be-truthy`/`prefer-to-be-falsy` (which autofix `toBe(true)`→`toBeTruthy()`) vs `prefer-strict-boolean-matchers` (which autofixes it straight back) — all three sit in the Style category, so `style: error` turns them on together; disabling the two deprecated aliases keeps the strict matcher and ends the war. Don't re-enable an off without checking why it's off. One invisible trap: `plugins` _overwrites_ oxlint's defaults instead of extending them, so the list must name every default too (`eslint`, `typescript`, `unicorn`, `oxc`) — drop `oxc` and you silently lose its rules.

For tsconfig, adjust the `@src/*` path mapping to match the project structure. The config has no `baseUrl` — TypeScript 6.0 made it a hard error, so `paths` values are relative (`./src/*`) and resolve from the tsconfig's location.\*

> \* **Version floors.** Relative `paths` without `baseUrl` works on TS 4.1+. This config's real floor is higher: `lib: ["ES2023"]` needs TS 5.0+, and `moduleResolution: nodenext` needs 4.7+. Dropping `baseUrl` did not lower compatibility — the old config already required 5.0+. To support an older TS, lower `lib` (e.g. `ES2022` reaches back to 4.7); the relative `paths` are fine down to 4.1.

### 2a. Ensure a .gitignore

The project **must** have a `.gitignore` that ignores `node_modules` (also ignore build output: `dist/`, `build/`, `coverage/`, and `.env`). oxlint obeys `.gitignore` to decide what to skip. Without `node_modules` ignored, `oxlint` walks the entire dependency tree and hangs. If a `.gitignore` exists, append the missing entries; otherwise create one.

### 2b. Quality plugin (anti-slop rules)

The 12 quality rules ship **inside `@cianfrani/oxlint-config`** — `packages/oxlint-config/quality/` in this repo, loaded by `jsPlugins` in `base.json`, adapted from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) via [nkzw-tech/oxlint-config](https://github.com/nkzw-tech/oxlint-config) (MIT). The rule table with what each one catches lives in `packages/oxlint-config/README.md` — keep that README updated when touching the rules; scaffolded projects read it through the package.

What matters at scaffold time:

- They are plain-AST rules — they run in the default syntactic `oxlint` pass, no type-aware backend. The package declares `oxlint >= 1.94` as its peer (the `jsPlugins` API is alpha but stable in practice for these rules).
- Nothing to copy — installing the dependency and `extends`-ing `base.json` wires everything. Updates flow through the package manager, not through re-vendoring.
- They are report-only (no autofixes) — they can't oscillate under `--fix`, and `--fix` convergence was verified (fixpoint after one pass, stable across an oxfmt round-trip). One interaction to know: inside a reducer, `unicorn/prefer-spread` co-fires with `quality/no-reduce-accumulator-copy`, and its suggested fix (`[...acc, x]`) still copies the accumulator — use `flatMap` or an iterator pipeline to satisfy both.
- `base.json` ignores `quality/**` — the plugin is vendor code that would otherwise trip style rules (`unicorn/no-null` and friends). Verified the pattern resolves against the package's own files and does **not** silence a `quality/` directory in the consuming project.
- Knip: scaffolded projects never need an ignore — the plugin ships inside `node_modules`, which Knip skips. Only this repo (armor), where the plugin source sits in-tree, would add `"ignoreFiles": ["packages/oxlint-config/quality/**"]`.

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

### 5. Type-Aware Linting (on by default)

The scaffolded `lint` script ships with `--type-aware`, backed by **tsrs** — the Rust type-aware backend built on oxc's TypeScript runner (oxlint auto-detects it when installed; `oxlint-tsgolint` is the older Go alternative, same flags). The curated type-aware rules (`no-floating-promises`, `no-misused-promises`, `no-unnecessary-type-assertion`, `no-unnecessary-condition`, `prefer-nullish-coalescing`, `prefer-optional-chain`, `strict-void-return`, `consistent-type-exports`, `no-deprecated`) live in `base.json` with everything else — nothing to add per project.

Why always-on: the pass costs roughly nothing at scaffold scale (measured: 0.52s syntactic vs 0.54s type-aware on 150 files, hot cache), and one strong lint beats two commands where people run the weak one by reflex and feel covered. Type-aware rules catch real runtime failures (floating promises, misused promises, unsafe assertions) that the syntactic pass is structurally blind to.

Two mechanical notes:

- The `--tsconfig` flag still only points oxlint's import plugin at the tsconfig for path-alias resolution. `--type-aware` is what engages tsrs.
- Enabling via the script flag (not `options.typeAware` in config) is deliberate: the pre-commit hook runs plain `oxlint`, so it stays fast and syntactic-only **by construction** — no second config to drift. The hook checks staged files in milliseconds; `lint` in CI is the real gate.

Pin `tsrs` in devDependencies like any other package. Its version looks like `0.25.0-ts7.1.0-beta` — it tracks the TypeScript version it embeds, so upgrades there are like TS upgrades: deliberate, in their own commit. It embeds its own compiler and does not use the project's `typescript` package.

`--type-aware` turns on the typescript plugin's **whole** type-aware rule set, not only the ones in `base.json`. Findings will surface from rules you never wrote down — commonly `typescript/unbound-method`, `typescript/no-redundant-type-constituents`, and `typescript/no-unsafe-type-assertion`. Decide each per project: fix the code, or set the rule `"off"` with a reason. (Example: `unbound-method` fires on every destructured method, so a codebase whose core pattern is `const { method } = ctx` turns it off rather than fight its own idiom.) Use `--type-aware --debug timings` to see which rules cost the most before turning one off for performance.

Five type-aware rules are `"off"` in `base.json` (`no-implied-eval`, `prefer-promise-reject-errors`, `require-await`, `prefer-includes`, `prefer-string-starts-ends-with`) and stay off even with `--type-aware` — an explicit `off` beats the category default. Decide each on merit per project; `no-implied-eval` first, it's the only safety rule of the five.

In monorepos, type-aware linting needs resolved types: install dependencies and build dependent workspace packages first (`pnpm install && pnpm -r build`) so their `.d.ts` files exist, or the backend builds programs against missing shapes. On large repos, measure the pass before assuming parity with the syntactic runtime — program build cost scales with file count and dependency types.

To fold type-checking into the same run, add `--type-check`. It reports tsc's compiler errors from the TypeScript program the backend already built, instead of a separate `tsc` pass.

Opting out per project: drop `--type-aware` from the `lint` script (and the `tsrs` devDep). The type-aware rules in `base.json` then no-op — they are inert without the flag, same as the five offs.

Without `tsrs` (or `oxlint-tsgolint`) installed, `--type-aware` fails fast with: `Failed to find type-aware linter executable. You may need to add the tsrs or oxlint-tsgolint package to your project?` — so it never silently no-ops.

### 6. Complexity Rules

The oxlint config includes complexity guardrails as errors with high defaults — they're meant to catch egregious cases, not nag on normal code (they're `"error"` like everything else, per the error-only posture):

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
