---
description: "Walkthrough branch changes with teaching-focused feedback"
allowed-tools: ["Bash", "Glob", "Grep", "Read"]
---

# Mentor Review

Walk through the changes on this branch and provide structured feedback.

```bash
git diff main --name-only
git diff main
```

---

## Stage 1 - Vibe Check

- Any high level concerns?
- What parts are confusing?

---

## Stage 2 - Reduce, Recycle, Reuse

- Identify the pieces that are net new additions
- Describe them
- Are there opportunities to reuse existing functionality?

---

## Stage 3 - Well Actually

- Pick a piece of code from the changes and show me how you would write it instead
- Use this as an opportunity to teach me about any new additions to the language or framework that I may not have been aware of
- Only if it's relevant — I learn best when I can apply concepts in my day to day

---

## Stage 4 - Final Sweep

- Are all the drawers closed?
- Logs cleaned up?
- Have all the docs been updated?
