/**
 * @file `no-conditional-empty-object-spread` — disallow spreads that conditionally omit fields.
 *
 * Fires on object-spread arguments like `...(cond ? { a: 1 } : {})`. The empty
 * object on one branch exists only to "remove" the property — it is deletion
 * smuggled through a spread.
 *
 * It reads like a data transform but is conditional omission: the falsy branch
 * silently drops the key, and the optionality is invisible in both the code and
 * the object literal's inferred type. Build the object in explicit statements
 * and add the property only when it exists, so the type carries the optionality
 * (`prop?: T`) instead of the spread hiding it.
 *
 * @example
 * // Before — deletion hidden behind an empty object:
 * const user = { name, ...(hasAge ? { age } : {}) };
 *
 * // After — optionality is visible in the type:
 * const user: { name: string; age?: number } = { name };
 * if (hasAge) user.age = age;
 */

function unwrapParentheses(node) {
  let current = node;
  while (current.type === "ParenthesizedExpression") {
    current = current.expression;
  }
  return current;
}

function isEmptyObjectExpression(node) {
  return node.type === "ObjectExpression" && node.properties.length === 0;
}

function isConditionalEmptyObjectSpread(node) {
  const conditional = unwrapParentheses(node);
  return (
    conditional.type === "ConditionalExpression" &&
    (isEmptyObjectExpression(conditional.consequent) ||
      isEmptyObjectExpression(conditional.alternate))
  );
}

/** Ban conditional empty-object spreads without changing their omission semantics. */
export const noConditionalEmptyObjectSpreadRule = {
  createOnce(context) {
    return {
      SpreadElement(node) {
        if (node.parent.type !== "ObjectExpression") {
          return;
        }

        if (isConditionalEmptyObjectSpread(node.argument)) {
          context.report({ messageId: "avoid", node });
        }
      },
    };
  },
  meta: {
    docs: {
      description:
        "Disallow object spreads that conditionally spread an empty object to omit fields.",
    },
    messages: {
      avoid:
        "This conditional spread hides property omission behind an empty object. Build the object in separate statements and add the property only when present.",
    },
    type: "suggestion",
  },
};
