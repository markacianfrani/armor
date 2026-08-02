---
name: export
description: Export the current Pi or Claude Code conversation transcript to a standalone HTML file. Use whenever the user invokes this skill, says /export, asks to export/share/save the current agent session, or wants a transcript HTML without manually finding a JSONL path or installing devlog.
compatibility: Requires Node.js to generate. The exported HTML loads web components from a CDN, so viewing needs network access.
---

# Export Current Conversation

Export the active Pi or Claude Code conversation as a single portable HTML transcript.

The user experience should feel like: “export this conversation.” Do not ask them to locate a session JSONL. The bundled helper infers the transcript file by scanning raw Pi/Claude session stores and choosing the newest session whose recorded `cwd` matches the current shell directory.

## How it works

The generation scripts are self-contained; the rendered web components are not — they load from a CDN at view time:

- `scripts/export-current.js` detects the current session and writes HTML.
- `scripts/pi-session.js` and `scripts/claude-session.js` convert raw JSONL transcripts.
- `scripts/render.js` writes declarative HTML and injects the web components from a pinned CDN URL.
- `assets/session.css` is the page-level (light-DOM) stylesheet.

The transcript is emitted as readable `<ai-conversation>`, `<ai-message>`, `<ai-markdown>`, and `<ai-tool-call>` elements rather than a giant JSON blob. The `@cianfrani/ai-ui` components load from jsdelivr's CDN (`/+esm`), pinned to a version in `scripts/render.js` (`AI_UI_CDN_URL`). jsdelivr bundles the package and resolves its `lit` dependency transitively, so no import map is needed. To refresh which component version exports use, bump that version constant.

## Run

1. Resolve this skill directory path from the `read` call that loaded this file.
2. Run the bundled helper from the user's current working directory:

```bash
node /absolute/path/to/export/scripts/export-current.js
```

Then report the generated `.html` path.

Useful options:

```bash
node /absolute/path/to/export/scripts/export-current.js --open
node /absolute/path/to/export/scripts/export-current.js --out /path/to/transcript.html
node /absolute/path/to/export/scripts/export-current.js --source pi
node /absolute/path/to/export/scripts/export-current.js --source claude
node /absolute/path/to/export/scripts/export-current.js --session /path/to/session.jsonl
```

Prefer the plain command first. It writes an `.html` file in the current project directory and prints both the output path and source transcript path.

## If auto-detection fails

Only then ask one clarifying question or retry with a targeted source:

- In Pi, retry with `--source pi`.
- In Claude Code, retry with `--source claude`.
- If the user is exporting an older/different conversation, ask for a session id or JSONL path and pass it with `--session`.

Do not require devlog. The helper reads raw Pi/Claude session files directly and renders the same standalone viewer used by devlog-ui.
