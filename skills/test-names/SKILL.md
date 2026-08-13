---
name: test-names
description: >
  Make test names read plainly to someone who has never seen the codebase. Use
  when a test name is confusing, jargon-y, or does not say what the code
  guarantees, when reviewing test changes, or when tidying up a spec file. Reach
  for it even when only one name is flagged — one bad name is usually a pattern.
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1.0"
---

# Test names

A test name promises *this is what the code guarantees*. Most names instead
describe which internal line does the rejecting, or lean on a word the author
invented that morning. Both leave the reader reverse-engineering the
implementation to decode a sentence.

Two gates. A stranger reads the name and knows what the code guarantees. And the
test would fail if that guarantee broke.

## Fix the pattern, not the line

When someone flags one name, read the rest first. The author who wrote one name
that way wrote forty. Scan the file, then the directory, then the subsystem.

Confining the defect to one file is a real result — say so and stop. Churning a
hundred clear names to look thorough is worse than doing nothing.

## The rules

**1. State the contract. Not which internal line enforces it.**

```
BAD:  rejects a space — the pattern allows one, so the extra check is what
      catches it
GOOD: rejects a username with a space in it
```

The bad version is the author explaining to themselves why the function has two
clauses. It goes stale the moment either one changes.

**2. Never name an internal regex, constant, or variable.** Not the constant, not
"the character class", not a fragment of the pattern itself. Those are private
facts, and a reader has no way to look them up from a test report.

**3. Never invent vocabulary a stranger cannot know.** The tell is a word that
appears in the test name and nowhere the reader would ever meet it — not the docs,
not the domain, not the public API. Usually it is an ordinary word welded to a
domain noun to mean something private: the *leg*, the *half*, the *side*, a *bare*
one. Say the plain thing instead.

Terms of art borrowed from another field are the sneakiest. "Well-formed" means
*syntactically valid* to someone who has done XML or grammars and nothing to
everyone else. Prefer the word the module's siblings already use — next to
`isValidEmail`, a new `isValidAddress` reads; `hasAddressShape` does not.

**4. Real domain and protocol nouns stay.** `TLS`, `CONNECT`, `407`, `idempotency
key`, `ledger entry`. Do not dumb these down. Rule 3 is about invented jargon, not
about vocabulary the reader is supposed to have.

**5. A clause naming a real consequence earns its place. A clause naming an
internal mechanism does not.**

```
KEEP: refuses a leading hyphen, which reaches the argv as an option flag
KEEP: expires the token after 30 days, which is what the audit requires
CUT:  ...so the second check is what rejects it
```

"Why this matters to the world" earns the words. "Which of my lines does the work"
does not.

**6. Read the body before renaming.** This is where the pass pays for itself.
Names routinely overstate their assertion, and you cannot see it from the name
alone. A describe block called "requests the service cannot complete" whose second
test returns 200 is a finding, not a style nit. Fix the name to the truth and say
so.

**7. Names only.** No assertions, structure, imports, or fixtures. Add and delete
nothing. A reviewer should be able to read the rename commit as a pure no-op.

**8. Leave a clear name alone.** Changing few is a good outcome.

## Then the weak ones

Rule 6 turns up tests that do not deserve their new name. Report these, and fix
them as a *separate* commit:

- A tautology — would pass with the implementation gutted.
- An assertion looser than the known truth. `toBeGreaterThanOrEqual(3)` where the
  count is knowably 3 stays green when a regression emits a fourth.
- Over-mocking: stub everything to succeed, assert success.
- A test that would not catch the failure it is named for. Ask this in the
  domain's own terms — on a security boundary, would it catch a secret reaching
  somewhere it should not? On storage, would it pass against a store that dropped
  every write?
- An integration test that integrates nothing, or never runs. Worse than absent,
  because it reads as coverage.

Before trusting a tightened test, break the production code in the way it now
claims to catch and watch it fail. A green assertion proves nothing until it has
failed once on purpose.

## Before you call it done

Per-file test counts, not just the total — a matching total hides one test deleted
here and one added there. And the diff touches no production file.

Then spot-check the renames that made the largest claim against their bodies. That
is where the finds are: a name sharpened from vague to specific is what exposes the
comment beside it that says the opposite. Expect the pass to turn up stale
comments, production functions that need the same treatment, and duplicate
implementations you only noticed by reading two test files closely. Report those
and get a decision — they are usually bigger than the rename that surfaced them.
