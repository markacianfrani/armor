// Adapted from https://github.com/dmmulroy/anti-slop/tree/13909c9e07590f5a85d93c62712259fe14a883f7.
import { noArrayFilterMapRule } from "./rules/no-array-filter-map.mjs";
import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.mjs";
import { noConditionalEmptyObjectSpreadRule } from "./rules/no-conditional-empty-object-spread.mjs";
import { noKnownValueWideningRule } from "./rules/no-known-value-widening.mjs";
import { noObjectParametersRule } from "./rules/no-object-parameters.mjs";
import { noReduceAccumulatorCopyRule } from "./rules/no-reduce-accumulator-copy.mjs";
import { noReflectApplyRule } from "./rules/no-reflect-apply.mjs";
import { noReflectGetRule } from "./rules/no-reflect-get.mjs";
import { noUnknownReturnsRule } from "./rules/no-unknown-returns.mjs";
import { noUnknownTypeAliasesRule } from "./rules/no-unknown-type-aliases.mjs";
import { noUnsafeDictionaryTypeRule } from "./rules/no-unsafe-dictionary-type.mjs";
import { noWidenThenAssertRule } from "./rules/no-widen-then-assert.mjs";

export default {
  meta: { name: "quality" },
  rules: {
    "no-array-filter-map": noArrayFilterMapRule,
    "no-chained-type-assertions": noChainedTypeAssertionsRule,
    "no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
    "no-known-value-widening": noKnownValueWideningRule,
    "no-object-parameters": noObjectParametersRule,
    "no-reduce-accumulator-copy": noReduceAccumulatorCopyRule,
    "no-reflect-apply": noReflectApplyRule,
    "no-reflect-get": noReflectGetRule,
    "no-unknown-returns": noUnknownReturnsRule,
    "no-unknown-type-aliases": noUnknownTypeAliasesRule,
    "no-unsafe-dictionary-type": noUnsafeDictionaryTypeRule,
    "no-widen-then-assert": noWidenThenAssertRule,
  },
};
