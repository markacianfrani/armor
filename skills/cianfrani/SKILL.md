---
name: cianfrani
description: Channel the spirit of Mark Cianfrani to review your code changes. 
---

# Cianfrani Review

Review the current changes with specialized agents, then edit their raw findings into a self-contained decision brief.

The user may append review aspects, a base ref or range, and an output mode when invoking this skill. Treat those arguments as the review request.

Before dispatching reviewers, read [reviewers.md](references/reviewers.md) completely. Before synthesizing the final response, read [decision-brief.md](references/decision-brief.md) completely.

## 1. Determine the review scope

Resolve the comparison base in this order:

1. A base ref or range supplied by the user
2. The PR base from provider metadata
3. The merge base between `HEAD` and the repository's default branch
4. A clarification question when the base remains ambiguous

Include tracked working-tree changes. Identify relevant untracked files and state whether they are included. Record the base ref and SHA, `HEAD` SHA, dirty state, and changed-file count for the final report.

## 2. Parse the review request

### Review aspects

- **api** — REST endpoints, HTTP semantics, and API testing
- **errors** — silent failures, catch blocks, fallbacks, logging, and user feedback
- **types** — type design, invariants, schema alignment, and unnecessary type ceremony
- **tests** — regression value, tautology, over-mocking, wrong-layer tests, and names
- **mutations** — empirical checks that changed tests fail when assertions or implementation are broken
- **simplify** — structural simplification, deletion, and unnecessary abstractions
- **house** — the diff against checkable rules in `AGENTS.md`
- **risk** — risky changed paths that merit additional attention
- **all** — all applicable aspects; this is the default

### Output modes

- **blocking only** / **critical only** — report concrete merge blockers only
- **brief** / **terse** — one line for conventional findings and one short causal paragraph for non-obvious findings
- **full** — include all applicable decision sections; this is the default

Review aspects select which checks run. Output modes select what the final brief includes.

## 3. Inspect the diff

Read the changed-file list and the complete diff for the resolved scope. Compare changed tests with their previous versions so reduced protection is visible. Follow changed code far enough to validate reviewer claims and understand public or operational consequences.

## 4. Run applicable reviewers

Use one-shot reviewers and collect each result directly. Run independent checks in parallel unless the user requests sequential review.

Default applicability:

- API routes or endpoints changed: API review
- Try/catch, fallbacks, or error paths changed: error review
- Types or schemas changed: type review
- Test files changed: test review and mutation checks
- `AGENTS.md` exists: house-rules review
- Every comprehensive review: simplification last, after other findings are available

Mutation checks are empirical evidence and deserve more weight than a reviewer predicting that a test might be weak. Run them in isolated worktrees. If mutation checks are impractical because the test command is unavailable or prohibitively expensive, report that they were skipped rather than implying the tests were verified.

Follow the routing, house-rule, mutation, and evidence instructions in [reviewers.md](references/reviewers.md).

## 5. Identify reduced protection

Compare each changed test with its previous version and look for:

- Assertions deleted, loosened, or narrowed
- Tests skipped, marked pending, or removed
- Mocks widened to replace real behavior
- Setup weakened so the test exercises less

These are changes in what the suite can catch, not automatically production defects. Mutation evidence may prove or disprove the concern.

## 6. Verify and synthesize

Treat agent output as source material. Verify the strongest claims against the reviewed snapshot, merge duplicates, and resolve contradictions where the code permits. Mutation results outrank static speculation about the same test. If the snapshot changes before implementation, re-check each approved finding against the new diff.

Produce the final report using [decision-brief.md](references/decision-brief.md). Wait for the user to choose proposed changes before implementing them.
