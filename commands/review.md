---
description: "Review recent changes using specialized agents"
argument-hint: "[review-aspects]"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Task"]
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
   - **slop** - Remove AI-generated code patterns
   - risk - Identify risky parts of the codebase that may need extra attention
   - **all** - Run all applicable reviews (default)

3. **Determine Applicable Reviews**

   Based on changes:
   - **If API routes/endpoints changed**: steiner
   - **If error handling changed** (try/catch, fallbacks): kimahri
   - **If types added/modified**: auron
   - **If test files changed** (`*.spec.*`, `*_spec.rb`, `*_test.*`, `test_*.py`): lulu
   - **Always run last**: paine (polish and refine)
   - **Always check**: slop patterns

4. **Launch Review Agents**

   **Parallel approach** (default):
   - Launch all applicable agents simultaneously using multiple Task tool calls in a single message
   - Faster for comprehensive review
   - Results come back together

   **Sequential approach** (if user specifies):
   - One agent at a time
   - Easier to understand and act on

5. **Check for AI Slop**

   Scan the diff for:
   - Extra comments that humans wouldn't add
   - Defensive try/catch blocks abnormal for the codebase
   - Casts to `any` to bypass type issues
   - Style inconsistent with surrounding code

   Fix any slop found directly.

6. **E2E Test Stability**

   Scan test changes for:
   - Arbitrary timeouts (sleep, waitForTimeout, setTimeout) used to fix flakiness
   - Missing root-cause fixes (awaiting actual UI state, network idle, or data readiness)
   - Retry loops without actionable failure output

   Prefer deterministic waits and fix underlying causes instead of padding with time.

7. Identify risk

- Immediately look at the test changes. Were any tests modified? If so, investigate the changes. Changes to the underlying logic are much more risky than renaming methods.
- Present the user with a report of the riskiest changes to review.

8. **Aggregate Results**

   After agents complete, summarize:
   - **Critical Issues** (must fix)
   - **Important Issues** (should fix)
   - **Suggestions** (nice to have)
   - **Strengths** (what's done well)

9. **Provide Action Plan**

   ```markdown
   # Review Summary

   ## Critical Issues (X found)

   - [agent-name]: Issue description [file:line]

   ## Important Issues (X found)

   - [agent-name]: Issue description [file:line]

   ## Suggestions (X found)

   - [agent-name]: Suggestion [file:line]

   ## Slop Removed

   - What AI patterns were cleaned up

   ## Strengths

   - What's well-done in these changes

   ## Next Steps

   1.  Use the `question` tool and present every action item to the user
   2.  Fix critical issues first
   3.  Address important issues
   4.  Consider suggestions
   5.  Re-run review after fixes
   ```

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

## Tips:

- **Run early**: Before committing, not after
- **Focus on changes**: Agents analyze git diff by default
- **Address critical first**: Fix high-priority issues before lower priority
- **Re-run after fixes**: Verify issues are resolved
- **Use specific reviews**: Target specific aspects when you know the concern
