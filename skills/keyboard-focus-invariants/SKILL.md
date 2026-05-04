---
name: keyboard-focus-invariants
description: >
  Verify WCAG 2.1.1 (Keyboard) compliance by testing fuzzy, property-based focus
  invariants against a live page. Use when auditing keyboard accessibility,
  testing focus management, validating tab order, or checking that interactive
  elements are reachable. Prefer Chrome MCP/devtools tools when available; CDP
  via curl is also supported. Framework-agnostic.
allowed-tools: "Read Bash(curl:*) chrome_devtools_*"
compatibility: "Requires a loaded page in Chrome MCP, or Chrome with --remote-debugging-port and curl."
metadata:
  author: pi-workspace
  version: "0.0.2"
  wcag: "2.1.1"
---

# Keyboard Focus Invariants

A fuzzy, property-based approach to keyboard accessibility testing. Rather than
asserting specific widget behavior, this skill verifies broad invariants that a
well-behaved UI should satisfy. These catch classes of bugs — missing tabindex,
focus traps, incorrect tab order, zombie focusable elements, roving tabindex bugs
— without hard-coding element names.

## Core Model

At its simplest, the keyboard focus checks are:

1. If there is at least one focusable page element, Tab should be able to place
   focus on one.
2. If there is more than one focusable page element, Tab should move focus to a
   different element.
3. From element X, moving forward n steps and backward n steps should return to
   X, within a closed focus scope.
4. If there are n reachable focusable elements, traversal should visit n unique
   elements before repeating.

For whole documents, these checks are boundary-aware: browser chrome, `body`,
iframe edges, and document wrap points may end traversal. For intentional traps
such as modals, dialogs, menus, and popovers, the stricter cyclic version applies.

## Philosophy

Traditional UI tests say "when I click X, Y happens." These tests say "given any
page with focusable elements, these properties should hold." The properties must
match the platform: a normal document is **not** a closed focus trap. Browser tab
navigation can legitimately leave page-owned focus and land on `body`, browser
chrome, or another boundary. Treat that as a boundary, not automatically a bug.

Use stricter cyclic assertions only for contexts that promise a trap, such as
modal dialogs.

## Don't Overfit

This skill is intentionally loose. The magic is in using invariants as probes,
not as a brittle spec for how every page must behave. When a property appears to
fail, classify what happened before calling it a bug.

Ask:

1. **Did focus cross a platform boundary?** `body`, browser chrome, no deep
   active element, iframe boundaries, and document wrap points are often normal.
2. **Is this an intentional interaction model?** Modals, menus, grids, tablists,
   comboboxes, and roving-tabindex widgets have their own focus rules.
3. **Is the enumerator wrong?** If keyboard focus reached a real target that the
   query missed, improve the enumerator instead of forcing the UI to satisfy the
   query.
4. **Did the UI legitimately change?** Focus can reveal controls, open toolbars,
   mount lazy content, or remove disabled actions. Re-enumerate and report the
   mutation.
5. **Is the behavior harmful to a keyboard user?** Prefer user-impact language
   over mechanical failure language.

Report surprising-but-valid behavior as observations or boundaries. Fail only
when the behavior violates a user-centered keyboard expectation: unreachable
controls, stuck focus, invisible focus, focus escaping an active modal, focus
entering hidden/off-screen UI, or an early loop that prevents reaching available
controls.

Complementary to code coverage: invariants exercise the happy geometry. If
coverage shows an uncovered branch, that's where a specific test is needed.

## Setup

The page under test must already be loaded.

Preferred: use Chrome MCP/devtools tools:

- `chrome_devtools_take_snapshot` to inspect the page
- `chrome_devtools_evaluate_script` to enumerate focusables and query active
  element
- `chrome_devtools_press_key` for `Tab` / `Shift+Tab`

Only use raw CDP if the devtools tools are unavailable. In that case, use CDP to
send Tab/Shift+Tab and query the page's deep active element.

## Key Definitions

- **Page focusable:** a visible, enabled, page-owned focus target found by the
  enumerator below.
- **Boundary:** focus leaves the enumerated page-owned set. Examples: `body`, no
  deep active element, browser chrome, or an implementation-specific wrap point.
- **Intentional trap:** a declared modal/dialog/popover state where focus is
  expected to cycle inside a container.

## Invariants

### 1. `focus:existence`

> If there is one or more page focusable elements, pressing Tab from the body
> reaches a page focusable element or a documented initial focus target.

**Procedure:**

1. Focus `<body>`: `document.body.focus()`
2. Press Tab
3. Assert deep active element is not still `<body>` and is either:
   - one of the enumerated page focusables, or
   - a documented initial focus target that the enumerator should be updated to
     include

**What it catches:** Pages where no element is keyboard-reachable. Missing
tabindex, all elements with `tabindex=-1`, JavaScript not mounted, or an
incomplete enumerator.

### 2. `focus:progression`

> From any page focusable element, Tab should either move to a different page
> focusable element or cross a boundary. It should not remain stuck on the same
> element unless an intentional trap explicitly handles that case.

**Procedure:**

1. For each page focusable element E:
   a. Focus E
   b. Press Tab
   c. Classify result as `page-focusable`, `boundary`, or `same`
   d. Fail on `same` unless E is inside an intentional trap with expected
      behavior

**What it catches:** Accidental focus traps, elements that consume Tab without
advancing focus, broken roving tabindex implementations.

### 3. `focus:adjacent-reversibility`

> For observed adjacent page-owned transitions, reverse traversal should undo
> forward traversal.

This replaces the overly prescriptive global `round-trip` invariant. A normal
web page is not required to have a closed cyclic tab order.

**Procedure:**

1. Focus `<body>` and press Tab until you have observed page-owned transitions
   or hit a boundary/loop/safety limit.
2. For every observed transition `A --Tab--> B` where both A and B are page
   focusables:
   a. Focus B
   b. Press Shift+Tab
   c. Assert focus returns to A
3. Ignore transitions that cross a boundary. Report them as boundaries, not
   failures.

**What it catches:** Asymmetric local tab order, elements present in forward
order but skipped in reverse, dynamic insertion/removal that breaks adjacent
navigation.

### 4. `focus:no-early-loop`

> Traversal should not revisit a page focusable before visiting all currently
> reachable page focusables, unless it first crosses a boundary or is inside an
> intentional trap.

**Procedure:**

1. Count expected page focusables N.
2. Focus `<body>`, press Tab.
3. Record each page focusable encountered.
4. Continue pressing Tab until one of these happens:
   - all N page focusables have been visited,
   - focus crosses a boundary,
   - a duplicate page focusable appears,
   - a safety limit is reached, e.g. `N + 5` tabs.
5. Fail only if a duplicate appears before all reachable page focusables were
   visited and before a boundary was crossed.

**What it catches:** Loops inside part of the page, duplicate/repeated tab stops,
incorrect tabindex ordering that prevents later controls from being reached.

### 5. `focus:trap-cycle` — modal/dialog only

> When an intentional focus trap is active, Tab and Shift+Tab cycle only within
> the trap and round-trip behavior is expected.

**Procedure:**

1. Identify the active trap container, e.g. modal/dialog/popover.
2. Enumerate focusables inside the trap.
3. Assert Tab never leaves the trap.
4. Assert forward and reverse traversal are cyclic and symmetric within the trap.

**What it catches:** Leaky modals, inaccessible dialogs, broken first/last
sentinels.

## Enumerating Focusable Elements

Use a fuzzy page-owned focusable set:

- visible, enabled links, buttons, inputs, selects, and textareas
- elements with non-negative `tabindex`
- relevant `summary`, `details`, and `contenteditable` elements
- elements inside open shadow roots
- exclude hidden, inert, disabled, zero-size, or off-page targets unless they can
  actually receive keyboard focus

If keyboard traversal reaches a real target the enumerator missed, treat that as
an enumerator issue before treating it as a UI bug.

Use a deep active element check so focus inside open shadow roots is attributed
to the actual focused element, not just the shadow host.

## Output Format

Keep the report short and invariant-centered:

- `focus:existence`: pass/fail/skip, with the first focused target
- `focus:progression`: pass/fail/skip, with any element that gets stuck
- `focus:adjacent-reversibility`: pass/fail/skip, with the transition that does
  not reverse
- `focus:no-early-loop`: pass/fail/skip, with any repeated element before all
  reachable elements are visited
- `focus:trap-cycle`: pass/fail/skip, only when a modal/dialog trap is active

For failures, include enough context to reproduce: which element, key sequence,
what was expected vs. observed, and whether a boundary was crossed.

Report boundary crossings as observations, not failures.

## Extending

Additional invariants to consider:

- **Reachability:** Every visible interactive element is visited before boundary
  or has an explicit reason it is not tabbable.
- **No off-screen focus:** Focused element is within the viewport.
- **Focus indicator:** Focused element has a visible focus ring or equivalent.
- **Modal trap:** When a modal is open, Tab cycles only within the modal.
- **Escape dismissal:** Escape closes modals/popups that were opened by keyboard.

Each can be expressed as a fuzzy invariant with boundary-aware classification.

## References

- [WCAG 2.1.1 Keyboard](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)
