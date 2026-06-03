---
name: scenario-spread
description: >
  Before committing to the first idea, sketch several distinct approaches, test
  each against real feedback, and pick by merit, not attachment. Explore multiple
  scenarios with informational feedback, with an explicit ego guard so the
  approach you walked in wanting does not quietly win.
  Use at the start of a non-trivial, hard-to-reverse task, or when you notice the
  first idea becoming the only idea. Triggers on "how should I approach", "design
  options", "explore approaches", "before I start", "what are my options".
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1.0"
---

# Scenario Spread

The first idea has an unfair advantage. It got there first, and the longer you
hold it, the more it looks like the only idea. The fix is to explore several
scenarios and let feedback choose. The ego does not get to drive.

## The procedure

1. Before writing the real thing, sketch three distinct approaches. Distinct means
   different in shape, not three flavors of the same idea. If three is a stretch,
   find two.

2. For each, write three lines: the shape, what it is good at, what it costs.

3. Get real feedback, not imagined feedback.
   - Run the cheap version. A spike, a benchmark, a type-check, a sketch the
     compiler can see.
   - Apply `mirror-of-self` between the top two.
   - If a test or a person can rule one out, let them.

4. The ego guard. Name the approach you walked in wanting. Hold it to the same
   evidence as the others. If it only wins on attachment, drop it. Feedback that
   you steer toward your favorite is not feedback.

5. Pick. Write one line: why this one, and what would change the decision.

## Scaling up

For a large task, this is a judge panel. Generate the approaches in parallel,
score each against the evidence, then synthesize from the winner while taking the
best parts of the runners-up. The Workflow tool runs this shape well.

## When not to use it

Trivial or reversible decisions. Spreading three approaches to name a variable is
waste. Use this where the choice is expensive to undo — a schema, a public API, a
dependency you will live with for years.
