## Dependencies

Prefer the platform over packages. Reach for a third-party dependency only when it earns its place — every one is attack surface you inherit.

- Use built-ins before adding a library: native `fetch` instead of `axios`, the standard library instead of a thin wrapper.
- Favor dependencies that are widely used and backed by an organization or a healthy community — real track record, active maintenance, a sane transitive tree — over one-off packages from a single anonymous author.
- Third-party deps are fine when they earn their keep. Vet first: who maintains it, how active it is, how many transitive deps it drags in, and whether the value clears the supply-chain risk.
- When your change affects files, imports, exports, package scripts, dependencies, or workspace boundaries, run `npm run knip` (or the package-manager equivalent) before handoff. Treat new Knip findings as backpressure: fix issues caused by your change, and report unrelated or ambiguous findings instead of deleting blindly.
