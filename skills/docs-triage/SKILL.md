---
name: docs-triage
description: >
  Triage a documentation set — Confluence space, local folder, or any collection of docs —
  to find overlapping content, consolidation opportunities, staleness, and backlink candidates.
  Use this skill whenever the user asks to audit, triage, review, or health-check their documentation,
  knowledge base, wiki, or any collection of written content. Also trigger when the user mentions
  "doc overlap", "duplicate docs", "consolidate documentation", "backlinks", "documentation health",
  "stale docs", "knowledge base audit", "wiki cleanup", or wants to understand how their docs relate
  to each other. Works with Confluence, Google Docs, markdown files, Notion exports, or any text-based
  documentation source.
---

# Documentation Triage

You are performing a documentation triage — a systematic review of a collection of documents to
surface overlaps, staleness, consolidation opportunities, and backlinking potential. The goal is
to help the user understand the health of their documentation and give them a clear action plan.

## Step 1: Identify the document set

First, figure out what you're working with. The user might point you at:

- A Confluence space (use Confluence MCP tools to list and read pages)
- A folder of markdown or text files (use filesystem tools)
- A Google Drive folder (use Google Drive tools)
- Specific documents they name or upload

If the source isn't clear, ask. Once you know the source, enumerate all the documents. For large
sets (20+ docs), tell the user how many you found and confirm before proceeding — scanning
everything takes time and tokens.

## Step 2: Analyze each document with subagents

Spawn subagents to review the documents in parallel. Each subagent should review a batch of
documents (aim for 3-5 docs per agent, adjust based on document length). Give each subagent
these instructions:

```
You are analyzing documentation as part of a triage process. For each document, produce a
structured summary in this exact format:

## [Document Title]
- **Source**: [path, URL, or page ID]
- **Primary Topic**: [1-2 sentence description of what this doc is about]
- **Key Concepts**: [comma-separated list of the main ideas, tools, processes, or terms covered]
- **Freshness Signals**: [any dates mentioned, tool versions referenced, deprecated patterns,
  or other indicators of how current the content is. Note anything that looks outdated.]
- **Scope & Depth**: [is this a broad overview or a deep-dive? How many subtopics does it cover?]
- **Atomic Ideas**: [list any genuinely independent procedures or concepts bundled into this
  doc that could stand alone as their own page AND that other docs might want to link to
  individually. Don't list sections of a single narrative — only flag pieces that serve
  different audiences or use cases and have enough substance to justify a standalone page.]
- **Natural Link Targets**: [what other topics does this doc reference, depend on, or assume
  the reader already knows? These are candidates for backlinks.]

Be thorough but concise. The summaries will be compared across all docs to find patterns.
```

Save each subagent's output. Wait for all of them to finish before moving on.

## Step 3: Synthesize findings

Once all document summaries are collected, analyze them together. You're looking for four things:

### Overlaps & Consolidation Candidates

Compare the **Primary Topic** and **Key Concepts** across all documents. Flag any pair (or group)
of docs where:

- They cover substantially the same topic (even if from slightly different angles)
- One is a superset of another — a large doc that contains everything a smaller doc says, plus more
- They describe the same process but for different contexts (e.g., macOS vs. Windows setup) and
  could benefit from being organized together or cross-linked

For each overlap found, make a specific recommendation: should these docs be merged? Should one
be retired in favor of the other? Should they be restructured into a parent + child pages? Explain
your reasoning — don't just flag the overlap, explain what to do about it.

### Staleness

Review the **Freshness Signals** from all summaries. Flag documents that show signs of being outdated:

- References to deprecated tools, old versions, or sunset products
- Dates more than a year old with no indication of a recent review
- Processes that reference teams, tools, or systems that may no longer exist
- Instructions that contradict what newer documents say

Rank staleness concerns by severity: "probably outdated and actively misleading" is more urgent
than "could use a refresh but still mostly accurate."

### Backlink Opportunities

This is about documentation health. A well-linked documentation system lets readers navigate
naturally between related topics. Look for:

- **Missing cross-references**: Doc A mentions a concept that Doc B explains in detail, but
  there's no link between them. These are easy wins.
- **Implicit dependencies**: Doc A assumes knowledge that Doc B provides. A "Prerequisites" or
  "See also" link would help readers.
- **Hub pages needed**: If multiple docs all reference the same concept but none of them define
  it thoroughly, that concept deserves its own dedicated page that the others can link to.

### Atomicity & Type Violations

Review the **Atomic Ideas** from the summaries. Also apply the Diátaxis framework (see the
`diataxis` skill) to check whether any document is trying to serve multiple purposes — e.g.,
a tutorial that keeps veering into exhaustive reference, or a how-to guide overloaded with
explanation. Docs straddling Diátaxis categories are strong split candidates.

For atomicity specifically, be careful — not every long doc needs splitting. The litmus test is:
**would another document realistically need to link to just this one piece independently?**

A doc that tells a single narrative across multiple sections (like an RFC with background,
analysis, and recommendation) should stay as one page — those sections don't make sense in
isolation. Splitting them would just fragment a coherent story.

On the other hand, a doc that bundles genuinely independent procedures or concepts — like
"Developer Onboarding" covering macOS setup, Windows setup, IDE config, and database setup —
is a strong split candidate because other docs (like a troubleshooting guide) might need to
link to "macOS setup" without dragging in everything else.

Flag docs where:

- The doc bundles **independent workflows or procedures** that serve different audiences or
  use cases (not just different sections of one argument)
- Other docs would benefit from linking to a specific piece, but currently have to link to
  the whole monolith
- The subtopics each have enough substance to stand alone (a paragraph doesn't warrant its
  own page)

Don't recommend splitting docs that are simply long but cohesive. A thorough analysis, a
detailed proposal, or an experiment write-up with context → method → results is fine as a
single page. Length alone is not a reason to split.

## Step 4: Present the results

Present your findings directly in the conversation. Organize them by priority — lead with
the highest-impact recommendations. Use this structure:

1. **Quick Stats**: How many docs reviewed, how many issues found by category
2. **High Priority** — overlaps that cause confusion, severely stale docs, critical missing links
3. **Medium Priority** — consolidation opportunities, moderately stale content, atomicity improvements
4. **Low Priority / Nice to Have** — minor backlink additions, cosmetic improvements

For each finding, include:

- Which specific documents are involved (by name)
- What the issue is
- What you recommend doing about it
- Why it matters (brief)

Keep it actionable. The user should be able to take this output and start making changes immediately.
Don't pad the findings with caveats or preamble — get straight to the substance.

## Handling Scale

For small doc sets (under 10 docs), you may not even need subagents — just read them all yourself
and do the analysis inline. Use your judgment.

For medium sets (10-30 docs), use the subagent approach described above.

For large sets (30+ docs), consider a two-pass approach: first scan titles and any available
metadata to cluster docs by topic area, then do detailed analysis within each cluster. This
avoids comparing every doc against every other doc.

## Provider-Specific Notes

**Confluence**: Use `searchConfluenceUsingCql` or `getPagesInConfluenceSpace` to enumerate pages.
Use `getConfluencePage` with `contentFormat: "markdown"` to read content. Page hierarchy (parent/child)
is useful context — note it in summaries.

**Local files**: Use Glob to find all `.md`, `.txt`, `.rst`, or `.html` files in the specified
directory. Use Read to get contents. File path structure often implies topic organization.

**Google Drive**: Use the Google Drive search tool to find documents. Fetch contents with
the document fetch tool.

**Mixed sources**: Sometimes users have docs spread across multiple systems. Handle each source
with its appropriate tools and merge the summaries before synthesis.
