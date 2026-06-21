#!/usr/bin/env node
/**
 * Computes a unique alpha prerelease version and writes it into package.json
 * (in-place; CI workspace only — never committed).
 *
 * Format: <base>-alpha.<runNumber>.<shortSha>
 *   base       = semver core from package.json (prerelease/build stripped),
 *                so this keeps working once package.json moves past 0.0.0.
 *   runNumber  = GitHub Actions github.run_number (monotonic per workflow).
 *   shortSha   = 7-char github.sha, so an alpha maps 1:1 to a commit.
 *
 * Putting both run + sha in the *prerelease* segment (not after `+`) keeps
 * every version unique to npm — build metadata after `+` is ignored for
 * version identity and the second publish would 403.
 *
 * Required env: RUN_NUMBER, GITHUB_SHA. Exits non-zero if either is missing.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const required = ["RUN_NUMBER", "GITHUB_SHA"];
for (const v of required) {
  if (!process.env[v]) {
    console.error(`[alpha-version] missing required env: ${v}`);
    process.exit(1);
  }
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const base = String(pkg.version).split("-")[0].split("+")[0];
const run = process.env.RUN_NUMBER;
const sha = process.env.GITHUB_SHA.slice(0, 7);
const alphaVersion = `${base}-alpha.${run}.${sha}`;

pkg.version = alphaVersion;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\`@cianfrani/armor\` alpha → \`${alphaVersion}\` (dist-tag \`alpha\`) \`latest\` is untouched.\n`,
  );
}

console.log(alphaVersion);
