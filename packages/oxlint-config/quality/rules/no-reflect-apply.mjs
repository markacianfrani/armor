/**
 * @file `no-reflect-apply` — disallow `Reflect.apply`.
 *
 * Fires on calls to the global `Reflect.apply`; a locally shadowed `Reflect`
 * binding is respected and not reported.
 *
 * `Reflect.apply` invokes a function through runtime lookup. The type checker
 * sees a call to `Reflect`, not to the target — parameter and return types go
 * unverified, and a bad handler name surfaces at runtime instead of compile
 * time. Call typed functions directly. When dispatch genuinely has to be
 * dynamic, model it behind a named interface — a `Map` from key to typed
 * handler — so the dispatch table itself is a contract the checker verifies.
 *
 * @example
 * // Before — untyped dynamic dispatch:
 * Reflect.apply(handlers[event.type], undefined, [event]);
 *
 * // After — the table is the contract:
 * const handlers: Record<EventType, (event: Event) => void> = { ... };
 * handlers[event.type](event);
 */

import { isGlobalReflectMethodCall } from "../shared/reflect-method.mjs";

/** Ban Reflect.apply, which bypasses ordinary typed function calls. */
export const noReflectApplyRule = {
  createOnce(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Super" || node.callee.type === "V8IntrinsicExpression") {
          return;
        }
        if (isGlobalReflectMethodCall(context.sourceCode, node.callee, "apply")) {
          context.report({ messageId: "reflectApply", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow Reflect.apply; call typed functions directly or model dynamic dispatch behind an interface.",
    },
    messages: {
      reflectApply:
        "Replace `Reflect.apply` with a typed function call. Model dynamic dispatch behind a named interface.",
    },
    type: "problem",
  },
};
