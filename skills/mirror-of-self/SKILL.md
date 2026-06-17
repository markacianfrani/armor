---
name: mirror-of-self
description: >
  Break a tie between two implementations that both work. A forced pairwise
  comparison: ask which one you would rather maintain, not which one is cleverer.
  Use when stuck between two designs, APIs, names, schemas, or refactors that both pass tests
  and abstract criteria cannot separate. Triggers on "which approach", "can't
  decide between", "option A or B", "break this tie", "help me choose between
  two implementations".
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1.0"
---

# Mirror-of-the-Self

A tool for choosing between two similar things. Put them side by side
and ask which one is a truer picture of your self. Project an honest self, not a
flattering one. Untrained people, asked this way, make uniform choices. They pick
the more adapted thing.

For code, the self is the engineer who has to live with the result. The question
is not which option is more elegant. It is which one you would rather inhabit.

## When to use it

Two options. Both correct. Both pass the tests. The spec does not pick one. You
have been staring at them for ten minutes.

## When not to use it

- One option is actually wrong. Fix correctness first. The mirror is for ties.
- One is faster by a margin that matters, or smaller, or required by a constraint.
  Facts win. The mirror does not override a benchmark.
- The decision is trivial and reversible. Just pick one.

## The procedure

1. Confirm the tie is real. Both options meet the spec. If not, stop — you have a
   correctness problem, not a taste problem.

2. Put them side by side with equal framing. Do not pre-argue for either. No
   "obviously the second one, but..."

3. Ask these in order. Answer each before reading the next.
   - Which one would I rather be paged for at 3am?
   - Which would I rather hand to someone in their first week?
   - Which will I still understand in six months with no notes?
   - Which one am I drawn to because it flatters me as an engineer? Name it.
     Then set it aside.

4. The honest-self rule. Picture the engineer you are on a tired day, not the one
   in the interview. If a choice only wins when you are sharp and caffeinated, it
   loses.

5. If the answers split, the tie is genuine and small. Pick either and move on.
   Do not manufacture a reason.

6. Log the choice. One line: the decision, and the question that settled it. These
   accumulate into a real design rationale.

## Run it again

The value is in repetition. At each fork in a sequence — the name, the signature,
the error shape, the module split — ask again. Each use is cheap. A day of these
is how a coherent design gets built, one honest choice at a time.
