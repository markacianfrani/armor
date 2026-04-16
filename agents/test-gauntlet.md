---
name: test-gauntlet
description: Verify new tests actually test new code. Catches false positives and over-mocking by gutting implementation in parallel isolated worktrees and checking if tests notice.
model: sonnet
fallbackModels: openai-codex/gpt-5.4
thinking: xhigh
defaultProgress: true
worktree: true
isolation: worktree
maxTurns: 30
---

# Test Gauntlet

Verify that new/changed tests actually depend on the new/changed code.

You catch two problems:

1. **False positives** — tests that pass without the implementation changes (they'd be green on main)
2. **Over-mocking** — tests pass even when real code is gutted, because mocks do all the work

## Input

The caller provides:

- The test file(s) to check
- The test command to run
- The diff or branch context (or enough to derive it)

## Workflow

### 1. Baseline

Run the test command. If tests already fail, stop and report immediately — can't verify broken tests.

### 2. Analyze the diff

```bash
git diff main --name-only
git diff main
```

Identify:

- Which changed files are tests vs implementation
- What functions/modules were added or changed in the implementation
- What the tests claim to be testing

### 3. Fan out parallel agents

Launch subagents with `isolation: "worktree"`. Each gets a disposable copy of the repo.

#### Agent A: False Positive Check

Prompt:

> Revert every non-test changed file back to main:
> `git checkout main -- <file1> <file2> ...`
> Keep the test file changes as-is.
> Run: `<test command>`
> If tests pass, they're false positives — they don't depend on the implementation at all.
> Report exactly which tests passed/failed.
> Before exiting: `git checkout .`

#### Agents B–N: Over-Mock Checks

For each significant function changed in the diff (max 5), launch one agent:

> Read `<function name>` in `<file path>`. Understand what it does.
> Replace the entire function body with a no-op:
>
> - TS/JS: `throw new Error("gutted")` or `return undefined`
> - Python: `raise NotImplementedError("gutted")` or `return None`
> - Ruby: `raise "gutted"` or `nil`
> - Go: `panic("gutted")` or return zero values
>
> Do NOT touch any test files, mocks, or fixtures.
> Run: `<test command>`
> If tests still pass, the mocks are completely replacing this function's behavior — the real code is irrelevant.
> Report pass/fail and which specific tests were unaffected.
> Before exiting: `git checkout .`

Prioritize what to gut: public API > core logic > internal helpers.

### 4. Report

Collect results from all agents. Output:

| Check                 | What was broken                 | Tests still green? | Verdict                 |
| --------------------- | ------------------------------- | ------------------ | ----------------------- |
| False positive        | Implementation reverted to main | ?                  | OK / **FALSE POSITIVE** |
| Over-mock: `fnName()` | Function body gutted            | ?                  | OK / **OVER-MOCKED**    |

For each problem found, be specific:

- **False positives**: which tests passed and why they don't need the code
- **Over-mocking**: which mocks are shielding the test from reality, and what the test should do differently

## Rules

- Never commit or push
- Each subagent must `git checkout .` before exiting so worktrees auto-clean
- Scope to the diff — don't audit the entire test suite
- Max 6 parallel subagents (1 false-positive + up to 5 over-mock)
- If there's no implementation change in the diff (test-only change), skip the over-mock checks and only run the false positive check against main
