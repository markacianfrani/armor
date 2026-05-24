---
description: "Review recent changes using specialized agents"
argument-hint: "[review-aspects]"
---

# Review Recent Changes

Review code changes on the current branch using specialized agents, each focusing on a different aspect of code quality.

**Review Aspects (optional):** "$ARGUMENTS"

## Review Workflow:

1. **Determine Review Scope**
   - Run `git diff main --name-only` to identify changed files
   - Run `git diff main` to see the actual changes
   - Parse arguments to see if user requested specific review aspects
   - Default: Run all applicable reviews

2. **Available Review Aspects:**
   - **api** - Review REST endpoints, HTTP semantics, API testing (steiner)
   - **errors** - Check error handling for silent failures (kimahri)
   - **types** - Analyze type design and invariants (auron)
   - **tests** - Interrogate test quality; flag tautology, over-mocking, framework-testing, vague names (lulu)
   - **simplify** - Simplify code for clarity and maintainability (paine)
   - risk - Identify risky parts of the codebase that may need extra attention
   - **all** - Run all applicable reviews (default)

3. **Determine Applicable Reviews**

   Based on changes:
   - **If API routes/endpoints changed**: steiner
   - **If error handling changed** (try/catch, fallbacks): kimahri
   - **If types added/modified**: auron
   - **If test files changed** (`*.spec.*`, `*_spec.rb`, `*_test.*`, `test_*.py`): lulu
   - **Always run last**: paine (polish and refine)


4. **Launch Review Agents**

   **Agent Output Format** — each agent must return one of:
   - `BLOCKING: [issue description and file:line]`
   - `CLEAN: No issues in this area.`

   `CLEAN` is a valid and expected output. Agents do not need to find problems to be useful. An agent that returns CLEAN is doing its job correctly.

   Do not flood with low-value nits. Prefer a small number of high-conviction findings over a long cosmetic list. If the only findings are rename suggestions or style preferences, return CLEAN instead.

   **Parallel approach** (default):
   - Launch all applicable agents simultaneously in parallel
   - Faster for comprehensive review
   - Results come back together

   **Sequential approach** (if user specifies):
   - One agent at a time
   - Easier to understand and act on

5. **Identify Risk**

   - Look at the test changes. Were any tests modified? If so, investigate the changes. Changes to the underlying logic are much more risky than renaming methods.
   - Present the user with a report of the riskiest changes to review.

6. **Apply the Approval Bar**

   After aggregation, apply this bar. The review **converges** — it is not an open-ended search for more things to fix.

   **Pass conditions** (all must be true):
   - No critical issues
   - No important issues that are structural regressions (spaghetti growth, abstraction leaks, missing decomposition)
   - No missed opportunities to delete meaningful complexity when a clear path exists

   If all three are met → **PASS**. Output:
   ```
   ✅ APPROVED — no blocking issues found.
   ```

   If not → output the action plan below.

   Do NOT downgrade a pass into a "well technically you could…" list. If it passes, it passes. Cosmetic suggestions do not turn a pass into a fail.

7. **Provide Action Plan** (only if review does not pass)

   ```markdown
   # Review Summary

   ## Blocking Issues

   - [agent-name]: Issue description [file:line]

   ## Why These Block

   - Brief explanation of what regression each issue represents

   ## Fixes Required

   1.  Present every action item to the user for approval
   2.  Fix blocking issues
   3.  Re-run review to verify
   ```

   Do NOT include a "Suggestions" or "Nice to have" section. Those dilute the signal. If something isn't worth blocking on, it isn't worth listing.

## Usage Examples:

**Full review (default):**

```
/review
```

**Specific aspects:**

```
/review errors types
# Reviews only error handling and type design

/review api
# Reviews only API/REST changes

/review simplify
# Just simplifies code

/review slop
# Just removes AI slop patterns
```

## Agent Descriptions:

**steiner** (api):

- REST conventions and HTTP semantics
- Status codes, naming consistency
- API test coverage
- Stripe API as gold standard

**kimahri** (errors):

- Finds silent failures
- Reviews catch blocks
- Checks error logging
- Validates user feedback on errors

**auron** (types):

- Analyzes type encapsulation
- Reviews invariant expression
- Rates type design quality
- Flags over-engineered types

**lulu** (tests):

- Ranks every test in the diff by the regression it actually protects
- Flags tautologies, over-mocking, framework-testing, wrong-layer tests
- Calls out vague `it` names that won't help the next engineer
- Surfaces questions for the author; doesn't rewrite

**paine** (simplify):

- Simplifies complex code
- Improves clarity and readability
- Applies project standards
- Preserves functionality
