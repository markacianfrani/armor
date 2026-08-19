# Decision Brief Contract

The final report is an editorial synthesis, not a concatenation of reviewer output. Write for a reader who knows the language and common idioms but has little context about this branch.

Organize the report around the decisions the reader needs to make. Mention agent attribution when disagreement changes the recommendation or independent agreement materially raises confidence. Local numbering is useful for quick replies, and every numbered reference repeats the finding's full title.

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

Define branch-specific terms on first use. Present decision questions after the trigger and impact are clear.

Conventional local improvements may stay to one line. The line includes both the change and its payoff:

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

Use the label **Mutation-proven**. Place the finding under **Reduced test protection** unless the missing protection is itself a concrete merge requirement or critical boundary. A killed mutation is positive validation evidence and may be summarized under **Already sound** or **Review checks**.

## Material disagreement and house rules

When reviewer disagreement changes a recommendation, put a one-line **Disagreement** note under that finding with the competing claim, evidence checked, and resolution.

For each retained house-rule violation, put this beside the finding:

`Basis: AGENTS.md — "[quoted rule]"`

## Section order

1. **Blocking** — merge hazards, separating direct fixes from genuine design choices
2. **Safe improvements worth taking** — non-blocking direct fixes with narrow verified contracts and low blast radius; local type improvements first
3. **Needs your design decision** — multiple valid behaviors, contracts, boundaries, or abstraction choices
4. **Risks to accept or track** — credible non-blocking threats whose fix is not clearly worth its effort now
5. **Reduced test protection** — what the suite could catch before, or should catch now, but cannot; mutation-proven gaps first
6. **Review checks** — compact scope, validation, mutation, house-rule, and confidence metadata

Under **blocking only**, include only concrete blockers and the checks needed to support them. Under **brief**, use one line for conventional findings and one short causal paragraph for non-obvious findings. Otherwise omit empty sections.

## Output template

```markdown
# Review Decision Brief

**Scope:** `[base-ref]@[base-sha]` → `[head-sha]`; working tree [clean | changes included]; [X files]

## At a glance

- Recommendation: [merge | merge after the blocking fixes below | hold for a design decision]
- Blocking: X ([direct fixes], [design choices])
- Safe improvements: X
- Design decisions: X
- Risks to track: X
- Reduced protection: X ([mutation-proven count])
- Validation: [build, tests, and mutation summary]
- Already sound: [one sentence naming the strongest verified area]

## Blocking

### [Outcome-oriented title]

**When:** [Reachable trigger in branch-local terms.]
**What goes wrong:** [Incorrect or unsafe behavior.]
**Impact:** [Practical consequence.]
**Smallest fix:** [Narrowest credible direction.]
**Decision needed:** [Only for multiple valid behaviors or designs.]

**Decision mode:** [direct fix | approval needed | design choice]
**Effort:** [XS | S | M | L | XL]
**Change shape:** [type-only | mechanical | behavioral | design]
**Scope fit:** [this PR | prerequisite | follow-up | separate architecture work]
**Evidence:** [`file:line`, failing test, reproduction, or mutation]
**Disagreement:** [Only when material; competing claim, evidence, resolution.]
**Basis:** [Only for a house-rule violation: `AGENTS.md — "quoted rule"`.]

## Safe improvements worth taking

- **[XS · type-only]** Make [Type] [specific improvement] so [invalid state or caller burden is removed]. [`file:line`]
- **[S · mechanical]** [Contract-preserving cleanup and payoff.] [`file:line`]

## Needs your design decision

### [Decision in plain language]

**Why it matters:** [Current threat or limitation and practical impact.]
**Choices:** [Credible options, including defer.]
**Cost surface:** [Subsystems, contracts, abstractions, dependencies, migrations, operations, and meaningful deletion.]
**Why now:** [Why this complexity belongs in this PR, or why it should be follow-up work.]
**Effort:** [M | L | XL]
**Scope fit:** [this PR | follow-up | separate architecture work]
**Evidence:** [`file:line`]

## Risks to accept or track

- **[Risk title]** — [Trigger and consequence.] **Effort:** [size]. **Change shape:** [kind]. **Revisit when:** [concrete trigger]. [`file:line`]

## Reduced test protection

- **Mutation-proven — [Behavior no longer protected].** [Exact mutation survived; focused command and green tests.] [`file:line`]
- [Statically identified behavior or regression the suite could catch before this diff but cannot catch now.]

## Review checks

- Snapshot: base `[ref]@[sha]` → head `[sha]`; working tree [included state]
- Build: [passed | failed | not run]
- Tests: [result]
- Mutations: [X killed, Y survived, Z inconclusive | skipped with reason]
- House rules: [X checked, none violated | Y violations and Z ambiguous/pre-existing findings filtered | no AGENTS.md, skipped]
- Reviewer disagreement: [none | material disagreements are resolved beside their findings]

## Decisions requested

1. Fix **[full blocking title]** now? [yes / defer]
2. For **[full design title]**, choose [A / B / defer].
3. Take the safe bundle: **[full title]**, **[full title]**? [all / named subset / none]
4. For **[full risk title]**: [accept / track / fix now]
```

Present every proposed code change while supporting approval by titled bundle or exclusion, such as `all blocking, no test-only improvements`. Wait for the user's choices before implementation. Repeat full titles in next steps.
