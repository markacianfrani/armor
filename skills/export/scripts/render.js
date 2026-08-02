/**
 * Build a single self-contained HTML document for a session payload.
 *
 * The exported transcript is declarative HTML: the conversation is written as
 * <ai-conversation>/<ai-message>/<ai-markdown>/<ai-tool-call> elements instead
 * of a giant JSON blob plus renderer script. That keeps the artifact useful to
 * humans, browsers, and agents reading the HTML source.
 *
 * Conversation rendering is delegated to render-shared.ts — the same module
 * the live devlog UI ships in the browser — so an export and the dev server
 * render a session identically.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { esc, renderSessionHTML } from "./render-shared.js";

/**
 * Pinned CDN source for the @cianfrani/ai-ui web components. The package is
 * self-registering custom elements whose only dependency is lit; jsdelivr's
 * /+esm endpoint bundles it into one file and resolves lit transitively, so
 * no import map is needed. Bump this version to refresh exported transcripts.
 */
const AI_UI_CDN_URL =
  "https://cdn.jsdelivr.net/npm/@cianfrani/ai-ui@0.1.0-alpha.3/+esm";
function currentModuleDir() {
  const meta = import.meta;
  return meta.dirname ?? meta.dir ?? dirname(fileURLToPath(import.meta.url));
}
function bundledAssetDir() {
  const moduleDir = currentModuleDir();
  const skillAssets = resolve(moduleDir, "..", "assets");
  if (existsSync(skillAssets)) {
    return skillAssets;
  }
  return resolve(moduleDir, "..", "public");
}
const assetDir = bundledAssetDir();
function readAsset(name) {
  return readFileSync(join(assetDir, name), "utf-8");
}
function markdownWhitespacePatch() {
  return `
function patchMarkdownListWhitespace() {
  function apply() {
    document.querySelectorAll("ai-markdown").forEach((el) => {
      const root = el.shadowRoot;
      if (!root || root.querySelector("style[data-devlog-list-fix]")) return;
      const style = document.createElement("style");
      style.setAttribute("data-devlog-list-fix", "");
      style.textContent = ".markdown li{white-space:normal!important;}" +
        ".markdown li pre,.markdown li code{white-space:pre-wrap!important;}";
      root.appendChild(style);
    });
  }
  apply();
  requestAnimationFrame(apply);
}
if (window.customElements) {
  customElements.whenDefined("ai-markdown").then(patchMarkdownListWhitespace);
} else {
  window.addEventListener("load", patchMarkdownListWhitespace);
}
`;
}
function overviewControlsScript() {
  return `
(function () {
  function setAll(open) {
    document.querySelectorAll("ai-tool-call, ai-event").forEach(function (el) { el.open = open; });
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".subagent-overview button[data-act]");
    if (!btn) return;
    setAll(btn.getAttribute("data-act") === "expand");
  });
})();
`;
}
export function buildStandaloneHTML(payload) {
  const css = readAsset("session.css");
  const title = esc(payload.meta.title || "Session");
  // Standalone exports have no router: render links as inert labels and
  // show the raw timestamp (no clock to compute "3m ago" against later).
  const sessionHtml = renderSessionHTML(payload, { relativeTime: false, isStandalone: true });
  return `<!doctype html>
<html lang="en" class="standalone">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <main class="main">
      <div class="content" id="content">
${sessionHtml}
      </div>
    </main>

    <script type="module" src="${AI_UI_CDN_URL}"></script>
    <script>
${markdownWhitespacePatch()}
    </script>
    <script>
${overviewControlsScript()}
    </script>
  </body>
</html>
`;
}
