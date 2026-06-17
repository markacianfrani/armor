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
import { readFileSync } from "node:fs";
import { basename } from "node:path";
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
    return (type === "permission-mode" ||
        type === "file-history-snapshot" ||
        type === "system" || // turn_duration, rate-limit, etc.
        type === "summary"); // compacted context
}
function makeState() {
    return { messages: [], firstUserTitle: "", lastModel: null, sawSidechain: false, seq: 0 };
}
function nextId(state) {
    return `cc-${state.seq++}`;
}
/** Walk leaf → root via parentUuid, then reverse to chronological order. */
function walkActiveBranch(entries, byId) {
    // Leaf = last entry (by file order) that carries a uuid. Trailing
    // bookkeeping lines without a uuid are ignored as walk anchors.
    let leaf = null;
    for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i]?.uuid) {
            leaf = entries[i] ?? null;
            break;
        }
    }
    if (!leaf) {
        return [];
    }
    const path = [];
    let cur = leaf;
    const guard = new Set();
    while (cur && cur.uuid && !guard.has(cur.uuid)) {
        guard.add(cur.uuid);
        path.push(cur);
        const pid = cur.parentUuid ?? null;
        cur = pid ? (byId.get(pid) ?? null) : null;
    }
    path.reverse();
    return path;
}
/** Build RenderBlocks from an assistant message's content array. */
function assistantBlocks(content, state) {
    const blocks = [];
    for (const c of content) {
        if (c.type === "text" && c.text) {
            blocks.push({ type: "text", text: c.text });
        }
        else if (c.type === "thinking" && c.thinking) {
            blocks.push({ type: "thinking", text: c.thinking });
        }
        else if (c.type === "redacted_thinking") {
            blocks.push({ type: "redacted_thinking" });
        }
        else if (c.type === "tool_use" && c.name) {
            blocks.push({
                type: "tool_use",
                tool_name: c.name,
                tool_input: typeof c.input === "string" ? c.input : c.input ? JSON.stringify(c.input) : "{}",
                tool_use_id: c.id || nextId(state),
            });
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
    if (!state.firstUserTitle) {
        state.firstUserTitle = cleanClaudeTitle(text) || titleFromText(displayText);
    }
    state.messages.push({
        id: entry.uuid || nextId(state),
        role: "user",
        timestamp: entry.timestamp,
        blocks: [{ type: "text", text: displayText }],
    });
}
/** Process a conversational user/assistant entry. */
function processMessage(entry, state) {
    const msg = entry.message;
    if (!msg) {
        return;
    }
    const content = msg.content;
    if (msg.role === "user") {
        // A user turn is either plain text or an array of blocks.
        if (Array.isArray(content)) {
            // tool_result blocks become paired result blocks; text becomes a turn.
            const resultBlocks = [];
            let textPieces = "";
            for (const b of content) {
                if (b.type === "tool_result") {
                    resultBlocks.push({
                        type: "tool_result",
                        tool_use_id: b.tool_use_id || "",
                        tool_output: extractResultText(b.content),
                    });
                }
                else if (b.type === "text" && b.text) {
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
        else if (typeof content === "string") {
            pushTextMessage(entry, content, state);
        }
        return;
    }
    if (msg.role === "assistant") {
        if (msg.model) {
            state.lastModel = msg.model;
        }
        const blocks = assistantBlocks(Array.isArray(content) ? content : [], state);
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
    }
    else if (isSub) {
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
        }
        catch {
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
    const state = makeState();
    for (const entry of path) {
        if (entry.isSidechain) {
            state.sawSidechain = true;
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
