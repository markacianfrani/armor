/**
 * Convert a Claude Code session JSONL file into the { meta, messages }
 * payload that viewer.js renders. This is the Claude Code adapter — the
 * sibling of pi-session.ts — and produces the same RenderPayload shape,
 * so render.ts and viewer.js stay untouched.
 *
 * Claude Code stores one JSONL per session under
 *   ~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl
 * Each line is a JSON entry. Conversational entries (type user/assistant)
 * form a tree via uuid/parentUuid; interleaved bookkeeping entries
 * (permission-mode, file-history-snapshot, system, summary) are skipped.
 * Subagent runs live one level deeper at
 *   …/<parent-uuid>/subagents/agent-<id>.jsonl
 * and carry isSidechain: true.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
// ── helpers ──────────────────────────────────────────────────────────
/** tool_result.content can be a plain string or an array of text blocks. */
function extractResultText(content) {
  if (content === null || content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
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
/**
 * Strip Claude's slash-command wrappers so a title reflects the command.
 * A first turn like
 *   <command-name>/review</command-name><command-args>this branch</command-args>
 * becomes "/review this branch". Falls back to tag-stripped text otherwise.
 */
function cleanClaudeTitle(raw) {
  if (!raw) {
    return "";
  }
  const s = String(raw);
  const name = s.match(/<command-name>([\s\S]*?)<\/command-name>/)?.[1]?.trim();
  const args = s.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
  if (name) {
    return (name + (args ? " " + args : "")).replace(/\s+/g, " ").trim();
  }
  return s
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/** Only strip Claude XML for actual slash-command transport messages. */
function displayUserText(raw) {
  if (/<command-(?:message|name|args)>/.test(raw)) {
    return cleanClaudeTitle(raw) || raw;
  }
  return raw;
}
/** Bookkeeping entry types that are never conversational. */
function isBookkeeping(type) {
  return type === "permission-mode" || type === "file-history-snapshot" || type === "summary"; // compacted context
}
const CONTINUATION_PREFIX =
  "This session is being continued from a previous conversation that ran out of context.";
function isCompactionContinuationText(text) {
  return text.trimStart().startsWith(CONTINUATION_PREFIX);
}
function extractCompactionSummary(text) {
  const summaryStart = text.indexOf("Summary:");
  if (summaryStart < 0) {
    return text.trim();
  }
  let summary = text.slice(summaryStart + "Summary:".length).trim();
  const tail = summary.indexOf("\nContinue the conversation from where it left off");
  if (tail >= 0) {
    summary = summary.slice(0, tail).trim();
  }
  return summary;
}
function isCompactionCommandText(text) {
  const clean = cleanClaudeTitle(text);
  return clean === "/compact" || /Compacted \(ctrl\+o to see full summary\)/.test(text);
}
function makeState(subagentsByToolUseId = new Map()) {
  return {
    messages: [],
    firstUserTitle: "",
    lastModel: null,
    sawSidechain: false,
    pendingCompaction: null,
    subagentsByToolUseId,
    seq: 0,
  };
}
function nextId(state) {
  return `cc-${state.seq++}`;
}
function readSubagentMeta(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}
function loadSubagentRefs(jsonlPath) {
  const dir = join(dirname(jsonlPath), basename(jsonlPath, ".jsonl"), "subagents");
  const out = new Map();
  if (!existsSync(dir)) {
    return out;
  }
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const match = name.match(/^agent-([a-f0-9]+)\.meta\.json$/i);
    if (!match?.[1]) {
      continue;
    }
    const meta = readSubagentMeta(join(dir, name));
    if (!meta?.toolUseId) {
      continue;
    }
    const path = join(dir, `agent-${match[1]}.jsonl`);
    if (!existsSync(path)) {
      continue;
    }
    out.set(meta.toolUseId, { agentId: match[1], meta, path });
  }
  return out;
}
/** Find the newest entry that can anchor an active-branch walk. */
function findLeaf(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]?.uuid) {
      return entries[i] ?? null;
    }
  }
  return null;
}
function walkToRoot(leaf, byId) {
  const path = [];
  let cur = leaf;
  const guard = new Set();
  while (cur && cur.uuid && !guard.has(cur.uuid)) {
    guard.add(cur.uuid);
    path.push(cur);
    const pid = cur.parentUuid ?? cur.logicalParentUuid ?? null;
    cur = pid ? (byId.get(pid) ?? null) : null;
  }
  path.reverse();
  return path;
}
function entryOrder(entries) {
  return new Map(entries.map((entry, index) => [entry, index]));
}
function reachesAncestor(entry, ancestorId, byId, pathIds) {
  let pid = entry.parentUuid ?? entry.logicalParentUuid ?? null;
  const seen = new Set();
  while (pid && !seen.has(pid)) {
    if (pid === ancestorId) {
      return true;
    }
    if (pathIds.has(pid)) {
      return false;
    }
    seen.add(pid);
    const parent = byId.get(pid);
    pid = parent?.parentUuid ?? parent?.logicalParentUuid ?? null;
  }
  return false;
}
/**
 * Claude's tree can put concurrent tool results or post-compaction messages on
 * sibling branches. Splice descendants that happened between two active-branch
 * nodes back into file order so subagent/tool batches render completely.
 */
function injectIntermediateDescendants(path, entries, byId) {
  const order = entryOrder(entries);
  const pathIds = new Set(path.map((entry) => entry.uuid).filter((id) => Boolean(id)));
  const inserted = new Set();
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const current = path[i];
    if (!current) {
      continue;
    }
    out.push(current);
    if (!current.uuid) {
      continue;
    }
    const next = path[i + 1];
    const currentOrder = order.get(current) ?? -1;
    const nextOrder = next ? (order.get(next) ?? -1) : Infinity;
    const intermediate = entries
      .filter((entry) => {
        if (!entry.uuid || inserted.has(entry.uuid) || pathIds.has(entry.uuid)) {
          return false;
        }
        const entryOrderValue = order.get(entry) ?? -1;
        return (
          entryOrderValue > currentOrder &&
          entryOrderValue < nextOrder &&
          reachesAncestor(entry, current.uuid, byId, pathIds)
        );
      })
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    for (const entry of intermediate) {
      out.push(entry);
      if (entry.uuid) {
        inserted.add(entry.uuid);
      }
    }
  }
  return out;
}
/** Walk leaf → root via parentUuid/logicalParentUuid, then reverse to chronological order. */
function walkActiveBranch(entries, byId) {
  const leaf = findLeaf(entries);
  if (!leaf) {
    return [];
  }
  return injectIntermediateDescendants(walkToRoot(leaf, byId), entries, byId);
}
/** Build RenderBlocks from an assistant message's content array. */
function assistantBlocks(content, state) {
  const blocks = [];
  for (const c of content) {
    if (c.type === "text" && c.text) {
      blocks.push({ type: "text", text: c.text });
    } else if (c.type === "thinking" && c.thinking) {
      blocks.push({ type: "thinking", text: c.thinking });
    } else if (c.type === "redacted_thinking") {
      blocks.push({ type: "redacted_thinking" });
    } else if (c.type === "tool_use" && c.name) {
      const toolUseId = c.id || nextId(state);
      const block = {
        type: "tool_use",
        tool_name: c.name,
        tool_input:
          typeof c.input === "string" ? c.input : c.input ? JSON.stringify(c.input) : "{}",
        tool_use_id: toolUseId,
      };
      const subagent = state.subagentsByToolUseId.get(toolUseId);
      if (subagent && c.name === "Agent") {
        block.subagent = {
          agent_id: subagent.agentId,
          name: subagent.meta.name ?? null,
          description: subagent.meta.description ?? null,
          payload: convertClaudeSession(subagent.path),
        };
      }
      blocks.push(block);
    }
  }
  return blocks;
}
/** Emit a user-role text message, capturing the first as the title. */
function pushTextMessage(entry, text, state) {
  const displayText = displayUserText(text);
  if (!displayText.trim()) {
    return;
  }
  if (!state.firstUserTitle && !isCompactionContinuationText(text)) {
    state.firstUserTitle = cleanClaudeTitle(text) || titleFromText(displayText);
  }
  state.messages.push({
    id: entry.uuid || nextId(state),
    role: "user",
    timestamp: entry.timestamp,
    blocks: [{ type: "text", text: displayText }],
  });
}
function compactMetadataSummary(entry) {
  const metadata = entry.compactMetadata;
  if (!metadata) {
    return null;
  }
  const trigger = metadata["trigger"];
  const preTokens = metadata["preTokens"];
  const postTokens = metadata["postTokens"];
  const parts = [];
  if (typeof trigger === "string") {
    parts.push(`trigger: ${trigger}`);
  }
  if (typeof preTokens === "number" && typeof postTokens === "number") {
    parts.push(`tokens: ${preTokens.toLocaleString()} → ${postTokens.toLocaleString()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
function pushCompaction(entry, summary, state) {
  const metadataSummary = compactMetadataSummary(state.pendingCompaction ?? entry);
  state.messages.push({
    id: entry.uuid || nextId(state),
    role: "assistant",
    timestamp: entry.timestamp,
    blocks: [
      {
        type: "compaction",
        text: summary,
        tool_input: metadataSummary,
      },
    ],
  });
  state.pendingCompaction = null;
}
function processSystem(entry, state) {
  if (entry.subtype === "compact_boundary") {
    state.pendingCompaction = entry;
  }
}
/** Fold a user content array into result blocks plus a merged text turn. */
function emitUserContentArray(entry, content, state) {
  const resultBlocks = [];
  let textPieces = "";
  for (const b of content) {
    if (b.type === "tool_result") {
      resultBlocks.push({
        type: "tool_result",
        tool_use_id: b.tool_use_id || "",
        tool_output: extractResultText(b.content),
      });
    } else if (b.type === "text" && b.text) {
      textPieces += (textPieces ? "\n" : "") + b.text;
    }
  }
  if (textPieces.trim()) {
    pushTextMessage(entry, textPieces, state);
  }
  if (resultBlocks.length > 0) {
    state.messages.push({
      id: (entry.uuid || nextId(state)) + "-result",
      role: "user",
      timestamp: entry.timestamp,
      blocks: resultBlocks,
    });
  }
}
/** Handle a user-role entry: compaction artifacts, text, or tool results. */
function processUserMessage(entry, content, state) {
  if (typeof content === "string") {
    if (isCompactionContinuationText(content)) {
      pushCompaction(entry, extractCompactionSummary(content), state);
      return;
    }
    if (isCompactionCommandText(content)) {
      return;
    }
    pushTextMessage(entry, content, state);
    return;
  }
  if (Array.isArray(content)) {
    emitUserContentArray(entry, content, state);
  }
}
/** Handle an assistant-role entry: thinking, text, and tool_use blocks. */
function processAssistantMessage(entry, msg, state) {
  if (msg.model) {
    state.lastModel = msg.model;
  }
  const blocks = assistantBlocks(Array.isArray(msg.content) ? msg.content : [], state);
  if (blocks.length === 0) {
    return;
  }
  state.messages.push({
    id: entry.uuid || nextId(state),
    role: "assistant",
    timestamp: entry.timestamp,
    model: msg.model || null,
    blocks,
  });
}
/** Dispatch a conversational user/assistant entry (plus compaction artifacts). */
function processMessage(entry, state) {
  const msg = entry.message;
  if (!msg) {
    return;
  }
  if (msg.role === "user") {
    processUserMessage(entry, msg.content, state);
  } else if (msg.role === "assistant") {
    processAssistantMessage(entry, msg, state);
  }
}
/**
 * Recover the parent session id from a subagent file path:
 *   …/<parent-uuid>/subagents/agent-<id>.jsonl
 */
function recoverParentId(jsonlPath) {
  const m = jsonlPath.match(/([0-9a-f-]{36})\/subagents\/agent-[0-9a-f]+\.jsonl$/i);
  return m && m[1] ? m[1].toLowerCase() : null;
}
/** Pull cwd/sessionId/timestamps from the active branch (every Claude entry carries them). */
function resolveFields(path, firstEntry) {
  const cwd = path.find((e) => e.cwd)?.cwd ?? firstEntry.cwd ?? "";
  const sessionId = path.find((e) => e.sessionId)?.sessionId ?? firstEntry.sessionId ?? "";
  const createdAt = path[0]?.timestamp ?? firstEntry.timestamp ?? "";
  const updatedAt = path.length > 0 ? (path[path.length - 1]?.timestamp ?? "") : createdAt;
  return { cwd, sessionId, createdAt, updatedAt };
}
/** Build the render-ready meta from the session and accumulated state. */
function buildMeta(state, fields, jsonlPath) {
  const parentId = recoverParentId(jsonlPath);
  const isSub = state.sawSidechain || parentId !== null;
  const meta = {
    session_id: fields.sessionId,
    source: "claude",
    project: basename(fields.cwd) || "session",
    title: state.firstUserTitle || fields.sessionId.slice(0, 8),
    model: state.lastModel,
    created_at: fields.createdAt,
    updated_at: fields.updatedAt,
    cwd: fields.cwd,
  };
  if (parentId) {
    meta.parent_id = parentId;
    meta.is_subagent = true;
  } else if (isSub) {
    meta.is_subagent = true;
  }
  return meta;
}
export function convertClaudeSession(jsonlPath) {
  const raw = readFileSync(jsonlPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const entries = [];
  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    entries.push(entry);
  }
  const byId = new Map();
  let firstEntry = null;
  for (const e of entries) {
    if (e.uuid) {
      byId.set(e.uuid, e);
    }
    if (!firstEntry) {
      firstEntry = e;
    }
  }
  if (!firstEntry) {
    throw new Error(`No entries found in ${jsonlPath}`);
  }
  const path = walkActiveBranch(entries, byId);
  const state = makeState(loadSubagentRefs(jsonlPath));
  for (const entry of path) {
    if (entry.isSidechain) {
      state.sawSidechain = true;
    }
    if (entry.type === "system") {
      processSystem(entry, state);
      continue;
    }
    if (entry.isMeta || isBookkeeping(entry.type)) {
      continue;
    }
    if (entry.type === "user" || entry.type === "assistant") {
      processMessage(entry, state);
    }
  }
  const fields = resolveFields(path, firstEntry);
  if (!fields.sessionId) {
    fields.sessionId = basename(jsonlPath).replace(/\.jsonl$/, "");
  }
  const meta = buildMeta(state, fields, jsonlPath);
  return { meta, messages: state.messages };
}
