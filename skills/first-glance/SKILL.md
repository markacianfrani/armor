---
name: first-glance
description: >
  Pre-attentive read of a developer-facing artifact — README, error message,
  function signature, CLI help, public API, or PR description. Reports where a
  stranger's eye lands in the first five seconds, whether it lands on the right
  thing, and what repels. Based on a simple gate: if a thing repels you in the
  first seconds, nothing later redeems it. Use when reviewing or improving DX
  surfaces, docs, error messages,
  or API readability. Triggers on "is this readable", "review this README",
  "first impression", "does this API make sense", "DX review", "review this error
  message".
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1.0"
---

# First Glance

Eye-tracking shows the first three to five seconds decide whether a reader
connects to a thing at all. The gaze lands somewhere before conscious thought.
If what it lands on repels, no amount of body text wins the reader back.

This skill runs that gate on the surfaces developers actually look at.

## The model

Two questions, in this order:

1. Where does the eye land first?
2. Is that the right thing — the one piece that tells the reader what this is and
   whether it is for them?

Then one check: does anything make the reader want to look away?

## The procedure

1. Read the artifact for about five seconds, the way a stranger would. Do not
   study it. First impression only.

2. Report:
   - **First fixation.** What did the eye hit first? The name, a wall of params,
     a stack trace, a badge wall, a 12-line signature?
   - **Right thing or not.** Did the first fixation tell the reader what this is
     and whether it is theirs? Or did it land on noise?
   - **Repulsion.** What made you want to look away? Cryptic abbreviation, leaked
     internals up front, a screen of imports, ten config options before one
     example.

3. Apply the gate. If the surface repels in the first five seconds, fix the
   surface before anything else. Do not add more docs to a thing that repels.

## Fixes by artifact

- **Function signature** — lead with the verb and the one argument that matters.
  Push the rest into an options object.
- **Error message** — first line says what broke and what to do. Trace below.
- **README** — first screen says what it is, who it is for, and the one command
  to start. Everything else scrolls.
- **CLI `--help`** — most-used command first. Not alphabetical.
- **PR description** — first line is the change and why. Not the ticket number.

## When not to use it

Private code only you touch. The cost of a bad surface scales with the audience.
Do not polish a helper no one else will ever call.
