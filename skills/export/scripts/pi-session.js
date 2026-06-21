/**
 * Convert a pi session JSONL file into the { meta, messages } payload that
 * viewer.js renders. This is the pi-specific adapter; other harnesses will
 * get their own adapter producing the same shape.
 *
 * Pi session format: https://pi-coding-agent docs (session-format.md)
 * Each line is a JSON entry. Entries form a tree via id/parentId. We walk
 * the active branch (leaf → root) and emit render-ready messages, pairing
 * toolCall/toolResult the same way the live devlog DB does.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
// ── helpers ──────────────────────────────────────────────────────────
/** Pull concatenated text out of a pi content array/string. */
function extractText(content) {
  if (content === null || content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}
/** Slice a title from the first real user turn. */
function titleFromText(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "";
  }
  return clean.length > 80 ? clean.slice(0, 77) + "…" : clean;
}
/** Custom messages that are harness plumbing, not conversation. */
/** Strip injected-context wrappers so titles reflect the delegated task. */
function cleanTitle(title) {
  if (!title) {
    return "";
  }
  let t = String(title);
  t = t.replace(/^<file\s+name="[^"]*">\s*/, "");
  t = t.replace(/^<skill\b[^>]*>[\s\S]*?<\/skill>\s*/, "");
  t = t.replace(/^<skill\b[^>]*>\s*/, "");
  t = t.replace(/Complete your task\. When finished, call the subagent_done tool\.\s*/gi, "");
  return t.replace(/\s+/g, " ").trim();
}
function isHarnessNoise(customType) {
  if (!customType) {
    return false;
  }
  // pi reinjects the goal every turn — show it once in the header instead.
  return customType === "pi-goal-event";
}
function makeState() {
  return {
    messages: [],
    firstUserTitle: "",
    sessionName: "",
    goalText: "",
    lastModel: null,
    seq: 0,
  };
}
function nextId(state) {
  return `pi-${state.seq++}`;
}
/** Walk leaf → root, then reverse to get chronological active branch. */
function walkActiveBranch(entries, byId) {
  const leaf = entries.length > 0 ? (entries[entries.length - 1] ?? null) : null;
  if (!leaf) {
    return [];
  }
  const path = [];
  let cur = leaf;
  const guard = new Set();
  while (cur && cur.id && !guard.has(cur.id)) {
    guard.add(cur.id);
    path.push(cur);
    const pid = cur.parentId ?? null;
    const next = pid ? byId.get(pid) : undefined;
    cur = next ?? null;
  }
  path.reverse();
  return path;
}
/** Emit a user-role text message, capturing the first as the title. */
function pushTextMessage(entry, text, state, idSuffix = "") {
  if (!text.trim()) {
    return;
  }
  if (!state.firstUserTitle) {
    state.firstUserTitle = titleFromText(text);
  }
  state.messages.push({
    id: (entry.id || nextId(state)) + idSuffix,
    role: "user",
    timestamp: entry.timestamp,
    blocks: [{ type: "text", text }],
  });
}
/** Build RenderBlocks from an assistant message's content array. */
function assistantBlocks(content, entryId, state) {
  const blocks = [];
  for (const c of content) {
    if (c.type === "text" && c.text) {
      blocks.push({ type: "text", text: c.text });
    } else if (c.type === "thinking" && c.thinking) {
      blocks.push({ type: "thinking", text: c.thinking });
    } else if (c.type === "toolCall" && c.name) {
      blocks.push({
        type: "tool_use",
        tool_name: c.name,
        tool_input: c.arguments ? JSON.stringify(c.arguments) : "{}",
        tool_use_id: c.id || nextId(state),
      });
    }
  }
  return blocks;
}
/** Synthesize a paired tool_use + tool_result for a bashExecution entry. */
function pushBashExecution(entry, msg, state) {
  const useId = `bash:${entry.id || nextId(state)}`;
  state.messages.push({
    id: (entry.id || nextId(state)) + "-call",
    role: "assistant",
    timestamp: entry.timestamp,
    blocks: [
      {
        type: "tool_use",
        tool_name: "bash",
        tool_input: JSON.stringify({ command: msg.command || "" }),
        tool_use_id: useId,
      },
    ],
  });
  state.messages.push({
    id: (entry.id || nextId(state)) + "-result",
    role: "user",
    timestamp: entry.timestamp,
    blocks: [
      {
        type: "tool_result",
        tool_use_id: useId,
        tool_name: "bash",
        tool_output: msg.output || "",
      },
    ],
  });
}
/** Process a `message`-typed entry; returns false to skip the entry. */
function processMessage(entry, msg, state) {
  switch (msg.role) {
    case "user": {
      pushTextMessage(entry, extractText(msg.content), state);
      break;
    }
    case "assistant": {
      if (msg.model) {
        state.lastModel = msg.provider ? `${msg.provider}/${msg.model}` : msg.model;
      }
      const content = Array.isArray(msg.content) ? msg.content : [];
      const blocks = assistantBlocks(content, entry.id, state);
      if (blocks.length === 0) {
        break;
      }
      state.messages.push({
        id: entry.id || nextId(state),
        role: "assistant",
        timestamp: entry.timestamp,
        model: msg.model || null,
        blocks,
      });
      break;
    }
    case "toolResult": {
      state.messages.push({
        id: entry.id || nextId(state),
        role: "user",
        timestamp: entry.timestamp,
        blocks: [
          {
            type: "tool_result",
            tool_use_id: msg.toolCallId || "",
            tool_name: msg.toolName || null,
            tool_output: extractText(msg.content),
          },
        ],
      });
      break;
    }
    case "bashExecution": {
      pushBashExecution(entry, msg, state);
      break;
    }
    case "custom": {
      if (isHarnessNoise(msg.customType ?? entry.customType)) {
        break;
      }
      pushTextMessage(entry, extractText(msg.content), state);
      break;
    }
    default:
      break;
  }
}
/** Capture a pi-goal statement from a custom entry (first wins). */
function captureGoal(entry, state) {
  const g = entry.data?.["goal"];
  if (typeof g === "string" && g.trim() && !state.goalText) {
    state.goalText = g.trim();
  }
}
/** Render a branch_summary entry as a muted contextual note. */
function pushBranchSummary(entry, state) {
  state.messages.push({
    id: entry.id || nextId(state),
    role: "assistant",
    timestamp: entry.timestamp,
    blocks: [
      {
        type: "text",
        text: `*↳ branched from earlier context:*\n\n${(entry.summary ?? "").trim()}`,
      },
    ],
  });
}
/** Render a custom_message entry, skipping harness noise and hidden ones. */
function pushCustomMessage(entry, state) {
  if (isHarnessNoise(entry.customType) || entry.display === false) {
    return;
  }
  pushTextMessage(entry, extractText(entry.content), state);
}
/** Process a non-`message` entry, mutating state in place. */
function processEntry(entry, state) {
  if (entry.type === "session_info" && entry.name) {
    state.sessionName = entry.name;
    return;
  }
  if (entry.type === "custom" && entry.customType === "pi-goal") {
    captureGoal(entry, state);
    return;
  }
  if (entry.type === "model_change" && entry.modelId) {
    state.lastModel = entry.provider ? `${entry.provider}/${entry.modelId}` : entry.modelId;
    return;
  }
  // Skip pure bookkeeping entries from the transcript.
  if (entry.type === "thinking_level_change" || entry.type === "label") {
    return;
  }
  // Compaction is invisible context management; skip to keep the
  // shared transcript linear and faithful to what the user saw.
  if (entry.type === "compaction") {
    return;
  }
  // Branch summaries capture abandoned context — render as a muted note.
  if (entry.type === "branch_summary" && entry.summary) {
    pushBranchSummary(entry, state);
    return;
  }
  // custom_message (in-context extension message)
  if (entry.type === "custom_message") {
    pushCustomMessage(entry, state);
    return;
  }
  if (entry.message) {
    processMessage(entry, entry.message, state);
  }
}
/**
 * Recover the parent session id from the first user turn's injected
 * artifact path (.../artifacts/<parent-uuid>/context/<file>).
 */
function recoverParentId(firstUserText) {
  const m = firstUserText.match(/\/artifacts\/([0-9a-f-]{36})\//);
  return m && m[1] ? m[1] : null;
}
/** Build the render-ready meta from the session header and accumulated state. */
function buildMeta(header, state, cwd, jsonlPath, lastTimestamp) {
  const parentId = recoverParentId(state.firstUserTitle);
  const rawTitle = state.sessionName || state.firstUserTitle;
  const meta = {
    session_id: header.id || basename(jsonlPath),
    source: "pi",
    project: basename(cwd) || "session",
    title: cleanTitle(rawTitle) || (header.id || "session").slice(0, 8),
    model: state.lastModel,
    created_at: header.timestamp || "",
    updated_at: lastTimestamp,
    cwd,
  };
  if (state.goalText) {
    meta.goal = state.goalText;
  }
  if (parentId) {
    meta.parent_id = parentId;
    meta.is_subagent = true;
  }
  return meta;
}
export function convertPiSession(jsonlPath) {
  const raw = readFileSync(jsonlPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const entries = [];
  let header = null;
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "session") {
      header = entry;
      continue;
    }
    entries.push(entry);
  }
  if (!header) {
    throw new Error(`No session header found in ${jsonlPath}`);
  }
  const byId = new Map();
  for (const e of entries) {
    if (e.id) {
      byId.set(e.id, e);
    }
  }
  const path = walkActiveBranch(entries, byId);
  const state = makeState();
  for (const entry of path) {
    processEntry(entry, state);
  }
  const cwd = header.cwd || "";
  const lastTimestamp =
    path.length > 0 ? (path[path.length - 1]?.timestamp ?? "") : header.timestamp || "";
  const meta = buildMeta(header, state, cwd, jsonlPath, lastTimestamp);
  return { meta, messages: state.messages };
}
