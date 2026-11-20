/**
 * @file `no-unknown-type-aliases` — disallow aliases that launder `unknown`.
 *
 * Fires on type aliases whose resolved type is `unknown` — directly or as a
 * union member, through parentheses and nested aliases.
 *
 * `type Payload = unknown` reads like a contract but carries none: it is
 * `unknown` wearing a name, and the name is what future readers will trust.
 * `unknown` belongs where it is visible and honest — on boundary parameters
 * and on `Error`-style `cause` fields — not hidden behind an alias. If a name
 * is needed, name the parsed owner type instead.
 *
 * @example
 * // Before — `unknown` wearing a costume:
 * type Payload = unknown;
 * function recv(): Payload { ... }
 *
 * // After — the alias names a real shape:
 * type Payload = { id: string; at: number };
 * function recv(): Payload { ... }
 */

import { withTypeBindings, resolvedTypeMatches } from '../shared/type-alias-resolution.mjs';

const resolvesToUnknown = (type, environment) =>
  resolvedTypeMatches(type, environment, (resolved, matches) => {
    if (resolved.type === 'TSUnknownKeyword') {
      return true;
    }
    if (resolved.type === 'TSParenthesizedType') {
      return matches(resolved.typeAnnotation);
    }
    return resolved.type === 'TSUnionType' && resolved.types.some(matches);
  });

/** Ban named aliases that merely conceal TypeScript's unknown top type. */
export const noUnknownTypeAliasesRule = {
  createOnce(context) {
    const checkAlias = (node, environment) => {
      if (!resolvesToUnknown(node.typeAnnotation, environment)) {
        return;
      }
      context.report({
        data: { alias: node.id.name },
        messageId: 'unknownAlias',
        node: node.id,
      });
    };
    return withTypeBindings(context, (defer) => ({
      TSTypeAliasDeclaration(node) {
        defer(checkAlias, node);
      },
    }));
  },
  meta: {
    docs: {
      description:
        'Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.',
    },
    messages: {
      unknownAlias:
        'Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type.',
    },
    type: 'problem',
  },
};
