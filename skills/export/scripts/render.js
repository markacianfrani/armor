/**
 * Build a single self-contained HTML document for a session payload.
 *
 * The exported transcript is declarative HTML: the conversation is written as
 * <ai-conversation>/<ai-message>/<ai-markdown>/<ai-tool-call> elements instead
 * of a giant JSON blob plus renderer script. That keeps the artifact useful to
 * humans, browsers, and agents reading the HTML source.
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
function readAsset(name) {
    return readFileSync(join(assetDir, name), "utf-8");
}
function esc(s) {
    if (s === null || s === undefined) {
        return "";
    }
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function escAttr(s) {
    // Preserve newlines so ai-markdown/ai-thinking can render markdown naturally.
    return esc(s);
}
function sourceBadge(source) {
    if (!source) {
        return "";
    }
    const s = source.toLowerCase();
    const cls = s.includes("claude") ? "claude" : s.includes("pi") ? "pi" : "";
    if (!cls) {
        return `<span class="badge">${esc(source)}</span>`;
    }
    return `<span class="badge ${cls}"><span class="dot"></span>${esc(source)}</span>`;
}
function unwrapCustomMessages(text) {
    return String(text ?? "")
        .replace(/<pi:custom-message\b[^>]*>([\s\S]*?)<\/pi:custom-message>/g, (_match, inner) => {
        return `\n\n${String(inner || "").trim()}\n\n`;
    })
        .trim();
}
function looksLikeError(output, toolName) {
    const text = output.trim();
    if (!text) {
        return false;
    }
    const name = toolName.toLowerCase();
    if (name.includes("read")) {
        return /^(error|failed|exception|enoent|file not found|no such file|cannot read)\b/i.test(text);
    }
    const firstLines = text.split("\n").slice(0, 8).join("\n").toLowerCase();
    return (/(^|\n)\s*(error|failed|exception)\b/.test(firstLines) ||
        firstLines.includes("enoent") ||
        (firstLines.includes("not found") && firstLines.includes("error")));
}
/** Truncate to fit, keeping the head and appending an ellipsis. */
function clipHead(value, max) {
    return value.length > max ? `${value.slice(0, max - 3)}…` : value;
}
/** Truncate to fit, keeping the tail and prefixing an ellipsis. */
function clipTail(value, max) {
    return value.length > max ? `…${value.slice(-(max - 5))}` : value;
}
/** Pull a headline out of a parsed tool_use input (Agent label or file path). */
function summarizeParsedToolUse(name, parsed) {
    const agentLabel = parsed["name"] ?? parsed["description"] ?? parsed["prompt"];
    if (name === "Agent" && typeof agentLabel === "string" && agentLabel) {
        return clipHead(agentLabel, 80);
    }
    const path = parsed["path"] ?? parsed["file_path"] ?? parsed["filePath"];
    if (typeof path === "string" && path) {
        return clipTail(path, 60);
    }
    return null;
}
/** Fall back to regex/line summaries when the input isn't usable JSON. */
function summarizeRawToolUse(input) {
    const filePathMatch = input.match(/["']([/~][^"']+)["']/);
    if (filePathMatch?.[1]) {
        return clipTail(filePathMatch[1], 60);
    }
    const cmdMatch = input.match(/"command"\s*:\s*"([^"]+)"/);
    if (cmdMatch?.[1]) {
        return clipHead(cmdMatch[1], 80);
    }
    const firstLine = input
        .split("\n")
        .find((l) => l.trim() && !l.trim().startsWith("{") && !l.trim().startsWith('"')) ?? "";
    return firstLine ? clipHead(firstLine, 80) : null;
}
// Summaries cover several tool-specific affordances (Agent, files, shell).
function summarizeToolUse(name, input) {
    if (!input) {
        return name;
    }
    try {
        const parsed = JSON.parse(input);
        const fromParsed = summarizeParsedToolUse(name, parsed);
        if (fromParsed) {
            return fromParsed;
        }
    }
    catch {
        // Fall through to regex/line based summaries.
    }
    return summarizeRawToolUse(input) ?? name;
}
function formatToolInput(toolName, rawInput) {
    if (!rawInput) {
        return "";
    }
    try {
        const parsed = JSON.parse(rawInput);
        if (toolName === "Agent") {
            const description = parsed["description"];
            const prompt = parsed["prompt"];
            const name = parsed["name"];
            const lines = [];
            if (typeof name === "string") {
                lines.push(`name: ${name}`);
            }
            if (typeof description === "string") {
                lines.push(`description: ${description}`);
            }
            if (typeof prompt === "string") {
                lines.push(`prompt: ${prompt}`);
            }
            if (lines.length > 0) {
                return lines.join("\n");
            }
        }
        if (typeof parsed["command"] === "string") {
            return parsed["command"];
        }
        const filePath = parsed["file_path"] ?? parsed["filePath"];
        if (typeof filePath === "string") {
            return filePath;
        }
        if (typeof parsed["path"] === "string") {
            if (Array.isArray(parsed["edits"])) {
                const edits = parsed["edits"];
                const summary = edits
                    .map((e) => {
                    const oldText = String(e["oldText"] ?? "");
                    const old = oldText.slice(0, 40).replace(/\n/g, " ");
                    return old.length < oldText.length ? `${old}…` : old;
                })
                    .join(", ");
                return `${parsed["path"]}\n\n${edits.length} edit${edits.length === 1 ? "" : "s"}: ${summary}`;
            }
            if (typeof parsed["content"] === "string") {
                const lines = parsed["content"].split("\n").length;
                return `${parsed["path"]} (${lines} lines)`;
            }
            return parsed["path"];
        }
        return JSON.stringify(parsed, null, 2);
    }
    catch {
        return rawInput;
    }
}
function buildConversation(rawMessages) {
    const resultByUseId = new Map();
    for (const msg of rawMessages) {
        for (const block of msg.blocks) {
            if (block.type === "tool_result" && block.tool_use_id) {
                resultByUseId.set(block.tool_use_id, block);
            }
        }
    }
    const skipMsgIds = new Set();
    for (const msg of rawMessages) {
        if (msg.role !== "user") {
            continue;
        }
        if (msg.blocks.every((b) => b.type === "tool_result")) {
            skipMsgIds.add(msg.id);
        }
    }
    const turns = [];
    for (const msg of rawMessages) {
        if (skipMsgIds.has(msg.id)) {
            continue;
        }
        const role = msg.role === "assistant" ? "assistant" : "user";
        const label = role === "assistant" ? "Assistant" : "User";
        const blocks = msg.blocks.map((block) => {
            if (block.type !== "tool_use") {
                return block;
            }
            return {
                ...block,
                pairedResult: block.tool_use_id ? (resultByUseId.get(block.tool_use_id) ?? null) : null,
            };
        });
        if (role === "user" && blocks.length === 0) {
            continue;
        }
        const prev = turns[turns.length - 1];
        if (prev && prev.role === role) {
            prev.blocks.push(...blocks);
        }
        else {
            turns.push({ role, label, blocks });
        }
    }
    return turns;
}
function renderConversation(messages, density = "comfortable") {
    let html = `<ai-conversation density="${density}">`;
    for (const msg of buildConversation(messages)) {
        html += `<ai-message role="${msg.role}" label="${msg.label}">`;
        for (const block of msg.blocks) {
            html += renderBlock(block);
        }
        html += "</ai-message>";
    }
    return `${html}</ai-conversation>`;
}
function renderSubagent(subagent) {
    const title = subagent.name || subagent.description || `agent-${subagent.agent_id.slice(0, 8)}`;
    const meta = [subagent.agent_id, subagent.payload.meta.model].filter(Boolean).join(" · ");
    return ('<ai-event class="subagent-transcript" kind="custom" severity="info" source="subagent">' +
        `<span slot="summary">Subagent: ${esc(title)}</span>` +
        (meta ? `<span slot="meta">${esc(meta)}</span>` : "") +
        renderConversation(subagent.payload.messages, "compact") +
        "</ai-event>");
}
function renderToolUseBlock(block) {
    const toolName = block.tool_name || "unknown";
    const result = block.pairedResult;
    const resultOutput = result?.tool_output || "";
    const resultIsError = result ? looksLikeError(resultOutput, toolName) : false;
    const status = resultIsError ? "error" : "success";
    const open = resultIsError ? " open" : "";
    let html = `<ai-tool-call name="${escAttr(toolName)}" label="${escAttr(toolName)}" ` +
        `headline="${escAttr(summarizeToolUse(toolName, block.tool_input))}" status="${status}"${open}>`;
    if (block.tool_input?.trim()) {
        const isBash = ["bash", "shell"].includes(toolName.toLowerCase());
        if (!isBash) {
            html += `<pre slot="input" class="tool-input-pre"><code>${esc(formatToolInput(toolName, block.tool_input))}</code></pre>`;
        }
    }
    if (resultOutput) {
        html += `<ai-tool-result content="${escAttr(resultOutput)}" status="${status}"></ai-tool-result>`;
    }
    if (block.subagent) {
        html += renderSubagent(block.subagent);
    }
    return `${html}</ai-tool-call>`;
}
// Rendering covers the small union of block types from devlog content_blocks,
// plus export-only compaction/subagent affordances.
function renderBlock(block) {
    switch (block.type) {
        case "text": {
            const text = unwrapCustomMessages(block.text);
            return `<ai-markdown tone="assistant" content="${escAttr(text)}"></ai-markdown>`;
        }
        case "thinking":
            return `<ai-thinking source="model" content="${escAttr(block.text ?? "")}"></ai-thinking>`;
        case "redacted_thinking":
            return "<ai-thinking redacted></ai-thinking>";
        case "tool_use":
            return renderToolUseBlock(block);
        case "tool_result": {
            const output = block.tool_output || "";
            const status = looksLikeError(output, block.tool_name || "") ? "error" : "success";
            return `<ai-tool-result content="${escAttr(output)}" status="${status}"></ai-tool-result>`;
        }
        case "compaction": {
            const meta = block.tool_input ? `<span slot="meta">${esc(block.tool_input)}</span>` : "";
            return ('<ai-event class="compaction-event" kind="checkpoint" severity="info" source="claude">' +
                '<span slot="summary">Conversation compacted</span>' +
                meta +
                `<ai-markdown content="${escAttr(block.text || "")}"></ai-markdown></ai-event>`);
        }
        default:
            return block.text ? `<ai-markdown content="${escAttr(block.text)}"></ai-markdown>` : "";
    }
}
function renderSessionBody(payload) {
    const meta = payload.meta;
    const sessionId = meta.session_id || "";
    let html = '<div class="session-viewer">';
    html += '<div class="session-meta-bar">';
    html += `<span class="session-title">${esc(meta.title || sessionId.slice(0, 16))}</span>`;
    if (meta.is_subagent) {
        html += '<span class="badge subagent">subagent</span>';
    }
    if (meta.parent_id) {
        html += `<span class="meta-item subagent-back">↳ ${esc(meta.parent_title || "parent session")}</span>`;
    }
    html += sourceBadge(meta.source);
    if (meta.model) {
        html += `<span class="meta-item">${esc(meta.model)}</span>`;
    }
    if (meta.created_at) {
        html += `<span class="meta-item">${esc(meta.created_at)}</span>`;
    }
    if (meta.cwd) {
        html += `<span class="meta-item session-cwd">${esc(meta.cwd)}</span>`;
    }
    html += "</div>";
    if (meta.goal) {
        html += `<div class="session-goal"><span class="goal-label">Objective</span>${esc(meta.goal)}</div>`;
    }
    if (meta.children?.length) {
        const n = meta.children.length;
        html += '<div class="session-children">';
        html += `<span class="children-label">${n} subagent${n > 1 ? "s" : ""}</span>`;
        for (const child of meta.children) {
            const title = child.title || child.session_id.slice(0, 12);
            const agentTag = child.agent_id
                ? ` <code class="child-agent">${esc(child.agent_id.slice(0, 8))}</code>`
                : "";
            html += `<div class="child-item">${esc(title)}${agentTag}</div>`;
        }
        html += "</div>";
    }
    html += renderConversation(payload.messages);
    html += "</div>";
    return html;
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
export function buildStandaloneHTML(payload) {
    const css = readAsset("session.css");
    const componentsJs = readAsset("ai-components.js");
    const title = esc(payload.meta.title || "Session");
    const sessionHtml = renderSessionBody(payload);
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

    <script type="module">
${componentsJs}
    </script>
    <script>
${markdownWhitespacePatch()}
    </script>
  </body>
</html>
`;
}
