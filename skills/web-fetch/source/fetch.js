// Handle environments with SSL certificate issues
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= "0";

import { convert } from "html-to-text";
import TurndownService from "turndown";

const URL_FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 100000;

async function fetchWithTimeout(url, timeout, headers = {}) {
  const controller = new AbortController();
  const signal = controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal, headers });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function convertHTMLToMarkdown(html) {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  turndownService.remove(["script", "style", "meta", "link"]);
  return turndownService.turndown(html);
}

async function webFetch(url, format = "text") {
  if (!url) {
    throw new Error('The "url" parameter is required.');
  }

  // Convert GitHub blob URL to raw URL
  if (url.includes("github.com") && url.includes("/blob/")) {
    url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
  }

  try {
    // First, try requesting markdown via content negotiation
    if (format === "markdown" || format === "text") {
      const markdownResponse = await fetchWithTimeout(url, URL_FETCH_TIMEOUT_MS, {
        Accept: "text/markdown, text/html;q=0.9",
      });

      const contentType = markdownResponse.headers.get("content-type") || "";

      // Server honored our markdown request - return it directly
      if (contentType.includes("text/markdown")) {
        const markdown = await markdownResponse.text();
        return markdown.substring(0, MAX_CONTENT_LENGTH);
      }

      // Server didn't support markdown negotiation, but we have the HTML response
      if (markdownResponse.ok) {
        const html = await markdownResponse.text();

        if (format === "markdown") {
          const markdown = convertHTMLToMarkdown(html);
          return markdown.substring(0, MAX_CONTENT_LENGTH);
        }

        const textContent = convert(html, {
          wordwrap: false,
          selectors: [
            { selector: "a", options: { ignoreHref: true } },
            { selector: "img", format: "skip" },
          ],
        }).substring(0, MAX_CONTENT_LENGTH);
        return textContent;
      }
    }

    // For HTML format, or if the above failed, do a simple fetch
    const response = await fetchWithTimeout(url, URL_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`Request failed with status code ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    if (format === "html") {
      return html;
    }

    if (format === "markdown") {
      const markdown = convertHTMLToMarkdown(html);
      return markdown.substring(0, MAX_CONTENT_LENGTH);
    }

    const textContent = convert(html, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
      ],
    }).substring(0, MAX_CONTENT_LENGTH);
    return textContent;
  } catch (e) {
    const error = e;
    throw new Error(`Error during fetch for ${url}: ${error.message}`);
  }
}

const url = process.argv[2];
const format = process.argv[3] || "text";

if (!url) {
  console.error("Usage: web-fetch <url> [text|markdown|html]");
  process.exit(1);
}

webFetch(url, format)
  .then((content) => console.log(content))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
