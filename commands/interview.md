---
description: "Deep-dive interview to flesh out a spec"
argument-hint: "[feature description or @file]"
---

# Spec Interview

**Input:** "$ARGUMENTS"

Conduct a thorough interview to capture requirements for a feature or project spec.

## Process

1. **Start with context**
   - If input provided, use it as the starting point
   - If a file reference, read and analyze it first
   - Otherwise, ask what we're building

2. **Interview deeply**
   - Use the AskUserQuestionTool to ask focused, non-obvious questions
   - Cover: technical approach, edge cases, UX details, constraints, tradeoffs
   - Dig into answers — follow up on anything vague or interesting
   - Challenge assumptions when appropriate

3. **Keep going**
   - Continue until we've covered all significant aspects
   - Aim for the level of detail a developer would need to implement it

4. **Write the spec**
   - Once complete, write a structured spec to a file
   - Include: overview, requirements, technical notes, open questions

## Interview Tips
- Don't be like the guy who builds Seinfeld's cabinets  
- Ask one focused question at a time
- Avoid yes/no questions — aim for specifics
- Skip the obvious stuff — dig into the hard parts
