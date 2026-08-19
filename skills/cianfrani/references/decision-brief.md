# Decision Brief Contract

The final report is an editorial synthesis, not a concatenation of reviewer output. Write for a reader who knows the language and common idioms but has little context about this branch.

Organize the report around the decisions the reader needs to make. Give every retained finding a stable category ID: `B` for blocking, `S` for safe improvement, `D` for design decision, `R` for tracked risk, and `P` for reduced protection. Begin with a compact index of every ID, title, effort, and requested disposition. Use the ID with the full title in detailed sections. Mention agent attribution when disagreement changes the recommendation.

## Classification

Classify each retained finding on independent dimensions.

### Urgency

- **Blocking:** a reachable path violates a stated requirement or creates a concrete correctness, security, data-loss, or operational merge hazard.
- **Non-blocking:** useful improvement or credible risk that does not meet the blocking bar.

Unverified assumptions and unresolved product choices are not blockers.

### Decision mode

- **Direct fix:** intended behavior is unambiguous.
- **Approval needed:** the tradeoff is understood, but the user must opt into the scope or cost.
- **Design choice:** multiple valid behaviors, contracts, boundaries, or product outcomes exist.

A behavioral change can be a direct fix when the intended behavior is clear.

### Change shape

- **type-only:** no emitted runtime, API, schema, serialization, model-facing, or configuration change
- **mechanical:** behavior- and contract-preserving
- **behavioral:** changes an externally observable result or contract
- **design:** chooses or changes a boundary, responsibility, durable abstraction, or public contract

Classify by semantic impact. A model-facing tool rename or serialized-field rename is behavioral even when implemented by search-and-replace.

### Relative effort

- **XS:** one obvious local edit with no new behavior choice, API, dependency, or abstraction
- **S:** one or two files with local validation and no durable contract or migration
- **M:** several files, a meaningful local behavior change, or a small internal abstraction with limited call sites
- **L:** cross-subsystem change, public contract, migration, operational rollout, or durable system boundary
- **XL:** multi-repository or platform migration, subsystem rewrite, or staged rollout needing its own plan

These are t-shirt sizes, not time estimates. Size from implementation surface and responsibility rather than line count. A thin internal seam may be small; a short protocol hook may carry large operational responsibility.

For `M` and above, or any design-shaped item, name the cost surface:

- likely subsystems and contracts
- new nouns, types, classes, or abstractions
- dependencies or framework capabilities duplicated
- migrations, backfills, rollout, or administrative work
- protocol, lifecycle, state, and operational responsibilities
- meaningful code or responsibility removed

Check whether an existing framework or seam already solves the problem. State why the complexity belongs in this PR. When it belongs later, name the follow-up and a concrete revisit trigger.

## Explanation density

Write non-obvious findings in plain branch-local language:

1. **When:** the reachable trigger
2. **What goes wrong:** the incorrect, unsafe, or misleading behavior
3. **Impact:** what the user, operator, or next developer experiences
4. **Smallest fix:** the narrowest credible direction, with alternatives where they represent a real decision

Define branch-specific terms on first use. Present decision questions after the trigger and impact are clear. Use one compact causal paragraph when it carries the same meaning as four labeled fields. Include one decisive reproduction rather than a chronology of experiments. Use a table only when comparing options or measurements changes the decision.

Conventional local improvements stay to one line. The line includes both the change and its payoff:

> Make `PermissionArgs` a discriminated union so each permission kind requires only its valid fields.

Before retaining a routine type finding, verify that the existing type does not already express the invariant and that deleting an unnecessary cast or annotation would not be smaller. Exported, schema-coupled, or widely fanned-out type changes are classified by that scope.

## Mutation findings

Mutation evidence is empirical and appears before static findings within the same section.

For a survived mutation, state:

- the exact assertion or implementation mutation
- the focused test command
- that the baseline passed
- which tests remained green
- the behavior the suite therefore cannot catch

Use the label **Mutation-proven**. Place the finding under **Reduced test protection** unless the missing protection is itself a concrete merge requirement or critical boundary. A killed mutation is positive validation evidence summarized in the brief's compact **Evidence** line.

## Material disagreement and house rules

When reviewer disagreement changes a recommendation, put a one-line **Disagreement** note under that finding with the competing claim, evidence checked, and resolution.

For each retained house-rule violation, put this beside the finding:

`Basis: AGENTS.md — "[quoted rule]"`

## Section order

1. **Finding index** — every finding in one referenceable table
2. **Blocking** — merge hazards, separating direct fixes from genuine design choices
3. **Safe improvements worth taking** — non-blocking direct fixes with narrow verified contracts and low blast radius; local type improvements first
4. **Needs your design decision** — multiple valid behaviors, contracts, boundaries, or abstraction choices
5. **Risks to accept or track** — credible non-blocking threats whose fix is not clearly worth its effort now
6. **Reduced test protection** — what the suite could catch before, or should catch now, but cannot; mutation-proven gaps first
7. **Verification gaps** — only failed, skipped, or inconclusive checks that materially limit confidence or require action

The **Scope**, **Recommendation**, and **Evidence** lines replace an at-a-glance metrics block. Summarize successful checks in **Evidence** instead of narrating each command, retry, workspace, or clean result. Omit **Verification gaps** when nothing material is missing. A resolved environment failure stays out of the brief unless it leaves the result uncertain.

Retain a pre-existing issue only when this diff materially exposes, worsens, or depends on it. Label that relationship in one clause. Other pre-existing issues are outside this review.

Under **blocking only**, include only concrete blockers and the evidence needed to support them. Under **brief**, use one line for conventional findings and one short causal paragraph for non-obvious findings. Otherwise omit empty sections.

## Output template

```markdown
# Review Decision Brief

**Scope:** `[base-ref]@[base-sha]` → `[head-sha]`; working tree [clean | changes included]; [X files]
**Recommendation:** [merge | merge after B1 and B2 | hold for D1]
**Evidence:** [compact summary, for example: `build ✓ · tests 109/109 ✓ · mutations 8 killed/0 survived · house rules ✓`]

## Finding index

| ID  | Finding                         | Effort | Decision               |
| --- | ------------------------------- | -----: | ---------------------- |
| B1  | [Full blocker title]            |      S | [fix / A or B / defer] |
| S1  | [Full safe-improvement title]   |     XS | [safe bundle]          |
| D1  | [Full design-decision title]    |      L | [A / B / defer]        |
| R1  | [Full tracked-risk title]       |      M | [accept / track / fix] |
| P1  | [Full reduced-protection title] |      S | [fix test / accept]    |

## Blocking

### B1 — [Outcome-oriented title]

**[XS | S | M | L | XL] · [type-only | mechanical | behavioral | design] · [direct fix | approval needed | design choice] · [scope fit]**

**When:** [Reachable trigger.] **What goes wrong:** [Incorrect behavior.] **Impact:** [Practical consequence.]
**Smallest fix:** [Narrowest credible direction or short A/B choice.]
**Evidence:** [`file:line`, failing test, reproduction, or mutation]
**Disagreement:** [Only when material; competing claim, evidence, resolution.]
**Basis:** [Only for a house-rule violation: `AGENTS.md — "quoted rule"`.]

## Safe improvements worth taking

- **S1 · XS · type-only — [Full title].** [Change and payoff.] [`file:line`]
- **S2 · S · mechanical — [Full title].** [Contract-preserving cleanup and payoff.] [`file:line`]

## Needs your design decision

### D1 — [Decision in plain language]

**[M | L | XL] · design · [scope fit]**

**Why it matters:** [Threat and impact.] **Choices:** [A / B / defer.]
**Cost surface:** [Subsystems, contracts, abstractions, dependencies, migrations, operations, and meaningful deletion.]
**Why now:** [Why this belongs in the PR or should be follow-up work.]
**Evidence:** [`file:line`]

## Risks to accept or track

- **R1 · [effort] · [shape] — [Full title].** [Trigger and consequence.] **Revisit when:** [concrete trigger]. [`file:line`]

## Reduced test protection

- **P1 · Mutation-proven — [Full title].** [Exact mutation survived and the behavior the green tests cannot catch.] [`file:line`]
- **P2 — [Full title].** [Protection lost or missing.] [`file:line`]

## Verification gaps

- [Only a failed, skipped, or inconclusive check that changes confidence or requires a decision.]

Reply with IDs or bundles, for example: `B1 A, B2 yes, S all, D1 defer, P1 fix`.
```

Present every proposed code change while supporting approval by titled bundle or exclusion, such as `all blocking, no test-only improvements`. Wait for the user's choices before implementation. Repeat full titles in next steps.
