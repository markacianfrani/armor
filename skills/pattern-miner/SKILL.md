---
name: pattern-miner
description: >
  Mine Figma comment threads to discover design patterns. Analyzes threads for
  repeated tensions, debates, exceptions, and recurring problems. Uses LLM reasoning
  to identify patterns from actual content rather than keyword matching.
  Requires Figma REST API access (FIGMA_PAT environment variable).
license: MIT
compatibility: Requires FIGMA_PAT env var, Python 3.8+
metadata:
  category: design-systems
  domain: figma
  output: pattern-candidates
---

# Pattern Miner

Extract design patterns from Figma comment threads by identifying repeated tensions, debates, and design decisions.

## What Makes a Good Pattern

A pattern is NOT just a documented design decision. A good pattern:

1. **Repeated** - The same fundamental tension appears in multiple threads with different surface topics
2. **Shortcut** - Would having this pattern have shortened those original threads?
3. **Agnostic** - The solution isn't tied to a specific domain, component, or context
4. **Reusable** - Can be applied to new situations you haven't encountered yet
5. **Standalone** - Works on its own without requiring other patterns
6. **Composable** - Can build on other patterns and enable new ones

**Example of repetition:**
- Thread #425: "Expired vs cancelled vs nonrenewed" (insurance status)
- Thread #549: "Limited water damage" (coverage terminology)
- **Same fundamental tension**: Domain terminology that users misinterpret
- **Agnostic solution**: When domain terms differ from common usage, explicitly label the distinction

**Not a pattern:**
- A one-off debate about button color
- A context-specific decision that wouldn't apply elsewhere
- An incident, not a recurring problem

## Philosophy

**Let the patterns emerge from the content.** Don't pre-define what tensions to look for. Instead:

1. Pull threads with substantial debate (4+ replies)
2. Have the LLM analyze each thread for the *fundamental* tension (not surface topic)
3. Look for the same tension appearing with different surface topics
4. Patterns emerge from repetition across contexts

## What This Skill Does

1. Fetches comments from Figma files via REST API
2. Groups into threads and filters for significant debates
3. For each thread, asks: "What is being debated? What are the forces in tension?"
4. Clusters similar tensions to find patterns
5. For each pattern, extracts: when-to-apply, decision framework, precedent

## Usage

### Step 1: Fetch Comments

```bash
export FIGMA_PAT="your-token-here"
python scripts/fetch_comments.py <file_key> --output comments.json
```

### Step 2: Extract Threads

```bash
python scripts/extract_threads.py comments.json --min-replies 4 --output threads.json
```

### Step 3: Analyze for Patterns

Feed threads to LLM with this prompt structure:

```
For each thread, identify:
1. What is the core question or tension?
2. What forces are in conflict?
3. Who are the stakeholders (by role, not name)?
4. Was it resolved? How?
5. What conditions would trigger this same debate again?
```

### Step 4: Cluster and Synthesize

After analyzing threads individually, cluster by similarity:

```
Given these thread analyses, identify patterns:
- Which tensions appear repeatedly?
- What recurring problems keep coming up?
- Are there exceptions that keep being debated?

For each pattern found:
- Name it
- Describe the forces in tension
- State when it applies
- Provide a decision framework
- Cite example threads as precedent
```

## Mining Heuristics

### Thread Selection
- **4+ replies**: Real debate happening
- **Multiple roles**: Design + Eng + Legal = richer pattern
- **Contains questions**: Uncertainty being resolved
- **Contains disagreement**: Competing perspectives

### Pattern Quality
A good pattern has:
- **Repetition**: Appears in 3+ threads
- **Clear forces**: Identifiable stakeholders/concerns in tension
- **Testable trigger**: Know when to apply
- **Resolution path**: How to decide when it applies

### What to Look For

Let the LLM identify these organically, but common pattern types include:

- **Tension patterns**: Two legitimate concerns in conflict
- **Exception patterns**: Standard rules that keep getting broken
- **Terminology patterns**: Words that cause confusion or debate
- **Control patterns**: UI element selection debates
- **Scope patterns**: What's in/out arguments
- **Stakeholder patterns**: Design vs Eng vs Legal vs Product

## Analysis Prompts

### Thread Analysis Prompt

```
Analyze this Figma comment thread for pattern mining:

Thread ID: {thread_id}
Replies: {reply_count}
Participants: {participants}

Messages:
{formatted_messages}

Questions:
1. What is the fundamental tension here? (Not the surface topic - the underlying conflict)
2. Strip away the specific context (insurance, this button, etc.) - what's the abstract problem?
3. What forces are in conflict? Who wants what?
4. Was a resolution reached? Is it generalizable or context-specific?
5. Have you seen this same fundamental tension in other threads?

Output as JSON:
{
  "surface_topic": "what they're literally discussing",
  "fundamental_tension": "the abstract underlying conflict",
  "forces": [
    {"stakeholder": "role", "wants": "what they're optimizing for"}
  ],
  "resolution": "string or null",
  "resolution_is_agnostic": true/false,
  "similar_to_threads": ["thread_ids if you've seen this tension before"]
}
```

### Pattern Detection Prompt

```
I have analyzed {n} Figma comment threads. Here are the tensions found:

{thread_analyses}

Look for REPEATED tensions - the same fundamental conflict appearing with different surface topics.

A good pattern:
- Appears in 2+ threads with different contexts
- Has an agnostic solution (not tied to specific domain)
- Is reusable in new situations you haven't seen
- Can stand alone but may also build on other patterns

For each repeated tension, identify:
1. Name: Short, context-free identifier
2. The fundamental tension (abstract)
3. Which threads exhibit it (with their surface topics)
4. An agnostic solution principle
5. What patterns it builds on (if any)
6. What patterns might build on it (if any)

Ignore one-off debates that don't repeat. We want patterns, not incidents.

Output as JSON array.
```

### Pattern Synthesis Prompt

```
Write a pattern document for:

Pattern: {name}
Appears in threads: {thread_ids}

A good pattern:
- States a recurring tension clearly
- Provides a solution that works across contexts
- Is specific enough to be actionable
- Is abstract enough to be reusable
- Can stand alone
- References related patterns it builds on or enables

Include:

## {Pattern Name}

### Tension
What fundamental forces are in conflict? (Context-agnostic)

### Solution
A clear, reusable principle. Not "do X in insurance forms" but "do X when Y condition exists."

### When to Apply
Trigger conditions that are testable and context-free.

### Resolution Framework
How to decide. If/then logic or decision tree.

### Builds On
What existing patterns does this assume or extend?

### Enables
What patterns become possible once this is in place?

### Examples
Thread references showing this tension with different surface topics.

### Anti-patterns
What does violating this pattern look like?
```

### Cross-Thread Repetition Check

After analyzing all threads, explicitly look for repetition:

```
Review all the fundamental tensions you identified:

{list_of_tensions}

Which tensions appear MORE THAN ONCE with different surface topics?

For each repeated tension:
- List the threads where it appears
- Note how the surface topic differs but the tension is the same
- Rate confidence that this is truly the same pattern (high/medium/low)

These repeated tensions are your pattern candidates. One-offs are noise.
```

## Output Format

```json
{
  "file_key": "ABC123",
  "threads_analyzed": 45,
  "patterns": [
    {
      "name": "pattern-name",
      "tension": "The fundamental conflict (context-agnostic)",
      "solution": "A reusable principle that resolves the tension",
      "citations": [
        {
          "thread": "#377",
          "node_id": "1437:18469",
          "file_key": "ABC123",
          "surface_topic": "Phone number helper text"
        }
      ],
      "trigger_conditions": [
        "Context-free conditions when this applies"
      ],
      "resolution_framework": "IF condition THEN action",
      "builds_on": ["other-pattern-name"],
      "enables": ["patterns-this-makes-possible"],
      "anti_patterns": [
        "What violating this looks like"
      ],
      "confidence": "high/medium/low based on repetition"
    }
  ],
  "noise": [
    {
      "thread_id": "#123",
      "why_not_pattern": "One-off, context-specific, no repetition"
    }
  ]
}
```

## Cross-File Mining

After mining multiple files, aggregate patterns:

1. Run pattern mining on each file
2. Collect all pattern candidates
3. Cluster similar patterns across files
4. Patterns in 3+ files = organizational patterns (highest value)

```
Given patterns from multiple files:
{file_patterns}

Identify organizational patterns - tensions that appear across the organization.
These are the highest-value patterns for agent skills.
```

## From Pattern to Agent Skill

Once a pattern is validated across files:

1. **Encode trigger conditions** - When should an agent check for this?
2. **Encode decision logic** - What questions to ask, what to recommend
3. **Link precedent** - Reference threads that resolved this well
4. **Make composable** - How does this interact with other patterns?

## Limitations

- Requires substantial comment history (100+ comments recommended)
- Only analyzes text, not visual context
- Pattern quality depends on thread quality
- Resolution not always explicit in threads
