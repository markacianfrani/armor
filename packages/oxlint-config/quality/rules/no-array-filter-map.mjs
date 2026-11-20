/**
 * @file `no-array-filter-map` — disallow adjacent array `.filter()`/`.map()` passes.
 *
 * Fires when one eager pass (`filter` or `map`) is immediately chained onto the
 * other over a known array, in either order. Not a style complaint: two passes
 * mean two full iterations and an intermediate allocation for one logical
 * transformation, and the cost compounds on hot paths.
 *
 * Prefer a single transformation. `flatMap` does filter+map in one pass; where
 * iterator helpers are supported, `xs.values().filter(...).map(...).toArray()`
 * keeps both steps lazy so nothing is materialized twice. Preserve callback
 * ordering, indexes, and filtering semantics when converting — `map().filter()`
 * and `filter().map()` are not interchangeable if the callbacks use indexes.
 *
 * @example
 * // Before — two eager passes over the whole array:
 * const doubled = xs.filter((x) => x > 1).map((x) => x * 2);
 *
 * // After — one pass:
 * const doubled = xs.flatMap((x) => (x > 1 ? [x * 2] : []));
 * // or, lazily:
 * const lazy = xs.values().filter((x) => x > 1).map((x) => x * 2).toArray();
 */

import {
  arrayMethodTarget,
  isKnownArrayExpression,
  unwrapArrayExpression,
} from "../shared/array-method.mjs";

/** Reject eager array filter/map pipelines; lazy iterator helpers remain allowed. */
export const noArrayFilterMapRule = {
  createOnce(context) {
    return {
      CallExpression(node) {
        const outer = arrayMethodTarget(node.callee);
        if (outer === null || (outer.name !== "map" && outer.name !== "filter")) {
          return;
        }
        const innerCall = unwrapArrayExpression(outer.object);
        if (innerCall.type !== "CallExpression") {
          return;
        }
        const inner = arrayMethodTarget(innerCall.callee);
        if (inner === null || inner.name !== (outer.name === "map" ? "filter" : "map")) {
          return;
        }
        if (!isKnownArrayExpression(context.sourceCode, inner.object)) {
          return;
        }
        context.report({
          data: { first: inner.name, second: outer.name },
          messageId: "arrayFilterMap",
          node,
        });
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow adjacent array filter/map passes in favor of lazy iterator helpers or a single transformation.",
    },
    messages: {
      arrayFilterMap:
        "Avoid consecutive array `{{first}}` and `{{second}}` passes. Prefer `.values().{{first}}(...).{{second}}(...).toArray()` where iterator helpers are supported, or a single `flatMap`/mutating reducer. Preserve callback ordering, indexes, and filtering semantics.",
    },
    type: "suggestion",
  },
};
