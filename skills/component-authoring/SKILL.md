---
name: component-authoring
description: Guidelines for authoring reusable UI components. Use when asked to create new frontend features, components, or design-adjacent tasks.
metadata:
  author: Mark Anthony Cianfrani
  version: "0.1"
---

# Component Authoring

A good reusable component is a boundary. Its primary function is to reduce cognitive load, NOT necessarily to prevent repetition. Most importantly, not every component should be reusable. If a component is not reusable, these principles need not apply.

**model everything off of HTML.** If your component doesn't feel like something the platform could have shipped, it's probably wrong, with the exception of <input>. <input> is such a terrible, bloated HTML element. HTML is a fine, battle-tested standard for creating composable elements. 

You will spend more time and effort making a component reusable. 

## Rules and Suggestions

1. **Layout is the parent's job.** Components do not set their own `margin`, position, or placement. Parents use `gap`, spacing, flex — same way a `<button>` doesn't margin itself.

2. **Slots over props.** Children come in as slotted markup. Reach for props or attributes mostly as sugar for genuinely repeated config. This is almost always a trade-off between developer ergonomics and design flexibility. While it is easier to type "hasSearchIcon=true", it ultimately will become a burden when someone wants to add a new icon. Slots are the most flexible, most verbose. Props and attributes are the least flexible, least verbose. If your component has more than 6 props, you better have a good reason.

3. **Stateless by default.** A good component starts with no state. If state isn't shared with anything else, it can live inside. The moment a second consumer needs to read or mutate it, lift it out. Always consider how your component behaves in its default state.

4. **CustomEvents for outward comms.** `dispatchEvent(new CustomEvent(…, { bubbles: true }))`. No callback props.

## When to make a new component

- Extract when **both** are true: the piece has one nameable responsibility, and it owns state/events/lifecycle that don't belong to its parent. Mere reuse isn't enough — and two call sites isn't enough either. Three or four is a better threshold.

## When NOT to make a new component

- It's under ~20 lines and has no state → inline or helper.
- Only one parent will ever render it → a private method on the parent is more honest than a fake-reusable element.
- It takes no effort to reimplement.

## Smells

- A `:host { margin: … }` anywhere.
- Props named `withX`, `showY`, `hasZ` piling up on one element.
- A component that reaches into its parent, or a parent that reaches into a component's shadow DOM.
- State inside a component that something else also needs to read.
- You are unable to load your component in an isolated index.html by hand. Either the API is too complicated or the component is doing too much.
