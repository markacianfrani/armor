---
name: layout-shift-qa
description: >-
  Detect unnecessary layout shifts (jank / CLS) in a web UI by instrumenting Chrome with PerformanceObserver while driving real interactions. Use whenever the user asks to check a UI for layout shifts, jank, jumpiness, content shifts, CLS, or Core Web Vitals — phrases like "check for layout shifts", "is it janky", "is anything jumping", "QA the UI", "any CLS issues". Also use proactively as part of any browser-based verification of a UI change: after taking screenshots or driving an interaction in the browser to confirm a feature works, run this pass to confirm the feature doesn't move already-painted content unexpectedly. The check is cheap (≈10 seconds in the same browser session) and catches a class of bug that static reading and casual screenshotting both miss.
allowed-tools: Read, ToolSearch, mcp__chrome-devtools__*
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1"
---

## What this skill does

Most layout-shift bugs are invisible to the eye in real-time but obvious in slow-motion video. The cheaper alternative is instrumentation: Chrome already emits a `layout-shift` performance entry every time something on the page moves, and the `chrome-devtools` MCP can drive the page while you read those entries.

This skill turns that into a repeatable QA loop:

1. Open the page in Chrome (via the MCP).
2. Hook a `PerformanceObserver({type: 'layout-shift'})` so every shift gets logged with its value, sources, and per-node bounding-rect deltas.
3. Drive the user flow you're QA'ing (typing, clicking, opening modals, etc.).
4. Read the captured shifts back as JSON.
5. Interpret the deltas: which DOM node moved, by how many pixels, in which direction.
6. **Validate the instrumentation by deliberately re-introducing the bug** (revert the suspected fix, rerun) — a `count: 0` result on its own doesn't prove anything; it could mean nothing shifted *or* the observer wasn't watching. The A/B step is what makes the result trustworthy.

## The four root causes

Once you've run the recipe and have shifts to interpret, every shift you see falls into one of four causes. Use this taxonomy to map an observed shift to a fix.

**1. State-driven content swap in document flow.** Some piece of state — input value, toggle, fetch result, hover, focus — controls what content occupies a layout slot, and the content for state A has different intrinsic dimensions than the content for state B. When the state flips, neighbors reflow. Component shape doesn't matter (search results, accordion body, tab panel, validation message, typing indicator are all the same bug). The fix is to reserve space: pin the slot's dimensions, or render an equivalent-sized placeholder for the "absent" state.

**2. Animation on a layout-affecting property.** A CSS transition or keyframe whose target property is in the box model — width, height, padding, margin, top, left, inset, border-width, font-size — emits one shift entry per animation frame and reflows neighbors on each frame. The presence of multiple small shift entries clustered in a 100–300ms window is the signature. The fix is to animate `transform` or `opacity` instead, or remove the transition.

**3. Async content arrival into an unsized slot.** Anything that lands after first paint and pushes already-painted neighbors: images and videos without explicit `width`/`height`/`aspect-ratio`, web fonts swapping to different metrics, lazy-hydrated components, fetched data filling a slot whose loading state had different dimensions. The pattern is "the layout was decided when this was absent, and now it's present." The fix is to make the slot's dimensions independent of the content arriving — explicit media dimensions, font-display tuning, skeletons sized to match real data.

**4. Viewport-dependent reflow.** The scrolling root or the viewport changes. Most common: page grows tall enough to need a vertical scrollbar, the scrollbar appears, takes ~15px of width, every centered element yanks horizontally. Signature: shift entries with non-zero `dx` and zero `dy`. Fix: `scrollbar-gutter: stable` on the html element so the gutter is always reserved. Also in this category: window resize crossing a container-query breakpoint, orientation change, dynamic viewport units recalculating.

The unifying property across all four: a node that was already painted ends up occupying a different amount of layout space than it did a moment ago. If the change under review can do that, it can shift.

## The recipe

Read this end to end before starting; the steps depend on each other.

### Step 0 — make sure the page is reachable

The `chrome-devtools` MCP needs the page to actually load. If the route is behind auth and you don't have a session, either log in once interactively, or temporarily relax the guard for the route under test (and *restore it before commit*). Either way: you can't QA a 302-to-login.

The MCP tools you'll use are deferred — load them via `ToolSearch` with this query:

```
select:mcp__chrome-devtools__list_pages,mcp__chrome-devtools__new_page,mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__select_page,mcp__chrome-devtools__take_snapshot,mcp__chrome-devtools__fill,mcp__chrome-devtools__click,mcp__chrome-devtools__wait_for,mcp__chrome-devtools__evaluate_script,mcp__chrome-devtools__performance_start_trace,mcp__chrome-devtools__performance_stop_trace
```

### Step 1 — open the page with the observer pre-installed

`navigate_page` accepts an `initScript` that runs **before any of the page's own scripts on the next navigation**. That's the right place to attach the observer so you don't miss shifts that happen during initial render.

The observer should:

- Push every `layout-shift` entry into a global array (e.g. `window.__shifts`).
- For each entry capture: `value`, `hadRecentInput`, `startTime`, and the `sources` array. For each source capture a node identifier (nodeName + className is enough) plus `previousRect` and `currentRect` (x, y, width, height).
- Use `buffered: true` on first attach so initial-render shifts aren't missed.
- Expose a small reader function on `window` that returns `{ count, cumulativeValue, entries }`.

After the page loads, optionally read and reset the array to separate "initial-load" shifts from "interaction-driven" shifts.

### Step 2 — drive the user flow

Use the same flow a real user would — `take_snapshot` to find element `uid`s, then `fill`, `click`, `wait_for` to make things happen. Keep the flow tight; you only need long enough for the suspect interaction to complete.

A few useful patterns:

- **For search-as-you-type / autocomplete**: `fill` the input, `wait_for` the result text, then read shifts.
- **For accordion / tab / modal**: `click` the trigger, `wait_for` the revealed content, then read shifts.
- **For toggles that might cause repeated motion**: drive the toggle a few times. Animation-frame shifts often only show on the second or third toggle.

If you need to reset between scenarios, just clear `window.__shifts = []` via `evaluate_script`.

### Step 3 — read the shifts back

Via `evaluate_script`, return a digest of the captured shifts. For each entry, compute `dx` and `dy` per source as `currentRect - previousRect` (rounded to integer pixels) and drop sources missing either rect.

The `dx` / `dy` per source are the ground truth — **which** node moved, in **which** direction, by **how many** pixels. The cumulative value scalar is for CLS scoring; the per-source deltas are for diagnosis.

### Step 4 — A/B validate the instrumentation

This is the step most engineers skip and the reason results often aren't trustworthy.

A `count: 0` reading proves nothing on its own. It could mean:

1. There's genuinely no shift. ✅
2. The observer never attached (initScript didn't run, page reloaded after observer was set up, the wrong frame was instrumented).
3. The flow you drove didn't actually exercise the suspect code path.

To rule out (2) and (3), do one round with the bug deliberately re-introduced:

- Revert the suspected fix in the source file (smallest possible revert — flip one CSS property, re-add one conditional class, etc.).
- Reload the page and **re-attach the observer** (see "Common gotcha #1" below).
- Rerun the same flow.
- Confirm the observer reports non-zero shifts pointing at the elements you expect.
- Restore the fix, rerun, confirm `count: 0`.

Now `count: 0` is meaningful — you've shown the observer can see shifts in this DOM, on this flow, and your fix is what's making them stop.

### Step 5 — restore everything

If you relaxed an auth guard, dev-only stress-test affordance, etc., put it back. Lint + build before declaring done.

## Common gotchas (each cost me a debugging session at some point)

1. **`initScript` only runs on the next navigation, not on reload.** If you `navigate_page` with `type: 'reload'`, the script attached to the previous load is gone and `window.__shifts` / `window.__shiftSummary` are undefined. Either re-navigate (`type: 'url'`) with the initScript again, or re-inject the observer via `evaluate_script` after the reload settles. After re-injection, use `buffered: false` on the observer — `buffered: true` would surface buffered shifts from the previous observer, which you've already accounted for.

2. **`hadRecentInput: true` does not mean "ignore".** That flag exists so the official CLS metric excludes shifts the user "asked for" by interacting in the last 500ms. But content shifting *because* the user typed a key — when the keystroke didn't logically demand layout motion — is still jank. The flag is for scoring, not for human judgment. Read the deltas; trust your eyes.

3. **Animations show up as many small entries, not one big one.** A `transition: padding 200ms ease-out` will emit 5–10 separate `layout-shift` entries (one per animated frame), each with a small `value` (e.g. 0.0005). The cumulative might still be small, but `count >= 5` with all sources pointing at the same node and consistent `dy` direction is a strong tell that something is animating its layout-affecting property. The fix is almost always "animate `transform` instead" or "snap to final state instantly".

4. **Scrollbar reflows look like horizontal shifts.** When a page that previously fit in the viewport grows tall enough to overflow, the vertical scrollbar appears and steals ~15px of width. Centered content gets yanked horizontally — so you'll see entries with `dy: 0, dx: -7` (centered chrome shifting half the scrollbar width). The fix is `scrollbar-gutter: stable` on the `html` element so the gutter is always reserved.

5. **You're observing a single document.** Iframes, web components with shadow DOM, and cross-origin embeds need their own observers. If the suspect content is in an iframe, attach the observer inside that iframe.


## Reporting findings

When you tell the user what you found, lead with the deltas, not the scalar:

> *"Typing in the search box emitted 7 layout-shift entries (cumulative 0.0031). All sources point at `H1.home__title`, `P.home__subtitle`, `DIV.home__searchbar`, `SECTION.home__results` — each shifting `dy: -3 to -4` px in sync. Pattern matches an animated `padding` transition on the parent, frame by frame. Suggest switching to `transform` or removing the transition."*

That's actionable. "CLS = 0.003" by itself isn't.
