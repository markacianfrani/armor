/**
 * @file `no-unknown-returns` — disallow `unknown` function return contracts.
 *
 * Fires on explicit return types that resolve to `unknown` — directly, through
 * unions, parentheses, and type aliases, or as `Promise<unknown>` /
 * `PromiseLike<unknown>` — across all function-shaped nodes.
 *
 * `unknown` on a *parameter* says "I will verify this"; that is its job at the
 * parsing boundary. On a *return type* it inverts the contract: every caller
 * inherits the verification work, so the same payload gets parsed and asserted
 * over and over — and each site can assert it differently. Parse the value once
 * where it enters, and return a named domain type so callers get a checked
 * contract instead of homework.
 *
 * @example
 * // Before — every caller must re-verify:
 * function readConfig(): unknown { ... }
 *
 * // After — verified once, at the boundary:
 * function readConfig(): Config { ... }
 */

import { withTypeBindings, resolvedTypeMatches } from "../shared/type-alias-resolution.mjs";

const resolvesToUnknown = (type, environment) =>
  resolvedTypeMatches(type, environment, (resolved, matches) => {
    if (resolved.type === "TSUnknownKeyword") {
      return true;
    }
    if (resolved.type === "TSParenthesizedType") {
      return matches(resolved.typeAnnotation);
    }
    if (resolved.type === "TSUnionType") {
      return resolved.types.some(matches);
    }
    if (
      resolved.type !== "TSTypeReference" ||
      resolved.typeName.type !== "Identifier" ||
      (resolved.typeName.name !== "Promise" && resolved.typeName.name !== "PromiseLike")
    ) {
      return false;
    }
    const value = resolved.typeArguments?.params[0];
    return value !== undefined && matches(value);
  });

/** Ban function contracts that return unknown instead of a parsed domain type. */
export const noUnknownReturnsRule = {
  createOnce(context) {
    const check = (type, environment) => {
      if (resolvesToUnknown(type, environment)) {
        context.report({ messageId: "unknownReturn", node: type });
      }
    };
    return withTypeBindings(context, (defer) => {
      const checkReturnType = (node) => {
        if (node.returnType) {
          defer(check, node.returnType.typeAnnotation);
        }
      };
      return {
        ArrowFunctionExpression: checkReturnType,
        FunctionDeclaration: checkReturnType,
        FunctionExpression: checkReturnType,
        TSCallSignatureDeclaration: checkReturnType,
        TSConstructorType: checkReturnType,
        TSConstructSignatureDeclaration: checkReturnType,
        TSDeclareFunction: checkReturnType,
        TSEmptyBodyFunctionExpression: checkReturnType,
        TSFunctionType: checkReturnType,
        TSMethodSignature: checkReturnType,
      };
    });
  },
  meta: {
    docs: {
      description:
        "Disallow functions whose explicit return contract is unknown or Promise<unknown>.",
    },
    messages: {
      unknownReturn:
        "This function exposes `unknown` to its caller. Parse the value at its boundary and return a named domain type.",
    },
    type: "problem",
  },
};
