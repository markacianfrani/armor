---
name: diataxis
description: >
  Diátaxis documentation framework — the four kinds of documentation (tutorials, how-to guides,
  reference, explanation) and how to apply the framework iteratively. This skill should be used
  whenever classifying documentation types, reviewing docs for boundary violations (a doc trying
  to be both a tutorial and reference), deciding how to structure new documentation, or applying
  the Diátaxis compass to improve existing docs. Also trigger when the user mentions "Diátaxis",
  "four kinds of documentation", "tutorial vs how-to", "documentation types", or asks whether
  a doc should be a tutorial, how-to, reference, or explanation.
---

# Diátaxis Documentation Framework

Diátaxis identifies four fundamentally different kinds of documentation, each serving a different
need and requiring a different writing approach: **tutorials**, **how-to guides**, **reference**,
and **explanation**. Crossing or blurring the boundaries between them is at the heart of most
documentation problems.

## The Four Kinds

### Tutorials

A tutorial is a **lesson** — it takes a learner by the hand through a practical experience.
The purpose is to develop skills and confidence, not to get from A to B. The user learns through
what they do, not because someone tried to teach them. Like a driving lesson: the goal is the
student's growth, not the destination.

### How-to Guides

A how-to guide addresses a **real-world goal or problem** with practical directions. It serves
an already-competent user who needs help getting their work done. Concerned with _work_ rather
than _study_. Examples: "How to configure frame profiling", "Troubleshooting deployment problems."

### Reference

Reference contains **technical description** — accurate, complete, reliable facts free of
distraction and interpretation. It's neutral and not concerned with what the user is doing.
Where possible, the architecture of reference docs should mirror the structure of the thing
being described, like a map mirrors terrain.

### Explanation

Explanation provides **context and background** — it helps answer _why?_ and puts things in
a bigger picture. It can contain opinions and take perspectives. It often needs to circle
around its subject from different directions.

## The Diátaxis Compass

Use this table to classify documentation and spot boundary violations:

| If the content…       | …and serves the user's…  | …then it belongs to… |
| --------------------- | ------------------------ | -------------------- |
| informs **action**    | **acquisition** of skill | a **tutorial**       |
| informs **action**    | **application** of skill | a **how-to guide**   |
| informs **cognition** | **application** of skill | **reference**        |
| informs **cognition** | **acquisition** of skill | **explanation**      |

Key axes:

- Tutorials and how-to guides are about what the user **does** (action)
- Reference and explanation are about what the user **knows** (cognition)
- Tutorials and explanation serve **study** (acquiring skill)
- How-to guides and reference serve **work** (applying skill)

## Common Boundary Violations

The most frequent documentation problem: a doc tries to serve multiple purposes and serves
none of them well. Watch for:

- **Tutorial + Reference**: A walkthrough that keeps stopping to exhaustively list every
  parameter or option. The learner gets lost; the reference user can't find what they need.
- **Tutorial + Explanation**: A lesson overloaded with _why_ when the student just needs to
  do the next step. Better to give minimal explanation ("We use HTTPS because it's safer")
  and link to a dedicated explanation article.
- **How-to + Explanation**: A procedure that keeps justifying itself instead of getting to
  the point. The competent user just wants the steps.
- **Reference + Explanation**: Facts mixed with opinions and context. Reference should be
  neutral and scannable; explanation should be discursive and exploratory.

When a doc is straddling categories, the fix is usually to **split it** — not to try harder
to make one doc do both jobs.

## Applying Diátaxis: The Iterative Approach

Diátaxis is a **guide**, not a plan. Don't try to reorganize all documentation at once.
Don't create empty sections for tutorials/how-to/reference/explanation with nothing in them.

### The workflow

1. **Choose something** — any piece of documentation, however small. A page, a paragraph,
   a sentence. Don't go looking for problems; just look at what's in front of you.
2. **Assess it** — What user need does this serve? How well? What can be added, moved,
   removed, or changed? Does its language match the requirements of its documentation type?
3. **Decide on one thing** — one single action that would improve it right now.
4. **Do that thing** — and consider it done. Publish it. Don't feel you need to do more.

Then repeat.

### Key principles

- **Don't impose structure from above.** If you keep making small improvements guided by
  Diátaxis, the structure will emerge from the inside. The documentation takes shape because
  it has been improved, not the other way round.
- **Work one step at a time.** Every step in the right direction is worth publishing
  immediately. Don't wait until you have something substantial to show.
- **Don't tear it all down.** Even a complete mess can be improved iteratively. Each
  improvement gives you a clue about what to do next.
- **Complete, not finished.** Documentation is never finished (it always evolves) but it
  can always be complete — useful and appropriate to its current stage, like a plant at
  any point in its growth.

Five minutes improving one paragraph using the Diátaxis compass is more valuable than
spending a day planning a reorganization you never execute.

## Using This Framework

When **triaging or reviewing** existing docs: use the compass to classify each doc's content.
Flag boundary violations. Recommend splits where a doc is trying to do two jobs poorly.

When **writing** new docs: decide which of the four types this doc is _before writing_. Let
that choice constrain the style, structure, and content.

When **improving** docs: pick one thing in front of you, assess it against the compass, make
one improvement, ship it.

---

_Framework by Daniele Procida. Full details at [diataxis.fr](https://diataxis.fr)_
