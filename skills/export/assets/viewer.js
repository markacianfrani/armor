/*
 * Shared session-transcript renderer.
 *
 * Consumed by:
 *   - the live devlog UI (public/index.html), and
 *   - the standalone single-file export (src/render.ts)
 *
 * Exposes window.renderSession(data, contentEl) where `data` is the
 * { meta, messages } payload in the devlog content_blocks shape:
 *
 *   meta:    { title, source, model, created_at, cwd, goal? }
 *   messages:[ { id, role, blocks: [ { type, text, tool_name,
 *            tool_input, tool_output, tool_use_id } ] } ]
 *
 * type ∈ text | thinking | redacted_thinking | tool_use | tool_result
 */
(function () {
  "use strict";

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escAttr(s) {
    // Don't escape newlines — ai-markdown/ai-thinking content properties
    // handle them natively. Just escape HTML-breaking characters.
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function relativeTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
    if (isNaN(d.getTime())) return dateStr;
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    const months = Math.floor(days / 30);
    if (months < 12) return months + "mo ago";
    return Math.floor(months / 12) + "y ago";
  }

  function sourceBadge(source) {
    if (!source) return "";
    const s = source.toLowerCase();
    const cls = s.includes("claude") ? "claude" : s.includes("pi") ? "pi" : "";
    if (!cls) return '<span class="badge">' + esc(source) + "</span>";
    return '<span class="badge ' + cls + '"><span class="dot"></span>' + esc(source) + "</span>";
  }

  function unwrapCustomMessages(text) {
    // Pi stores some rich/custom messages as XML-ish wrappers inside
    // normal text blocks. ai-markdown intentionally renders unknown HTML
    // literally, so strip the transport wrapper and let the inner markdown
    // read like the rest of the transcript.
    return String(text == null ? "" : text)
      .replace(
        /<pi:custom-message\b[^>]*>([\s\S]*?)<\/pi:custom-message>/g,
        function (_match, inner) {
          return "\n\n" + String(inner || "").trim() + "\n\n";
        },
      )
      .trim();
  }

  function looksLikeError(output, toolName) {
    if (!output) return false;
    const text = output.trim();
    if (!text) return false;

    // `read` outputs are usually source code. Source code often contains strings
    // like `throw new Error(...)`, `Failed to fetch`, or `Not found`, so scanning
    // the whole output makes successful file reads look failed. Only treat a read
    // as failed when the tool-result itself starts like a failure message.
    const name = (toolName || "").toLowerCase();
    if (name.includes("read")) {
      return /^(error|failed|exception|enoent|file not found|no such file|cannot read)\b/i.test(
        text,
      );
    }

    const firstLines = text.split("\n").slice(0, 8).join("\n").toLowerCase();
    return (
      /(^|\n)\s*(error|failed|exception)\b/.test(firstLines) ||
      firstLines.includes("enoent") ||
      (firstLines.includes("not found") && firstLines.includes("error"))
    );
  }

  function summarizeToolUse(name, input) {
    if (!input) return name;
    const str = typeof input === "string" ? input : JSON.stringify(input);

    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const path = parsed.path || parsed.file_path || parsed.filePath;
        if (typeof path === "string" && path) {
          return path.length > 60 ? "…" + path.slice(-55) : path;
        }
      }
    } catch (_e) {
      // Fall through to regex/line based summaries.
    }

    // For file operations, show the path
    const filePathMatch = str.match(/["']([\/~][^"']+)["']/);
    if (filePathMatch) {
      const path = filePathMatch[1];
      const shortPath = path.length > 60 ? "…" + path.slice(-55) : path;
      return shortPath;
    }

    // For bash/shell commands, show the command
    const cmdMatch = str.match(/"command"\s*:\s*"([^"]+)"/);
    if (cmdMatch) {
      const cmd = cmdMatch[1];
      return cmd.length > 80 ? cmd.slice(0, 77) + "…" : cmd;
    }

    // Generic: first meaningful line
    const firstLine =
      str
        .split("\n")
        .find((l) => l.trim() && !l.trim().startsWith("{") && !l.trim().startsWith('"')) || "";
    if (firstLine.length > 80) return firstLine.slice(0, 77) + "…";
    if (firstLine) return firstLine;

    return name;
  }

  function formatToolInput(toolName, rawInput) {
    if (!rawInput) return "";
    try {
      const parsed = JSON.parse(rawInput);
      // Bash commands — show just the command
      if (parsed.command) return parsed.command;
      // File read/write — show the path
      if (parsed.file_path || parsed.filePath) return parsed.file_path || parsed.filePath;
      // Edit operations with path
      if (parsed.path) {
        if (parsed.edits) {
          const n = parsed.edits.length;
          const summary = parsed.edits
            .map((e) => {
              const old = (e.oldText || "").substring(0, 40).replace(/\n/g, " ");
              return old.length < (e.oldText || "").length ? old + "…" : old;
            })
            .join(", ");
          return (
            parsed.path + (n > 0 ? "\n\n" + n + " edit" + (n > 1 ? "s" : "") + ": " + summary : "")
          );
        }
        // File write with path + content
        if (parsed.content) {
          const lines = parsed.content.split("\n").length;
          return parsed.path + " (" + lines + " lines)";
        }
        return parsed.path;
      }
      // Generic — pretty print
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return rawInput;
    }
  }

  /**
   * Restructures raw messages into render-ready conversation turns.
   * tool_result user-messages get merged into the preceding assistant
   * message that issued the tool_use.
   */
  function buildConversation(rawMessages) {
    // 1. Build a lookup: tool_use_id → tool_result block(s)
    const resultByUseId = new Map();
    for (const msg of rawMessages) {
      for (const block of msg.blocks) {
        if (block.type === "tool_result" && block.tool_use_id) {
          resultByUseId.set(block.tool_use_id, block);
        }
      }
    }

    // 2. Track which messages are pure tool_result carriers (skip them)
    const skipMsgIds = new Set();
    for (const msg of rawMessages) {
      if (msg.role !== "user") continue;
      const allToolResults = msg.blocks.every((b) => b.type === "tool_result");
      if (allToolResults) skipMsgIds.add(msg.id);
    }

    // 3. Walk messages, enriching tool_use blocks with their results
    const turns = [];
    for (const msg of rawMessages) {
      if (skipMsgIds.has(msg.id)) continue;

      const role = msg.role === "assistant" ? "assistant" : "user";
      const label = role === "assistant" ? "Assistant" : "User";
      const enrichedBlocks = [];

      for (const block of msg.blocks) {
        if (block.type === "tool_use") {
          const result = block.tool_use_id ? resultByUseId.get(block.tool_use_id) : null;
          enrichedBlocks.push({
            ...block,
            pairedResult: result || null,
          });
        } else {
          enrichedBlocks.push(block);
        }
      }

      if (role === "user" && enrichedBlocks.length === 0) continue;

      // Merge into the previous turn if same role — e.g. consecutive
      // assistant messages (each a separate API call) become one turn
      // so the transcript shows one "Assistant" label, not many.
      const prev = turns[turns.length - 1];
      if (prev && prev.role === role) {
        prev.blocks = prev.blocks.concat(enrichedBlocks);
      } else {
        turns.push({ role, label, blocks: enrichedBlocks });
      }
    }

    return turns;
  }

  function renderBlock(block) {
    switch (block.type) {
      case "text": {
        const tone = "assistant";
        const text = unwrapCustomMessages(block.text || "");
        return '<ai-markdown tone="' + tone + '" content="' + escAttr(text) + '"></ai-markdown>';
      }

      case "thinking":
        return (
          '<ai-thinking source="model" content="' + escAttr(block.text || "") + '"></ai-thinking>'
        );

      case "redacted_thinking":
        return "<ai-thinking redacted></ai-thinking>";

      case "tool_use": {
        const toolName = block.tool_name || "unknown";
        const headline = summarizeToolUse(toolName, block.tool_input);
        const hasInput = block.tool_input && block.tool_input.trim();
        const result = block.pairedResult;
        const resultOutput = result ? result.tool_output || "" : "";
        const resultIsError = result ? looksLikeError(resultOutput, toolName) : false;
        const status = resultIsError ? "error" : result ? "success" : "success";

        let html =
          '<ai-tool-call name="' +
          escAttr(toolName) +
          '" label="' +
          escAttr(toolName) +
          '" headline="' +
          escAttr(headline) +
          '" status="' +
          status +
          (resultIsError ? '" open' : '"') +
          ">";
        if (hasInput) {
          const formatted = formatToolInput(toolName, block.tool_input);
          const toolNameLower = (toolName || "").toLowerCase();
          const isBash = toolNameLower === "bash" || toolNameLower === "shell";
          if (!isBash) {
            html +=
              '<pre slot="input" class="tool-input-pre"><code>' + esc(formatted) + "</code></pre>";
          }
        }
        if (resultOutput) {
          html +=
            '<ai-tool-result content="' +
            escAttr(resultOutput) +
            '" status="' +
            status +
            '"></ai-tool-result>';
        }
        html += "</ai-tool-call>";
        return html;
      }

      case "tool_result": {
        const output = block.tool_output || "";
        const isError = looksLikeError(output, block.tool_name || "");
        return (
          '<ai-tool-result content="' +
          escAttr(output) +
          '" status="' +
          (isError ? "error" : "success") +
          '"></ai-tool-result>'
        );
      }

      default:
        if (block.text) {
          return '<ai-markdown content="' + escAttr(block.text) + '"></ai-markdown>';
        }
        return "";
    }
  }

  /**
   * ai-markdown's shadow CSS uses `white-space: pre-wrap`; combined with
   * Lit's template indentation, that turns every list item into blank-line +
   * text + blank-line. Since we do not own the component internals, patch its
   * shadow roots after render so bullets read like normal markdown lists.
   */
  function patchMarkdownListWhitespace(contentEl) {
    function apply() {
      contentEl.querySelectorAll("ai-markdown").forEach((el) => {
        const root = el.shadowRoot;
        if (!root || root.querySelector("style[data-devlog-list-fix]")) return;
        const style = document.createElement("style");
        style.setAttribute("data-devlog-list-fix", "");
        style.textContent =
          ".markdown li{white-space:normal!important;}" +
          ".markdown li pre,.markdown li code{white-space:pre-wrap!important;}";
        root.appendChild(style);
      });
    }
    apply();
    requestAnimationFrame(apply);
  }

  /**
   * Render a full { meta, messages } payload into contentEl.
   * Produces the meta bar, optional goal banner, and the conversation.
   */
  function renderSession(data, contentEl) {
    const meta = data.meta || {};
    const sessionId = meta.session_id || "";
    const conversation = buildConversation(data.messages || []);

    // Standalone single-file exports (src/render.ts) set <html class="standalone">
    // and have no router — render tree links as inert labels there.
    var isStandalone =
      document.documentElement && document.documentElement.classList.contains("standalone");

    let html = '<div class="session-viewer">';

    html += '<div class="session-meta-bar">';
    html += '<span class="session-title">' + esc(meta.title || sessionId.slice(0, 16)) + "</span>";
    if (meta.is_subagent) {
      html += '<span class="badge subagent">subagent</span>';
    }
    if (meta.parent_id) {
      var ptitle = meta.parent_title || "parent session";
      if (isStandalone) {
        html += '<span class="meta-item subagent-back">↳ ' + esc(ptitle) + "</span>";
      } else {
        html +=
          '<a class="meta-item subagent-back" href="#/session/' +
          encodeURIComponent(meta.parent_id) +
          '">↳ ' +
          esc(ptitle) +
          "</a>";
      }
    }
    html += sourceBadge(meta.source);
    if (meta.model) html += '<span class="meta-item">' + esc(meta.model) + "</span>";
    if (meta.created_at)
      html += '<span class="meta-item">' + relativeTime(meta.created_at) + "</span>";
    if (meta.cwd) html += '<span class="meta-item session-cwd">' + esc(meta.cwd) + "</span>";
    html += "</div>";

    if (meta.goal) {
      html +=
        '<div class="session-goal"><span class="goal-label">Objective</span>' +
        esc(meta.goal) +
        "</div>";
    }

    if (meta.children && meta.children.length) {
      var n = meta.children.length;
      html += '<div class="session-children">';
      html += '<span class="children-label">' + n + " subagent" + (n > 1 ? "s" : "") + "</span>";
      for (var i = 0; i < meta.children.length; i++) {
        var c = meta.children[i];
        var ct = c.title || c.session_id.slice(0, 12);
        var agentTag = c.agent_id
          ? ' <code class="child-agent">' + esc(c.agent_id.slice(0, 8)) + "</code>"
          : "";
        if (isStandalone) {
          html += '<div class="child-item">' + esc(ct) + agentTag + "</div>";
        } else {
          html +=
            '<a class="child-item" href="#/session/' +
            encodeURIComponent(c.session_id) +
            '">' +
            esc(ct) +
            agentTag +
            "</a>";
        }
      }
      html += "</div>";
    }

    html += '<ai-conversation density="comfortable">';

    for (const msg of conversation) {
      html += '<ai-message role="' + msg.role + '" label="' + msg.label + '">';
      for (const block of msg.blocks) {
        html += renderBlock(block);
      }
      html += "</ai-message>";
    }

    html += "</ai-conversation></div>";
    contentEl.innerHTML = html;
    patchMarkdownListWhitespace(contentEl);
  }

  window.renderSession = renderSession;
})();
