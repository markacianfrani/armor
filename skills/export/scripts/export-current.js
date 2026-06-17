#!/usr/bin/env node
/**
 * Export the current Pi/Claude session without asking for a JSONL path.
 *
 * The "current" session is inferred as the newest raw session file whose
 * embedded cwd matches the shell cwd. This is intentionally independent of
 * devlog's SQLite index: it works before devlog is installed or has indexed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { convertClaudeSession } from "./claude-session.js";
import { convertPiSession } from "./pi-session.js";
import { buildStandaloneHTML } from "./render.js";
const PI_SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");
const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
function usage() {
    console.error(`usage: bun src/export-current.ts [--out file.html] [--open] [--source pi|claude] [--cwd dir] [--session id-or-path]

Exports the newest Pi/Claude session whose recorded cwd matches the current directory.
No devlog index is required.`);
    process.exit(1);
}
// CLI flag parsing is deliberately kept dependency-free.
function parseArgs(argv) {
    const opts = {
        cwd: process.cwd(),
        source: "auto",
        out: null,
        open: false,
        session: null,
        settleMs: 250,
    };
    const setOut = (value) => {
        opts.out = value ?? null;
        if (!opts.out) {
            usage();
        }
    };
    const stringFlags = {
        "--out": setOut,
        "-o": setOut,
        "--source": (value) => {
            if (value !== "pi" && value !== "claude" && value !== "auto") {
                usage();
            }
            opts.source = value;
        },
        "--cwd": (value) => {
            if (!value) {
                usage();
            }
            opts.cwd = resolve(value);
        },
        "--session": (value) => {
            opts.session = value ?? null;
            if (!opts.session) {
                usage();
            }
        },
        "--settle-ms": (value) => {
            opts.settleMs = Math.max(0, Number(value) || 0);
        },
    };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        const handler = flag ? stringFlags[flag] : undefined;
        if (handler) {
            handler(argv[++i]);
            continue;
        }
        if (flag === "--open") {
            opts.open = true;
        }
        else {
            usage();
        }
    }
    opts.cwd = resolve(opts.cwd);
    if (opts.out) {
        opts.out = resolve(opts.out);
    }
    return opts;
}
function sleep(ms) {
    return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
function* walkJsonl(root) {
    if (!existsSync(root)) {
        return;
    }
    let entries;
    try {
        entries = readdirSync(root);
    }
    catch {
        return;
    }
    for (const name of entries) {
        const full = join(root, name);
        let st;
        try {
            st = statSync(full);
        }
        catch {
            continue;
        }
        if (st.isDirectory()) {
            yield* walkJsonl(full);
        }
        else if (st.isFile() && full.endsWith(".jsonl")) {
            yield full;
        }
    }
}
/** Classify one JSONL header line, harvesting source/cwd/sessionId if present. */
function classifyHeaderEntry(entry) {
    if (entry.type === "session") {
        return {
            source: "pi",
            cwd: typeof entry.cwd === "string" ? entry.cwd : null,
            sessionId: typeof entry.id === "string" ? entry.id : null,
        };
    }
    if (entry.sessionId !== undefined ||
        entry.parentUuid !== undefined ||
        entry.isSidechain !== undefined) {
        return {
            source: "claude",
            cwd: typeof entry.cwd === "string" ? entry.cwd : null,
            sessionId: typeof entry.sessionId === "string" ? entry.sessionId : null,
        };
    }
    return { source: null, cwd: null, sessionId: null };
}
/** Guess the harness from the file's location when the header is silent. */
function inferSourceFromPath(path) {
    if (path.includes("/.claude/")) {
        return "claude";
    }
    if (path.includes("/.pi/")) {
        return "pi";
    }
    return null;
}
/** Pull a UUID-shaped session id out of the file basename. */
function extractSessionIdFromName(path) {
    const m = basename(path).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m?.[0] ?? null;
}
// Session JSONL headers differ across harnesses, so this has a few format branches.
function peek(path) {
    let source = null;
    let cwd = null;
    let sessionId = null;
    try {
        const lines = readFileSync(path, "utf-8").split("\n", 16);
        for (const line of lines) {
            if (!line.trim()) {
                continue;
            }
            const e = JSON.parse(line);
            const classified = classifyHeaderEntry(e);
            if (classified.source) {
                source = classified.source;
            }
            if (classified.cwd) {
                cwd = classified.cwd;
            }
            if (classified.sessionId) {
                sessionId = classified.sessionId;
            }
            if (source && cwd && sessionId) {
                break;
            }
        }
    }
    catch {
        return null;
    }
    source ??= inferSourceFromPath(path);
    if (!source) {
        return null;
    }
    sessionId ??= extractSessionIdFromName(path);
    return { source, cwd: cwd ? resolve(cwd) : null, sessionId };
}
function scanCandidates() {
    const out = [];
    for (const root of [PI_SESSIONS_DIR, CLAUDE_PROJECTS_DIR]) {
        for (const path of walkJsonl(root)) {
            const meta = peek(path);
            if (!meta) {
                continue;
            }
            try {
                out.push({ path, mtime: statSync(path).mtimeMs, ...meta });
            }
            catch {
                // ignore files that disappeared between scan and stat
            }
        }
    }
    return out;
}
function preferredSource() {
    if (process.env["PI_CODING_AGENT"] ||
        process.env["PI_AGENT_SESSION"] ||
        process.env["PI_SESSION_ID"]) {
        return "pi";
    }
    if (process.env["CLAUDECODE"] ||
        process.env["CLAUDE_CODE"] ||
        process.env["CLAUDE_SESSION_ID"] ||
        process.env["CLAUDE_PROJECT_DIR"]) {
        return "claude";
    }
    return null;
}
function findBySession(idOrPath, candidates) {
    const maybePath = resolve(idOrPath);
    if (existsSync(maybePath)) {
        const meta = peek(maybePath);
        if (!meta) {
            throw new Error(`Not a recognized Pi/Claude session JSONL: ${maybePath}`);
        }
        return { path: maybePath, mtime: statSync(maybePath).mtimeMs, ...meta };
    }
    return candidates.find((c) => c.sessionId === idOrPath || c.path.includes(idOrPath)) ?? null;
}
function chooseCurrent(candidates, opts) {
    if (opts.session) {
        return findBySession(opts.session, candidates);
    }
    const sourceHint = opts.source === "auto" ? preferredSource() : opts.source;
    const filtered = candidates.filter((c) => {
        if (opts.source !== "auto" && c.source !== opts.source) {
            return false;
        }
        return c.cwd === opts.cwd;
    });
    if (filtered.length === 0) {
        return null;
    }
    filtered.sort((a, b) => {
        const sourceDelta = Number(b.source === sourceHint) - Number(a.source === sourceHint);
        if (sourceDelta !== 0) {
            return sourceDelta;
        }
        return b.mtime - a.mtime;
    });
    return filtered[0] ?? null;
}
function convert(path, source) {
    return source === "pi" ? convertPiSession(path) : convertClaudeSession(path);
}
function slugify(s) {
    return (s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70) || "session");
}
function defaultOutPath(payload, candidate, cwd) {
    const title = slugify(payload.meta.title || basename(cwd) || "session");
    const shortId = (candidate.sessionId ?? basename(candidate.path)).slice(0, 8);
    return join(cwd, `${title}-${shortId}.html`);
}
async function openInBrowser(outPath) {
    const { spawn } = await import("node:child_process");
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    const child = spawn(opener, [outPath], {
        detached: true,
        stdio: "ignore",
        shell: process.platform === "win32",
    });
    child.on("error", () => { });
    child.unref();
}
async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.settleMs > 0) {
        await sleep(opts.settleMs);
    }
    const candidates = scanCandidates();
    const chosen = chooseCurrent(candidates, opts);
    if (!chosen) {
        const sourceNote = opts.source === "auto" ? "" : ` for source ${opts.source}`;
        throw new Error(`Could not find a Pi/Claude session${sourceNote} with cwd ${opts.cwd}. ` +
            `Pass --session /path/to/session.jsonl if this conversation is stored elsewhere.`);
    }
    const payload = convert(chosen.path, chosen.source);
    const html = buildStandaloneHTML(payload);
    const outPath = opts.out ?? defaultOutPath(payload, chosen, opts.cwd);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
    console.log(`✓ Exported ${chosen.source} session to ${outPath} (${kb} KB)`);
    console.log(`  session: ${chosen.sessionId ?? basename(chosen.path)}`);
    console.log(`  source:  ${chosen.path}`);
    if (opts.open) {
        await openInBrowser(outPath);
    }
}
try {
    await main();
}
catch (err) {
    console.error(err instanceof Error ? `error: ${err.message}` : String(err));
    process.exit(1);
}
