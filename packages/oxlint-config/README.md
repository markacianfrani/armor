# @cianfrani/oxlint-config

Opinionated [Oxlint](https://oxc.rs) config: an **error-only** posture plus a bundled **quality plugin** of anti-slop rules. One package, both parts.

## Install

```bash
npm install -D @cianfrani/oxlint-config oxlint
# or pnpm add -D / yarn add -D / bun add -d
```

Requires `oxlint >= 1.94` (the `jsPlugins` API).

## Use

Your project's `.oxlintrc.json` becomes a thin stub that extends the package:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/refs/heads/main/npm/oxlint/configuration_schema.json",
  "extends": ["./node_modules/@cianfrani/oxlint-config/base.json"],
  "rules": {
    // per-project overrides only — e.g. if your tsconfig sets
    // emitDecoratorMetadata: "typescript/consistent-type-imports": "off"
  }
}
```

`base.json` carries the full posture: error-only categories (`correctness`, `suspicious`, `pedantic`, `style`, `perf`), the deliberate `"off"` list, complexity guardrails, test-file overrides, and the 12 quality rules below via `jsPlugins`. Your stub only overrides what your project disagrees with.

Updates flow through your package manager — bump the dependency, don't re-vendor.

## The quality plugin (`quality/`)

Plain-AST rules — they run under the default syntactic `oxlint` pass, no type-aware backend. They gate the "slop" patterns LLMs and rushed humans produce:

| Rule                                 | Catches                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `quality/no-array-filter-map`        | Adjacent `.filter().map()` passes — two array copies; prefers one-pass `flatMap` or lazy iterator helpers.     |
| `quality/no-chained-type-assertions` | `x as A as B` chains that discard the original type evidence (`as const` chains stay allowed).                 |
| `quality/no-conditional-empty-object-spread` | `...(cond ? { a: 1 } : {})` — spreads that only exist to conditionally omit a key; build the object explicitly. |
| `quality/no-known-value-widening`    | Explicitly annotating a known value with a broad type (`const raw: unknown = value`) or an inline anonymous object type — keep inference, `satisfies`, or a named type. |
| `quality/no-object-parameters`      | The broad `object` parameter type — inputs should use a named owner type, parsed at the boundary.               |
| `quality/no-reduce-accumulator-copy` | Copying the accumulator every reducer iteration (`acc.concat`, `{...acc}`) — quadratic work.                   |
| `quality/no-reflect-apply`           | `Reflect.apply` — dynamic dispatch that bypasses typed calls.                                                 |
| `quality/no-reflect-get`             | `Reflect.get` — dynamic property reads with no type evidence.                                                  |
| `quality/no-unknown-returns`         | Functions whose contract is `unknown` / `Promise<unknown>` — parse input at the boundary and return a named type. |
| `quality/no-unknown-type-aliases`    | `type X = unknown` aliases that launder `unknown` out of sight.                                                |
| `quality/no-unsafe-dictionary-type`  | `Record<string, unknown>`-style dictionaries whose value type gives callers no contract.                      |
| `quality/no-widen-then-assert`      | Widen a known value (`const x: unknown = value`) then assert it back narrower — keep the precise type throughout. |

All 12 are `"error"` in `base.json`. `unknown` stays legal where it belongs — on parsing-boundary inputs — these rules only fire when it's used to _discard_ type evidence mid-function instead of keeping a named type.

The rules are report-only (no autofixes), so they can't oscillate against other rules' fixers. One interaction to know: inside a reducer, `unicorn/prefer-spread` co-fires with `quality/no-reduce-accumulator-copy`, and its suggested fix (`[...acc, x]`) still copies the accumulator — use `flatMap` or an iterator pipeline to satisfy both.

## Provenance

The quality plugin is adapted from [`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop) (MIT, Dillon Mulroy) via [`nkzw-tech/oxlint-config`](https://github.com/nkzw-tech/oxlint-config) (MIT, Christoph Nakazawa). See `quality/LICENSE` and the attribution comment in `quality/index.mjs`. Config and glue are MIT, Mark Cianfrani.

## Notes

- The plugin files are `.mjs` so they load as ESM regardless of the consuming project's `package.json` `"type"` field.
- `base.json` sets `ignorePatterns: ["quality/**"]` — the plugin is vendor code that would otherwise trip style rules (`unicorn/no-null` and friends). This ignores the package's own files; it does not ignore a `quality/` directory in your project unless you happen to have one.
- Type-aware linting (tsrs backend) is a separate, per-project opt-in — see the `sow` skill in the [`markacianfrani/armor`](https://github.com/markacianfrani/armor) repo.