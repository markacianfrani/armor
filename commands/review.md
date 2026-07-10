---
description: "Review recent changes using specialized agents"
argument-hint: "[scope and focus, e.g. 'this branch against main, big stuff only']"
---

# Review Recent Changes

Review code changes using specialized agents, each focused on one aspect of quality.

**Scope and focus:** "$ARGUMENTS"

Arguments describe scope (what to diff against) and intent (severity threshold, topic focus like "security stuff" or "big shit only"). They are not aspect keywords.

## 1. Resolve Scope

- `git fetch origin` first.
- Determine the base ref. Default `main`, unless the arguments name another branch.
- Diff against the merge-base, never the bare base branch: `git diff $(git merge-base HEAD origin/<base>)`.
- Stop and tell the user if the branch is far behind origin/<base>, or if local <base> has diverged from origin. A stale base produces false criticals that are really the base's own changes. Offer a rebase or fresh pull first.
- Note the deployment context: production service, CLI/dev tool, or POC. Pass it to every agent. Findings in non-production surfaces get downgraded, not dropped.

**Small-diff fast path:** if the diff is small (roughly under 150 changed lines, or docs/config only), review it inline yourself. Skip the agent fan-out entirely.

## 2. Launch Agents

Launch all applicable agents in parallel:

- **steiner** — if API routes/endpoints changed
- **kimahri** — if error handling changed (try/catch, fallbacks)
- **auron** — if types added/modified
- **lulu** — if test files changed. Include: flag arbitrary timeouts (sleep, waitForTimeout) papering over flakiness; prefer deterministic waits. Modified test logic is riskier than renames — investigate it.
- **paine** — always

Tell each agent the deployment context and the severity threshold from the arguments.

## 3. Evidence Gate

Before a finding reaches the report:

- No Critical or Blocking verdict unless it is verified against this repo's actual code or runtime. If the ground truth lives somewhere you can't see — a live connect log, the deployment environment, an external service's real behavior — report it as **Needs verification** and name the one command or log that would settle it. "I can't confirm this from here" and "Critical" never describe the same finding.
- Before asking the user a question, try to answer it yourself by tracing the code. Only ask what code cannot answer: data provenance, intent, product decisions.

## 4. Filter

- **Defensive-code filter.** For low-probability paths, prefer an honest comment over new guard code. Additive suggestions — wraps, shared constants, extra tests for unlikely paths, speculative narrowing — get one line at the bottom of the report, not equal billing with real issues. When agents conflict, paine's deletion instinct breaks the tie.
- **Jargon gate.** Findings are written in plain English. No coined shorthand. Any text that will land in code — comments, test names — is written fresh in the project's voice, never copied from an agent's finding.

## 5. Altitude Check

If two or more Critical/Important findings share one root cause, or a proposed fix needs a new primitive or a design call, stop patching. That is a design smell, not a fix list. Present it as a decision:

- The premise the findings are patching around
- The patch path and what it costs
- The redesign path and what it costs
- Your recommendation

Never bury a redesign under a list of local fixes.

## 6. Report

```markdown
# Review Summary

## Fix now (minimum set: N edits)
- The smallest set of changes worth making. Effort-sorted.

## Important
- [agent]: Issue [file:line]

## Design decisions (yours)
- Anything from the altitude check, and any genuine judgment calls.

## Needs verification
- Finding + the one command/log that would confirm it.

## One-liners
- Additive/optional suggestions, one line each.
```

Strengths: one line, if any.

## 7. On Approval

- Fan out the fixes in parallel with subagents by default. Don't wait to be asked.
- Right-size the work: no test scaffolding, fixtures, or design writeups for a fix under ~10 lines unless the user asks.

## Agent Descriptions

**steiner** (api): REST conventions, HTTP semantics, status codes, API test coverage. Stripe as the standard.

**kimahri** (errors): silent failures, catch blocks, error logging, user feedback on errors.

**auron** (types): encapsulation, invariant expression, flags over-engineered types.

**lulu** (tests): ranks each test by the regression it protects; flags tautologies, over-mocking, framework-testing, vague names. Asks; doesn't rewrite.

**paine** (simplify): reduces complexity by deletion and consolidation. Preserves behavior.
