---
description: "Two-pass security review with beatrix: find, then filter false positives"
argument-hint: "[files or base ref]"
---

# Security Review

Review the current change for genuinely exploitable security vulnerabilities. Run beatrix twice: once to find, once to filter. You only see findings that survive both passes.

**Scope (optional):** "$ARGUMENTS" — specific files, or a base ref to diff against. Default: the current branch vs `main`.

## Why two passes

Both passes are beatrix, but in separate, fresh contexts. The context that just worked to find a bug is invested in it being real — it can't filter itself honestly. A second invocation that sees only the findings and is told to refute each one catches the confidently-wrong ones the first pass talked itself into.

## Workflow

1. **Determine scope**
   - `git diff main --name-only` for the changed files, `git diff main` for the changes.
   - If `$ARGUMENTS` names files, scope to those. If it names a base ref, diff against that instead of `main`.
   - If nothing changed, say so and stop.

2. **Pass 1 — Find**
   - Launch the **beatrix** agent on the diff and changed files.
   - It returns candidate findings, each with a location, severity, category, the vulnerable code, an exploit chain, and a proposed fix.
   - If beatrix finds nothing, report a clean review and stop. No second pass needed.

3. **Pass 2 — Filter**

   Launch **beatrix again, in a fresh agent** — not the same context as pass 1. Give it pass 1's candidate findings verbatim, plus the diff and the changed files, and this instruction:

   > You're verifying, not finding. Here are candidate findings from an earlier pass. Don't hunt for new vulnerabilities — rule on these. The write-up is the accusation, not the verdict: re-trace each exploit chain from the real code and try to break it. A finding is a false positive when you can name where the chain fails — the input is parameterized, the route needs a role no attacker holds, the value is overwritten before the sink, it's on the do-not-report list, or it duplicates another. A concrete break, not a vague "seems unlikely." When you genuinely can't resolve it after reading the code, keep it and say what you couldn't verify — a borderline true positive costs less than a missed one. You may downgrade severity instead of cutting. For each candidate return a verdict — confirmed (carry through the full finding), downgraded (say why), or rejected (one line: location and the specific reason the chain fails) — then a count: N in, M confirmed, K rejected.

4. **Report**

   ```markdown
   # Security Review

   Scanned: [N files]. Pass 1 raised [X] candidates; pass 2 confirmed [Y], rejected [Z].

   ## Confirmed Findings

   ### [HIGH | MEDIUM | LOW] — [Category] — `file:line`

   - **What's wrong:** [the vulnerable code and why]
   - **Exploit chain:** [the ordered preconditions]
   - **Fix:** [the smallest correct change]

   ## Filtered (false positives)

   - `file:line` — [the specific reason pass 2 rejected it]

   ## Next Steps

   1. Present confirmed findings to the user, highest severity first.
   2. The filtered list is shown so the user can override a rejection if pass 2 was wrong.
   3. Fix HIGH findings first.
   ```

   Lead with the confirmed findings. Keep the filtered list short — one line each — so the user can spot a wrong rejection without wading through noise.

## Usage

```
/security-review
# Review the current branch vs main

/security-review src/auth/session.ts
# Review only this file

/security-review develop
# Diff against develop instead of main
```
