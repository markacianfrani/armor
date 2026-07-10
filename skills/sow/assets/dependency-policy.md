## Dependencies

Match each dependency to the value it delivers and the risk it carries. A dependency you don't need is attack surface you inherit. Code you hand-roll in its place is surface you now own and maintain. Weigh both, then decide.

- Skip thin wrappers: native `fetch` over `axios`, the standard library over a one-line convenience package.
- Reach for a real dependency when it carries real weight. An official or well-maintained SDK that handles auth, signing, retries, and pagination for a service is almost always safer than reimplementing that by hand. Good, first-class TypeScript types are part of that weight — they catch mistakes you'd otherwise hit at runtime.
- Favor dependencies that are widely used and backed by an organization or a healthy community — real track record, active maintenance, a sane transitive tree — over one-off packages from a single anonymous author.
- Vet before adding: who maintains it, how active it is, how many transitive deps it drags in, whether the value clears the supply-chain risk. When it does, add it without agonizing.
- When your change affects files, imports, exports, package scripts, dependencies, or workspace boundaries, run `npm run knip` (or the package-manager equivalent) before handoff. Treat new Knip findings as backpressure: fix issues caused by your change, and report unrelated or ambiguous findings instead of deleting blindly.
