# Empty State Ambiguity

## Context

You have a list, table, or collection view. The user sees no items displayed.

## Problem

"No results" can mean two completely different things:

1. **Zero data** — The user has never created anything here. The system is empty.
2. **Filtered to empty** — Data exists, but current filters/search exclude everything.

Both produce the same visual outcome (an empty screen) but require opposite responses from the user.

## Forces

- **Zero-data users** need onboarding: "Here's how to add your first item"
- **Filtered-to-empty users** need recovery: "Clear filters" or "Broaden your search"
- **Developers** often use a single empty state component for both cases
- **Designers** want a clean, simple empty state—not two different ones
- **Users** blame themselves ("I must have done something wrong") when the system gives no signal

## Therefore

**Distinguish zero-data from filtered-to-empty with different messaging and actions.**

For zero-data:
- Explain what this area is for
- Provide a primary action to create the first item
- Consider showing example content or templates

For filtered-to-empty:
- Acknowledge that filters are active
- Show a "Clear filters" or "Reset" action
- Optionally show how many total items exist ("0 of 47 items match")

## Examples

**Anti-pattern:**
User searches for "acme" in a customer list. No results. Screen shows: "No customers yet. Add your first customer."

User thinks: "Wait, I know I have customers. Is the system broken?"

**Pattern applied:**
Same search. Screen shows: "No customers match 'acme'. Clear search · View all 47 customers"

User thinks: "Ah, my search term is wrong" and recovers.

---

**Anti-pattern:**
New user lands on dashboard with active date filter defaulting to "Last 7 days." They created their account today, so no activity exists in that range. Screen shows: "No activity found."

User thinks: "The product is broken, nothing is tracking."

**Pattern applied:**
Same scenario. Screen shows: "No activity in the last 7 days. You joined today—check back soon, or view all time."

User understands the system is working, just nothing to show yet.

## Resulting Context

Users recover from filtered-to-empty without support tickets. New users aren't confused by empty states that assume data exists. The system feels responsive to user context rather than blindly reporting "nothing here."

## Builds On

- **Contextual Feedback** (messages reflect user's current state, not just system state)

## Enables

- **Guided Recovery** (users always have a next step when stuck)
- **Filter Transparency** (users understand why they're seeing what they're seeing)

## Confidence

High — this tension appears in every SaaS app with filterable lists: CRMs, dashboards, admin panels, e-commerce catalogs, search results, activity feeds.
