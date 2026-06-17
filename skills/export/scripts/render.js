/**
 * Build a single self-contained HTML document for a session payload.
 *
 * Inlines session.css + ai-components.js + viewer.js + the session data
 * so the result is one file you can open anywhere, email, drag into a
 * chat, or host statically. No server, no DB, no network.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
function readPublic(name) {
    return readFileSync(join(assetDir, name), "utf-8");
}
/** Make a JSON string safe to embed inside a <script> tag. */
function safeJson(obj) {
    return JSON.stringify(obj)
        .replace(/</g, "\\u003c")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}
export function buildStandaloneHTML(payload) {
    const css = readPublic("session.css");
    const componentsJs = readPublic("ai-components.js");
    const viewerJs = readPublic("viewer.js");
    const data = safeJson(payload);
    const title = (payload.meta.title || "Session").replace(/</g, "&lt;");
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
      <div class="content" id="content"></div>
    </main>

    <script type="module">
${componentsJs}
    </script>
    <script>
${viewerJs}
    </script>
    <script>
      window.__SESSION__ = ${data};
      function __go() {
        renderSession(window.__SESSION__, document.getElementById("content"));
      }
      if (window.customElements && customElements.get("ai-conversation")) {
        __go();
      } else if (window.customElements) {
        customElements.whenDefined("ai-conversation").then(__go);
      } else {
        window.addEventListener("load", __go);
      }
    </script>
  </body>
</html>
`;
}
