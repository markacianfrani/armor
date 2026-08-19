# Reviewer Routing and Evidence

## Specialized reviewers

Use available one-shot agents that match these roles. Collect findings as direct results.

### API — steiner

- REST conventions and HTTP semantics
- Status codes and naming consistency
- API contract and test coverage

### Errors — kimahri

- Silent failures and misleading fallbacks
- Catch blocks, error logging, and user feedback
- Error paths that report success or encourage harmful retries

### Types — auron

- Encapsulation and invariant expression
- Runtime-schema and static-type alignment
- Useful constraints versus type ceremony
- Over-engineered or widely fanned-out type changes

### Tests — lulu

- The regression each changed test actually protects
- Tautology, over-mocking, framework-testing, and wrong-layer tests
- Names that hide the guarantee or failure mode
- Questions for the author; no speculative rewrites

### Simplification — paine

- Structural changes that delete branches, modes, and layers
- Complexity whose source is adjacent to the diff
- Comment slop and unnecessary explanation of obvious code
- Behavior or API proposals that require user approval

### Mutation evidence — mutation-tester and test-gauntlet

Use mutation testing for changed tests when a focused test command is available.

- **mutation-tester:** invert new or changed assertions and verify that each mutation fails.
- **test-gauntlet:** revert or gut changed implementation in isolated worktrees and verify that the changed tests notice.

Run `mutation-tester` for changed assertions. Run `test-gauntlet` when tests and implementation changed together, especially for central behavior or when static review suspects false positives or over-mocking.

Mutation runs must be isolated and leave the main worktree untouched.

## Mutation evidence weighting

Mutation evidence changes confidence, not automatically urgency.

- **Survived assertion mutation:** strong evidence that the assertion is tautological, unreachable, or passing for the wrong reason.
- **Tests stay green after implementation is reverted or gutted:** strong evidence of a false positive or over-mocked test.
- **Mutation killed:** positive evidence that the test protects that specific behavior; use it to resolve or remove weaker static concerns about the same behavior.
- **Mutation run could not establish a passing baseline:** inconclusive; report the baseline failure instead of judging the test.

A survived mutation proves a protection gap, not a production defect. It becomes blocking only when the unprotected behavior is itself a concrete merge requirement, security boundary, data-loss guard, or similarly critical contract and no other test protects it.

Within the same decision section, order mutation-proven findings before static findings. Label them **Mutation-proven** and state the exact mutation and observed test result. Never describe a static prediction as mutation evidence.

## House rules

Run the house-rules reviewer when `AGENTS.md` exists. If it does not exist, mark the check as skipped so a skipped check and a clean check remain distinct.

Give the reviewer this contract:

> Check the diff against this repository's written conventions. Treat `AGENTS.md` as the source of candidate rules.
>
> Extract checkable rules first. A rule is checkable when a changed line can be shown to violate it. Skip setup steps, environment facts, and directory layout. Expect roughly 5 to 15 rules.
>
> Check only what this diff introduces. Quote the rule for every retained finding. Record ambiguous rules separately.
>
> Return the complete rule list with no-finding marks, then each violation with the quoted rule, `file:line`, offending code, smallest fix, and severity.

In the final report, collapse a clean house-rules check to one line. Put this beside each retained violation:

`Basis: AGENTS.md — "[quoted rule]"`

## Evidence hierarchy

When findings conflict, prefer evidence in this order:

1. Reproduced runtime behavior or a mutation experiment
2. A focused failing test that exercises the real changed path
3. Direct code tracing through the changed path and its callers
4. Specification or repository-rule evidence tied to the changed line
5. Static reviewer concern with a concrete reachable path
6. Speculation or style preference

Lower-ranked evidence can identify what to test, but it does not overrule a stronger result without explaining the mismatch.
