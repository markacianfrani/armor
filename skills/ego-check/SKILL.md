---
name: ego-check
description: >
  A code-review lens that flags cleverness for its own sake, fashion-driven
  choices, premature abstraction, and indirection that serves the author instead
  of the reader. Asks one question of every choice: who does this serve? Empathy
  over ego: ego-driven work never produces something humane. Use when reviewing a
  diff or PR, especially a clever or trendy one. Triggers on "review this", "is this
  over-engineered", "too clever", "code review", "is this abstraction worth it".
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1.0"
---

# Ego Check

Ego-driven design never produces something humane. The
designer who builds to look good builds for himself, not the user. The same trap
sits in code. Code is not where you prove you are clever. It is where you serve
the next person who has to read it.

This lens reads a diff with one question: who does this serve?

## The procedure

For each non-obvious choice in the diff, ask who it serves — the next maintainer,
the caller, the on-call engineer — or the author's self-image.

Flags:

- **Cleverness.** A one-liner that takes a minute to read. A trick where a plain
  loop would do. Density mistaken for skill.
- **Fashion.** A new framework or pattern adopted because it is new, not because
  the problem asked for it. Resume-driven.
- **Premature abstraction.** A generic interface with one implementation. A config
  option no one requested. Flexibility for a future that may never come.
- **Author-serving indirection.** Layers that make the writer feel architecturally
  sound and make the reader chase a definition across six files.

## The test

For each flag, ask: would this survive the author explaining it to the person who
maintains it next year?

"I did it because it is elegant" is not a reason. "I did it because the old way
broke here, and here is the bug" is a reason.

## The reframe

Not "is this good code." Ask "is this kind to the next person." Kind code is
boring on purpose. It does the obvious thing in the obvious place.

## Report

| Location | What | Who it serves | Simpler alternative |
| -------- | ---- | ------------- | ------------------- |

Keep it specific. Point at lines. Offer the simpler version, do not just name the
sin.
