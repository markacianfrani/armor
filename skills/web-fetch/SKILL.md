---
name: web-fetch
description: >
  Fetch content directly from URLs and return it as markdown, text, or raw HTML.
  Use when the user wants to read a webpage, inspect a URL, pull docs from a
  site, extract page content from a link, or fetch web content without opening a
  browser. Prefer this over browser automation when a normal HTTP fetch is
  enough. Supports GitHub blob URLs and sites that return LLM-optimized
  markdown for Accept: text/markdown.
---

# Web Fetch

Use this skill when the user gives you a URL and wants the page contents or information derived from that page.

Prefer this skill over browser automation when:

- the page is publicly fetchable
- the user wants content, not interaction
- JavaScript rendering is not obviously required

Use browser tooling instead when the page requires login, heavy client-side rendering, form interaction, clicks, or debugging in a real browser.

## How to fetch

Run the wrapper script relative to this skill directory (requires bun or node):

```bash
./web-fetch <url> [format]
```

Formats:

- `markdown` — preferred default for most reading/summarization tasks
- `text` — use when the user wants plain extracted text
- `html` — use only when the user explicitly wants raw markup or you need to inspect the source

Examples:

```bash
./web-fetch https://example.com markdown
./web-fetch https://example.com text
./web-fetch https://example.com html
```

## Behavior

The fetcher already does the following:

- requests `Accept: text/markdown, text/html;q=0.9` first, so sites that support agent-friendly markdown can return it directly
- falls back to converting HTML when the server does not return markdown
- converts GitHub `.../blob/...` URLs to raw content URLs automatically
- enforces a timeout and truncates very large responses

## How to respond

- If the user asked to fetch or read a page, return the fetched content in the most useful format for the task.
- If the user asked a question about the page, fetch it first, then answer using the fetched content.
- Mention fetch failures clearly instead of silently falling back to guesses.
- If a page appears to require browser interaction or client-side rendering, say so and switch to browser tooling rather than pretending the fetch result is complete.
