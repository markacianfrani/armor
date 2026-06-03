---
name: pattern-language
description: >
  Mine a codebase's recurring solutions into a named pattern language, or apply
  existing patterns to a new problem with the local adaptation. The constraint
  system that keeps design intuition grounded — without it, felt-sense wanders
  into impractical excursions. Use when documenting conventions, onboarding code
  into an existing repo, or asking how a thing is usually done here. Triggers on
  "what's our convention", "how do we usually", "extract patterns", "document
  conventions", "pattern language".
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1.0"
---

# Pattern Language

A set of proven solutions, named and written down, that you reuse with
adaptation. The Gang of Four patterns are the famous example. It is the
constraint system that keeps taste from wandering. The other skills in this set
lean on it.

> **Lightest of the set.** Most of its value overlaps with a good conventions doc
> or ADR. Keep it if your repo has strong habits but no written record of them.
> Skip it if your conventions are already documented.

## Mine

1. Pick one recurring concern: error handling, data fetching, validation, module
   layout.

2. Find three or more places the codebase already solves it. Use `ast-grep` for
   structure, `rg` for text.

3. If they agree, that is a pattern. Name it. Write: the name, when to use it, the
   shape, and one real example at `file:line`.

4. If they disagree, that is not a pattern. It is drift. Flag it. Do not enshrine
   an accident as a convention.

## Apply

1. Name the problem.

2. Match it against the documented patterns. If none exist, mine on the fly from
   the three nearest examples.

3. Surface the matching pattern and the adaptation this context needs. Patterns
   get reused with changes, not copy-pasted. The change is the point.
