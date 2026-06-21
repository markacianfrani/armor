---
name: affordance-audit
description: >
  Audit an API, CLI, or config surface for what it makes easy (affordances) and
  what it makes easy to get wrong (anti-affordances, footguns). Finds the
  pit-of-success versus the footgun, and the smell where the primary use is
  smooth but the secondary use is awkward. The principle: good design you act
  through without noticing; bad design makes you fight it.
  Use when designing or reviewing a public interface, library, SDK, or command
  surface. Triggers on "API ergonomics", "is this easy to misuse", "footgun",
  "pit of success", "review this interface", "review this CLI", "ergonomics".
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1.0"
---

# Affordance Audit

A good affordance you never notice. You act through it. A bad one — an
anti-affordance — makes you fight the thing, and the fight shows up as bugs.

A surface can satisfy its main job and still carry secondary anti-affordances
that make every other use awkward. That split is the thing to hunt.

## The procedure

1. Walk the public surface. For each entry point, ask what it invites the caller
   to do.

2. **Affordances.** What does the easy path get you? The good case: the easy path
   and the correct path are the same thing. The caller falls into success.

3. **Anti-affordances.** What is easy to get wrong?
   - Surprising default — the safe choice is not the default.
   - Order dependence — must call A before B, and nothing stops you doing B first.
   - Unclosed resources — you have to remember cleanup; nothing enforces it.
   - Stringly-typed params that accept nonsense and fail later, far away.
   - The demo trap — works in the example, fights you in prod: sync by default,
     no pagination, no timeout, no retry.

4. **The split smell.** Primary use smooth, secondary use awkward. Name both.
   This is the most common and most missed finding.

5. For each anti-affordance, the fix is one of three:
   - Make the wrong thing impossible. Types, not docs.
   - Make it loud. Fail fast and near the mistake, not late and far away.
   - Make the right thing the default.

6. Report as a table:

   | Surface | Invites | Footgun | Fix |
   | ------- | ------- | ------- | --- |

## When not to use it

A stable, widely-used API you cannot change without breaking callers. Audit those
for documentation, not redesign. The footgun you cannot remove still deserves a
loud warning sign.
