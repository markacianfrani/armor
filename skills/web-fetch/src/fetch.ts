// Handle environments with SSL certificate issues
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";

import { convert } from "html-to-text";
import TurndownService from "turndown";

const URL_FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_LENGTH = 100_000;

type Format = "markdown" | "text" | "html";

async function fetchWithTimeout(
  url: string,
  timeout: number,
  headers: Record<string, string> = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timeoutId);
  }
}

function convertHTMLToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  turndown.remove(["script", "style", "meta", "link"]);
  return turndown.turndown(html);
}

function convertHTMLToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  });
}

function truncate(content: string): string {
  return content.substring(0, MAX_CONTENT_LENGTH);
}

async function webFetch(url: string, format: Format): Promise<string> {
  // Convert GitHub blob URL to raw URL
  if (url.includes("github.com") && url.includes("/blob/")) {
    url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
  }

  // Try content negotiation for markdown/text
  if (format === "markdown" || format === "text") {
    const response = await fetchWithTimeout(url, URL_FETCH_TIMEOUT_MS, {
      Accept: "text/markdown, text/html;q=0.9",
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/markdown")) {
      return truncate(await response.text());
    }

    if (response.ok) {
      const html = await response.text();
      return truncate(
        format === "markdown" ? convertHTMLToMarkdown(html) : convertHTMLToText(html),
      );
    }
  }

  // HTML format or fallback
  const response = await fetchWithTimeout(url, URL_FETCH_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  if (format === "html") return html;
  if (format === "markdown") return truncate(convertHTMLToMarkdown(html));
  return truncate(convertHTMLToText(html));
}

const url = process.argv[2];
const format = (process.argv[3] || "text") as Format;

if (!url) {
  console.error("Usage: web-fetch <url> [text|markdown|html]");
  process.exit(1);
}

webFetch(url, format)
  .then((content) => console.log(content))
  .catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
