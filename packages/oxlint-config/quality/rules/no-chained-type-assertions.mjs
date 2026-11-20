/**
 * @file `no-chained-type-assertions` — disallow chained TypeScript assertions.
 *
 * Fires on assertion chains — `x as A as B`, angle-bracket forms, and their
 * parenthesized equivalents — containing more than one assertion where at
 * least one is not `as const`. Chains made solely of `as const` are allowed.
 *
 * A chain is "trust me" twice. The first assertion throws away the compiler's
 * evidence about the original value; the second re-trusts an intermediate type
 * nobody verified. If the intermediate type is wrong, the final assertion hides
 * it; if it is right, the second hop added nothing. Assert once, from the
 * original type — or better, narrow with a guard or parse untrusted input at
 * its boundary so no assertion is needed at all.
 *
 * @example
 * // Before — trust me twice, zero checking:
 * const date = JSON.parse(input) as unknown as Date;
 *
 * // After — one assertion from the original type, then a guard:
 * const value = JSON.parse(input) as { iso?: unknown };
 * if (typeof value.iso !== 'string') throw new Error('bad payload');
 * const date = new Date(value.iso);
 */

function isTypeAssertionExpression(node) {
  return node.type === "TSAsExpression" || node.type === "TSTypeAssertion";
}

function unwrapParenthesizedExpression(expression) {
  let current = expression;
  while (current.type === "ParenthesizedExpression") {
    current = current.expression;
  }
  return current;
}

function isConstAssertion(node) {
  const { typeAnnotation } = node;
  return (
    typeAnnotation.type === "TSTypeReference" &&
    typeAnnotation.typeName.type === "Identifier" &&
    typeAnnotation.typeName.name === "const"
  );
}

function isOutermostAssertionInChain(node) {
  let current = node;
  let parent = node.parent;

  while (parent.type === "ParenthesizedExpression" && parent.expression === current) {
    current = parent;
    parent = parent.parent;
  }

  return !isTypeAssertionExpression(parent) || parent.expression !== current;
}

function isForbiddenAssertionChain(node) {
  let assertionCount = 0;
  let hasNonConstAssertion = false;
  let current = node;

  while (isTypeAssertionExpression(current)) {
    assertionCount += 1;
    hasNonConstAssertion ||= !isConstAssertion(current);
    current = unwrapParenthesizedExpression(current.expression);
  }

  return assertionCount > 1 && hasNonConstAssertion;
}

/** Disallow nested TypeScript type assertions, while permitting chains made only of const assertions. */
export const noChainedTypeAssertionsRule = {
  createOnce(context) {
    const checkTypeAssertion = (node) => {
      if (!isOutermostAssertionInChain(node) || !isForbiddenAssertionChain(node)) {
        return;
      }
      context.report({ messageId: "chained", node });
    };

    return {
      TSAsExpression: checkTypeAssertion,
      TSTypeAssertion: checkTypeAssertion,
    };
  },
  meta: {
    docs: {
      description:
        "Disallow chained TypeScript as and angle-bracket assertions, including parenthesized chains.",
    },
    messages: {
      chained:
        "This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it.",
    },
    type: "problem",
  },
};
