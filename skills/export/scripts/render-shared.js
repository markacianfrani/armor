export function esc(s) {
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
function relativeTime(dateStr) {
  if (!dateStr) {
    return "";
  }
  const d = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) {
    return dateStr;
  }
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  const days = Math.floor(hrs / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }
  return `${Math.floor(months / 12)}y ago`;
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
  // `read` outputs are usually source code, which often contains strings like
  // `throw new Error(...)`, so scanning the whole output makes successful reads
  // look failed. Only treat a read as failed when the result itself starts
  // like a failure message.
  const name = toolName.toLowerCase();
  if (name.includes("read")) {
    return /^(error|failed|exception|enoent|file not found|no such file|cannot read)\b/i.test(text);
  }
  const firstLines = text.split("\n").slice(0, 8).join("\n").toLowerCase();
  return (
    /(^|\n)\s*(error|failed|exception)\b/.test(firstLines) ||
    firstLines.includes("enoent") ||
    (firstLines.includes("not found") && firstLines.includes("error"))
  );
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
  const firstLine =
    input
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
  } catch {
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
  } catch {
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
    } else {
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
function tallyToolCategory(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("read")) {
    return "reads";
  }
  if (n.includes("write") || n.includes("edit")) {
    return "edits";
  }
  if (n === "bash" || n === "shell") {
    return "cmds";
  }
  if (n.includes("fetch") || n.includes("search")) {
    return "web";
  }
  return "other";
}
/** "13 tools · 8 reads · 5 web · sonnet-4-6" — the scale hint on a spawn row. */
function subagentCountsText(toolBlocks, model) {
  const counts = {};
  for (const b of toolBlocks) {
    const c = tallyToolCategory(b.tool_name ?? "");
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const total = toolBlocks.length;
  const order = ["reads", "edits", "cmds", "web", "other"];
  const parts = order.filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`);
  let text = `${total} tool${total === 1 ? "" : "s"}`;
  if (parts.length > 0) {
    text += ` · ${parts.slice(0, 3).join(" · ")}`;
  }
  if (model) {
    text += ` · ${model.replace(/^claude-/, "")}`;
  }
  return text;
}
/** Stable anchor id for a spawn, used by the overview jump list. */
function subagentAnchorId(sub) {
  return `subagent-${sub.agent_id.slice(0, 8)}`;
}
/** Index of the last non-empty assistant text block — the spawn's "answer". */
function lastAssistantTextIndex(blocks) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b && b.type === "text" && (b.text ?? "").trim()) {
      return i;
    }
  }
  return -1;
}
/** Flat step list: narration + tool calls in order, skipping the answer block. */
function renderSubagentSteps(blocks, skipIdx) {
  return blocks
    .map((b, i) => {
      if (i === skipIdx) {
        return "";
      }
      if (b.type === "tool_use") {
        return renderToolUseBlock(b);
      }
      if (b.type === "text" || b.type === "thinking") {
        return renderBlock(b);
      }
      return "";
    })
    .join("");
}
/**
 * A subagent spawn renders as one flat panel instead of a six-level nest
 * (ai-event > ai-conversation > ai-message > …): the returned answer first,
 * then a flat step list, then a collapsed prompt. The returned answer is the
 * final assistant text block — not the often-empty spawn tool_result, and not
 * the first user turn (the prompt).
 */
function renderSubagentSpawn(block) {
  const sub = block.subagent;
  if (!sub) {
    return "";
  }
  const task = sub.name || sub.description || `agent-${sub.agent_id.slice(0, 8)}`;
  const model = sub.payload.meta.model ?? "";
  const asstBlocks = [];
  for (const turn of buildConversation(sub.payload.messages)) {
    if (turn.role === "assistant") {
      asstBlocks.push(...turn.blocks);
    }
  }
  const answerIdx = lastAssistantTextIndex(asstBlocks);
  const toolBlocks = asstBlocks.filter((b) => b.type === "tool_use");
  const result = block.pairedResult;
  const resultOutput = result?.tool_output ?? "";
  const status = result && looksLikeError(resultOutput, "Agent") ? "error" : "success";
  const subline = subagentCountsText(toolBlocks, model);
  let html =
    `<ai-tool-call id="${escAttr(subagentAnchorId(sub))}" name="Agent" label="⑂ subagent" ` +
    `headline="${escAttr(clipHead(task, 80))}" subline="${escAttr(subline)}" status="${status}"${status === "error" ? " open" : ""}>` +
    '<div class="sa">';
  // (a) Returned answer.
  let answerHtml = "";
  if (answerIdx >= 0) {
    const ab = asstBlocks[answerIdx];
    if (ab) {
      answerHtml = renderBlock(ab);
    }
  } else if (resultOutput.trim()) {
    answerHtml = `<ai-tool-result content="${escAttr(resultOutput)}" status="${status}"></ai-tool-result>`;
  }
  if (answerHtml) {
    html +=
      '<div class="sa-return"><span class="sa-return-label">Returned</span>' +
      answerHtml +
      "</div>";
  }
  // (b) Flat steps: narration + tool calls in order, minus the answer.
  const stepHtml = renderSubagentSteps(asstBlocks, answerIdx);
  if (stepHtml) {
    const n = toolBlocks.length;
    html +=
      `<div class="sa-steps"><span class="sa-steps-label">${n} step${n === 1 ? "" : "s"}</span>` +
      stepHtml +
      "</div>";
  }
  // (c) Prompt, collapsed.
  const promptText = formatToolInput("Agent", block.tool_input);
  if (promptText.trim()) {
    html +=
      '<details class="sa-prompt"><summary>Prompt</summary>' +
      `<pre class="tool-input-pre"><code>${esc(promptText)}</code></pre></details>`;
  }
  return html + "</div></ai-tool-call>";
}
function renderToolUseBlock(block) {
  // A subagent spawn flattens to its own panel instead of a nested conversation.
  if (block.subagent) {
    return renderSubagentSpawn(block);
  }
  const toolName = block.tool_name || "unknown";
  const result = block.pairedResult;
  const resultOutput = result?.tool_output || "";
  const resultIsError = result ? looksLikeError(resultOutput, toolName) : false;
  const status = resultIsError ? "error" : "success";
  const open = resultIsError ? " open" : "";
  let html =
    `<ai-tool-call name="${escAttr(toolName)}" label="${escAttr(toolName)}" ` +
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
      return (
        '<ai-event class="compaction-event" kind="checkpoint" severity="info" source="claude">' +
        '<span slot="summary">Conversation compacted</span>' +
        meta +
        `<ai-markdown content="${escAttr(block.text || "")}"></ai-markdown></ai-event>`
      );
    }
    default:
      return block.text ? `<ai-markdown content="${escAttr(block.text)}"></ai-markdown>` : "";
  }
}
function renderChildren(children, opts) {
  const n = children.length;
  let html = '<div class="session-children">';
  html += `<span class="children-label">${n} subagent${n > 1 ? "s" : ""}</span>`;
  for (const child of children) {
    const title = child.title || child.session_id.slice(0, 12);
    const agentTag = child.agent_id
      ? ` <code class="child-agent">${esc(child.agent_id.slice(0, 8))}</code>`
      : "";
    if (opts.isStandalone) {
      html += `<div class="child-item">${esc(title)}${agentTag}</div>`;
    } else {
      html += `<a class="child-item" href="#/session/${encodeURIComponent(child.session_id)}">${esc(title)}${agentTag}</a>`;
    }
  }
  html += "</div>";
  return html;
}
/** Collect every tool_use block inside a subagent's payload (one nesting level). */
function collectSubagentToolBlocks(sub) {
  const out = [];
  for (const sm of sub.payload.messages) {
    for (const sb of sm.blocks) {
      if (sb.type === "tool_use") {
        out.push(sb);
      }
    }
  }
  return out;
}
/** Walk every message (and nested subagents) for run-level totals + a spawn index. */
function summarizeRun(messages) {
  const subs = [];
  let totalTools = 0;
  let fileEdits = 0;
  const walk = (msgs) => {
    for (const m of msgs) {
      for (const b of m.blocks) {
        if (b.type !== "tool_use") {
          continue;
        }
        totalTools++;
        if (tallyToolCategory(b.tool_name ?? "") === "edits") {
          fileEdits++;
        }
        if (b.subagent) {
          const sub = b.subagent;
          subs.push({
            id: subagentAnchorId(sub),
            title: sub.name || sub.description || `agent-${sub.agent_id.slice(0, 8)}`,
            counts: subagentCountsText(collectSubagentToolBlocks(sub), ""),
          });
          walk(sub.payload.messages);
        }
      }
    }
  };
  walk(messages);
  return { subs, totalTools, fileEdits };
}
function runSummaryItem(num, label) {
  return `<span><span class="rs-num">${num}</span> ${label}</span>`;
}
/** One quiet line giving the shape of the run before the wall of content. */
function renderRunSummary(turns, run) {
  let html =
    runSummaryItem(turns, `turn${turns === 1 ? "" : "s"}`) +
    runSummaryItem(run.totalTools, `tool call${run.totalTools === 1 ? "" : "s"}`);
  if (run.subs.length > 0) {
    html += runSummaryItem(run.subs.length, `subagent${run.subs.length === 1 ? "" : "s"}`);
  }
  if (run.fileEdits > 0) {
    html += runSummaryItem(run.fileEdits, `file edit${run.fileEdits === 1 ? "" : "s"}`);
  }
  return `<div class="run-summary">${html}</div>`;
}
/** A jump list of the subagent spawns, with expand/collapse-all controls. */
function renderOverview(subs) {
  const items = subs
    .map(
      (s) =>
        `<a class="ov-item" href="#${escAttr(s.id)}">` +
        '<span class="ov-fork">⑂</span>' +
        `<span class="ov-title">${esc(s.title)}</span>` +
        `<span class="ov-counts">${esc(s.counts)}</span></a>`,
    )
    .join("");
  return (
    '<details class="subagent-overview">' +
    `<summary class="ov-summary">${subs.length} subagent${subs.length === 1 ? "" : "s"} · jump to</summary>` +
    '<div class="ov-body">' +
    '<span class="ov-actions"><button type="button" data-act="expand">Expand all</button>' +
    '<button type="button" data-act="collapse">Collapse all</button></span>' +
    `<div class="ov-list">${items}</div></div></details>`
  );
}
/** Render the meta bar, optional goal/children, and the conversation. */
export function renderSessionHTML(payload, opts) {
  const meta = payload.meta;
  const sessionId = meta.session_id || "";
  const time =
    opts.relativeTime && meta.created_at ? relativeTime(meta.created_at) : (meta.created_at ?? "");
  let html = '<div class="session-viewer">';
  html += '<div class="session-meta-bar">';
  html += `<span class="session-title">${esc(meta.title || sessionId.slice(0, 16))}</span>`;
  if (meta.is_subagent) {
    html += '<span class="badge subagent">subagent</span>';
  }
  if (meta.parent_id) {
    const ptitle = meta.parent_title || "parent session";
    if (opts.isStandalone) {
      html += `<span class="meta-item subagent-back">↳ ${esc(ptitle)}</span>`;
    } else {
      html += `<a class="meta-item subagent-back" href="#/session/${encodeURIComponent(meta.parent_id)}">↳ ${esc(ptitle)}</a>`;
    }
  }
  html += sourceBadge(meta.source);
  if (meta.model) {
    html += `<span class="meta-item">${esc(meta.model)}</span>`;
  }
  if (time) {
    html += `<span class="meta-item">${esc(time)}</span>`;
  }
  if (meta.cwd) {
    html += `<span class="meta-item session-cwd">${esc(meta.cwd)}</span>`;
  }
  html += "</div>";
  const run = summarizeRun(payload.messages);
  if (run.totalTools > 0) {
    html += renderRunSummary(buildConversation(payload.messages).length, run);
  }
  if (run.subs.length > 0) {
    html += renderOverview(run.subs);
  }
  if (meta.goal) {
    html += `<div class="session-goal"><span class="goal-label">Objective</span>${esc(meta.goal)}</div>`;
  }
  if (meta.children?.length) {
    html += renderChildren(meta.children, opts);
  }
  html += renderConversation(payload.messages);
  html += "</div>";
  return html;
}
