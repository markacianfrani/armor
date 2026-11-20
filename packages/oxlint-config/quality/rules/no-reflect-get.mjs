/**
 * @file `no-reflect-get` — disallow `Reflect.get`.
 *
 * Fires on calls to the global `Reflect.get`; a locally shadowed `Reflect`
 * binding is respected and not reported.
 *
 * `Reflect.get` reads a property by runtime name and types the result as
 * `any` — no evidence, no narrowing, and a typo in the key becomes a runtime
 * `undefined` instead of a compile error. Use typed property access when the
 * key is static. When the key genuinely comes from outside — user input, wire
 * formats — parse the payload into a named domain type at the boundary and
 * read from that, once, in one place.
 *
 * @example
 * // Before — a dynamic read with no contract:
 * const token = Reflect.get(headers, headerName);
 *
 * // After — the index signature owns the dynamism:
 * const token: string | undefined = headers[headerName];
 */

import { isGlobalReflectMethodCall } from "../shared/reflect-method.mjs";

/** Ban Reflect.get, which bypasses ordinary property access and useful type evidence. */
export const noReflectGetRule = {
  createOnce(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Super" || node.callee.type === "V8IntrinsicExpression") {
          return;
        }
        if (isGlobalReflectMethodCall(context.sourceCode, node.callee, "get")) {
          context.report({ messageId: "reflectGet", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow Reflect.get; use typed property access or parse dynamic input into a domain type.",
    },
    messages: {
      reflectGet:
        "Replace `Reflect.get` with typed property access. Parse dynamic input into a named domain type before reading it.",
    },
    type: "problem",
  },
};
