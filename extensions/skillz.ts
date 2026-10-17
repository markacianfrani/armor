/**
 * skillz — curate and invoke Pi skills without editing their source files.
 *
 * Three upgrades over vanilla Pi skill handling:
 *
 * 1. /skillz
 *    Open a fuzzy-searchable menu of every top-level (user/project) skill and
 *    toggle it on or off. "off" hides the skill from the model's
 *    <available_skills> discovery prompt so it stops consuming context tokens,
 *    but the skill stays loaded and remains explicitly invokable via /skill:name.
 *    This is the middle ground between "always advertised" and "delete the skill".
 *
 * 2. inline /skill:name invocation
 *    Vanilla Pi only expands /skill:name at the very start of a prompt. skillz
 *    expands known markers anywhere in the prompt, including several at once:
 *
 *        Use /skill:security-audit and /skill:ego-check to review this change.
 *
 * 3. hidden-but-invokable
 *    Toggled-off skills are stripped from the model's skill advertisement but
 *    kept registered, so /skill:name (start or inline) still loads them on demand.
 *
 * Configuration lives in ~/.pi/agent/settings.json:
 *
 *   { "skillz": { "hidden": ["brave-search", "web-fetch"] } }
 *
 * Only top-level skills (installed by you, not bundled inside a Pi package) are
 * configurable. Package-bundled skills are left untouched.
 *
 * Auto-discovered from ~/.pi/agent/extensions/
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Skill,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteItem,
  AutocompleteProvider,
  Component,
  SettingItem,
} from "@earendil-works/pi-tui";

// ─── skill section replacement ───────────────────────────────────────────────

// Matches the whole <available_skills> block Pi renders into the system prompt,
// from its leading "\n\nThe following skills…" header through </available_skills>.
const SKILLS_SECTION_PATTERN =
  /\n\nThe following skills provide specialized instructions for specific tasks\.[\s\S]*?<\/available_skills>/;

async function replaceSkillsSection(
  systemPrompt: string,
  skills: Skill[],
): Promise<string | undefined> {
  const { formatSkillsForPrompt } = await import("@earendil-works/pi-coding-agent");
  const next = systemPrompt.replace(SKILLS_SECTION_PATTERN, formatSkillsForPrompt(skills));
  return next === systemPrompt ? undefined : next;
}

// ─── skill helpers ───────────────────────────────────────────────────────────

interface SkillCommandInfo {
  name: string;
  path: string;
  baseDir: string;
}

interface CommandLike {
  name: string;
  source: string;
  sourceInfo: { path: string; baseDir?: string };
}

function isTopLevelSkill(skill: { sourceInfo: { origin: string } }): boolean {
  return skill.sourceInfo.origin === "top-level";
}

function sourceInfoToSkill(command: CommandLike): SkillCommandInfo | null {
  if (!command.name.startsWith("skill:")) {
    return null;
  }
  const name = command.name.slice("skill:".length);
  if (name === "") {
    return null;
  }
  return {
    baseDir: command.sourceInfo.baseDir ?? dirname(command.sourceInfo.path),
    name,
    path: command.sourceInfo.path,
  };
}

function stripFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "");
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(normalized);
  return match === null ? normalized : normalized.slice(match[0].length);
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

async function readSkillBlock(skill: SkillCommandInfo): Promise<string> {
  const content = await readFile(skill.path, "utf8");
  const body = stripFrontmatter(content).trim();
  return `<skill name="${escapeAttribute(skill.name)}" location="${escapeAttribute(skill.path)}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

// ─── config (global only for now) ────────────────────────────────────────────

const SKILLZ_SETTINGS_KEY = "skillz";

interface PiSettingsDocument {
  skillz?: { hidden?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

function globalSettingsPath(): string {
  return join(homedir(), ".pi", "agent", "settings.json");
}

function isSettingsDocument(value: unknown): value is PiSettingsDocument {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnoentError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readSettingsDocument(path: string): Promise<PiSettingsDocument> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isSettingsDocument(parsed) ? parsed : {};
  } catch (error) {
    if (isEnoentError(error)) {
      return {};
    }
    throw error;
  }
}

async function readHiddenSkills(): Promise<Set<string>> {
  const doc = await readSettingsDocument(globalSettingsPath());
  const hidden = doc[SKILLZ_SETTINGS_KEY]?.hidden;
  if (!Array.isArray(hidden)) {
    return new Set();
  }
  return new Set(
    hidden.filter((name): name is string => typeof name === "string" && name.length > 0),
  );
}

async function writeHiddenSkills(hidden: Iterable<string>): Promise<void> {
  const path = globalSettingsPath();
  const doc = await readSettingsDocument(path);

  const list = [
    ...new Set([...hidden].map((name) => name.trim()).filter((name) => name.length > 0)),
  ].toSorted();

  const settings = { ...doc[SKILLZ_SETTINGS_KEY] };
  if (list.length === 0) {
    delete settings.hidden;
  } else {
    settings.hidden = list;
  }

  if (Object.keys(settings).length === 0) {
    delete doc[SKILLZ_SETTINGS_KEY];
  } else {
    doc[SKILLZ_SETTINGS_KEY] = settings;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

// ─── inline invocation ───────────────────────────────────────────────────────

// /skill:name where name is lowercase alphanumerics + hyphens, not starting or
// ending with a hyphen. A preceding non-word/non-slash character (or start of
// string) avoids matching inside URLs or other slash tokens.
const SKILL_INVOCATION_PATTERN =
  /(^|[^\w/-])\/skill:([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)(?=$|[^a-z0-9-])/g;

function getSkillsByName(pi: ExtensionAPI): Map<string, SkillCommandInfo> {
  const result = new Map<string, SkillCommandInfo>();
  for (const command of pi.getCommands()) {
    if (command.source === "skill") {
      const skill = sourceInfoToSkill(command);
      if (skill !== null) {
        result.set(skill.name, skill);
      }
    }
  }
  return result;
}

// Shared lazy snapshot of loaded skills for the autocomplete provider.
let skillEntriesCache: Map<string, { name: string; description: string }> | undefined;

function findInvocations(text: string): { name: string }[] {
  const result: { name: string }[] = [];
  const pattern = new RegExp(SKILL_INVOCATION_PATTERN.source, "g");
  for (const match of text.matchAll(pattern)) {
    result.push({ name: match[2] });
  }
  return result;
}

function normalizeBlankLines(text: string): string {
  return text.replaceAll(/\n{4,}/g, "\n\n\n").trim();
}

// Every loaded skill command, keyed by skill name. Used by both the inline
// invocation expander and the autocomplete provider.
function loadedSkillEntries(pi: ExtensionAPI): Map<string, { name: string; description: string }> {
  const result = new Map<string, { name: string; description: string }>();
  for (const command of pi.getCommands()) {
    if (command.source === "skill") {
      const skill = sourceInfoToSkill(command);
      if (skill !== null) {
        result.set(skill.name, { description: command.description ?? "", name: skill.name });
      }
    }
  }
  return result;
}

// ─── inline /skill: autocomplete ─────────────────────────────────────────────

// A /skill:<partial> token ending at the cursor, anywhere in the line. The
// partial is optional so bare "/skill:" + Tab lists every loaded skill.
// Vanilla Pi only autocompletes slash commands at the start of the prompt, so
// without this there is no affordance for mid-prompt /skill: markers.
const INLINE_SKILL_PREFIX_PATTERN = /(^|\W)\/skill:(?<partial>[a-z0-9][a-z0-9-]*)?$/;

function createSkillAutocompleteProvider(
  current: AutocompleteProvider,
  getSkills: () => Map<string, { name: string; description: string }>,
): AutocompleteProvider {
  return {
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      if (!prefix.startsWith("/skill:")) {
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      }

      // Replace `/skill:<partial>` with `/skill:<name> ` and leave any text
      // after the cursor intact. The trailing space lets the user keep typing.
      const currentLine = lines[cursorLine] ?? "";
      const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
      const afterCursor = currentLine.slice(cursorCol);
      const replacement = `/skill:${item.value} `;
      const newLine = beforePrefix + replacement + afterCursor;
      const newLines = [...lines];
      newLines[cursorLine] = newLine;
      return {
        cursorCol: beforePrefix.length + replacement.length,
        cursorLine,
        lines: newLines,
      };
    },

    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const match = INLINE_SKILL_PREFIX_PATTERN.exec(beforeCursor);
      if (match === null) {
        const fallback = await current.getSuggestions(lines, cursorLine, cursorCol, options);
        return fallback;
      }

      // Group 1 is the leading non-word char (or start of string); the named
      // `partial` group is the partial skill name. `prefix` is exactly the text
      // to replace, so include the "/skill:" handle plus the partial.
      const partial = match.groups?.["partial"] ?? "";
      const prefix = `/skill:${partial}`;

      const skills = [...getSkills().values()].toSorted((left, right) =>
        left.name.localeCompare(right.name),
      );
      const items: AutocompleteItem[] = skills
        .filter((skill) => skill.name.startsWith(partial))
        .map((skill) => ({
          description: skill.description || undefined,
          label: skill.name,
          value: skill.name,
        }));

      return { items, prefix };
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

// ─── panel layout ────────────────────────────────────────────────────────────

// The /skillz menu renders in the editor slot, which Pi does not clip. An
// oversized panel pushes past the viewport and scrolls its top — including the
// list cursor — off screen. Budget the panel against the terminal height and
// clamp every description to a fixed number of lines so the panel never grows
// or shifts as the cursor moves.

/** Rows kept free for the footer/status line and breathing room. */
const PANEL_RESERVED_ROWS = 5;

/** Header + the spacer under it. */
const PANEL_HEADER_ROWS = 2;

/** SettingsList chrome: search input + spacer, scroll indicator, description
 * spacer, and the hint spacer + hint line. */
const PANEL_LIST_CHROME_ROWS = 6;

/** Most skill rows shown at once. */
const PANEL_MAX_VISIBLE_SKILLS = 10;

/** Most description lines shown, even on a tall terminal. */
const PANEL_MAX_DESCRIPTION_LINES = 4;

interface PanelLayout {
  descriptionLines: number;
  listHeight: number;
}

function panelLayout(terminalRows: number, skillCount: number): PanelLayout {
  const fixedRows = PANEL_RESERVED_ROWS + PANEL_HEADER_ROWS + PANEL_LIST_CHROME_ROWS;
  const listHeight = Math.max(
    3,
    Math.min(skillCount, PANEL_MAX_VISIBLE_SKILLS, terminalRows - fixedRows),
  );
  const descriptionLines = Math.max(
    0,
    Math.min(PANEL_MAX_DESCRIPTION_LINES, terminalRows - fixedRows - listHeight),
  );
  return { descriptionLines, listHeight };
}

// ─── full-description view ───────────────────────────────────────────────────

/** A scrollable, read-only view of one skill's full description. */
class DescriptionDetailView implements Component {
  private readonly theme: Theme;
  private readonly height: number;
  private readonly wrap: (text: string, width: number) => string[];
  private readonly truncate: (text: string, width: number) => string;
  private description = "";
  private scroll = 0;
  private title = "";

  constructor(
    theme: Theme,
    height: number,
    wrap: (text: string, width: number) => string[],
    truncate: (text: string, width: number) => string,
  ) {
    this.theme = theme;
    this.height = height;
    this.wrap = wrap;
    this.truncate = truncate;
  }

  open(title: string, description: string): void {
    this.title = title;
    this.description = description;
    this.scroll = 0;
  }

  scrollBy(delta: number): void {
    this.scroll = Math.max(0, this.scroll + delta);
  }

  render(width: number): string[] {
    const wrapped = this.wrap(
      this.description.trim() || "No skill description provided.",
      Math.max(1, width - 4),
    );
    const maxScroll = Math.max(0, wrapped.length - this.height);
    this.scroll = Math.min(this.scroll, maxScroll);
    const window = wrapped.slice(this.scroll, this.scroll + this.height);
    const position =
      maxScroll > 0 ? ` · ${this.scroll + 1}-${this.scroll + window.length}/${wrapped.length}` : "";
    const lines = [
      this.truncate(this.theme.bold(this.theme.fg("accent", this.title)), width),
      "",
      ...window.map((line) => this.theme.fg("dim", `  ${line}`)),
      // Pad so the hint stays anchored to the bottom.
      ...Array.from({ length: this.height - window.length }, () => ""),
      "",
      this.truncate(this.theme.fg("dim", `  ↑/↓ scroll · Esc back to list${position}`), width),
    ];
    return lines.map((line) => this.truncate(line, width));
  }

  invalidate(): void {
    // Nothing cached.
  }
}

// ─── /skillz menu ────────────────────────────────────────────────────────────

/** Called when the menu closes: commit the selection, then run `close`. */
type SkillzMenuCommit = (next: Set<string>, close: () => void) => void;

async function showSkillzMenu(
  ctx: ExtensionCommandContext,
  skills: LoadedSkillInfo[],
  hiddenBefore: Set<string>,
  commit: SkillzMenuCommit,
): Promise<void> {
  const { getSettingsListTheme } = await import("@earendil-works/pi-coding-agent");
  const { getKeybindings, matchesKey, SettingsList, truncateToWidth, wrapTextWithAnsi } =
    await import("@earendil-works/pi-tui");

  // Wrap `text` to at most `maxLines` rows at `width`, ellipsizing a truncated
  // final line and blank-padding short text so the result always renders as
  // exactly `maxLines` rows.
  const clampDescription = (text: string, width: number, maxLines: number): string => {
    if (maxLines <= 0) {
      return "";
    }
    const wrapped = wrapTextWithAnsi(text.trim(), Math.max(1, width));
    if (wrapped.length <= maxLines) {
      const padding = Array.from({ length: maxLines - wrapped.length }, () => "");
      return [...wrapped, ...padding].join("\n");
    }
    const kept = wrapped.slice(0, maxLines);
    kept[maxLines - 1] =
      `${truncateToWidth(kept[maxLines - 1] ?? "", Math.max(1, width - 1), "")}…`;
    return kept.join("\n");
  };

  // SettingsList renders the selected description *below* the list, so a long
  // description used to push the panel past the viewport. Re-clamp (and pad)
  // every description to the same line budget before each render; the panel
  // height then stays constant as the cursor moves.
  const clampItemDescriptions = (
    items: SettingItem[],
    descriptions: string[],
    width: number,
    maxLines: number,
  ): void => {
    for (const [index, item] of items.entries()) {
      item.description = clampDescription(descriptions[index] ?? "", width - 4, maxLines);
    }
  };

  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const current = new Set(hiddenBefore);

    const items: SettingItem[] = skills.map((skill) => ({
      currentValue: current.has(skill.name) ? "off" : "on",
      description: skill.description || "No skill description provided.",
      id: skill.name,
      label: skill.name,
      values: ["on", "off"],
    }));

    // Keep the source descriptions so each render can re-clamp them for the
    // current width without losing the untruncated text.
    const descriptions = items.map((item) => item.description ?? "");
    const descriptionById = new Map(
      items.map((item, index) => [item.id, descriptions[index] ?? ""]),
    );
    const { descriptionLines, listHeight } = panelLayout(tui.terminal.rows, items.length);

    const header = theme.bold(theme.fg("accent", "skillz"));

    // SettingsList exposes no "currently selected" accessor, so observe the
    // theme callback it invokes for every visible row and remember the one it
    // flags as selected. ctrl+o opens the detail view for that skill.
    let selectedId: string | undefined;
    const baseTheme = getSettingsListTheme();
    const listTheme = {
      ...baseTheme,
      label: (text: string, selected: boolean) => {
        if (selected) {
          selectedId = text.trimEnd();
        }
        return baseTheme.label(text, selected);
      },
    };

    const list = new SettingsList(
      items,
      listHeight,
      listTheme,
      (id, newValue) => {
        if (newValue === "off") {
          current.add(id);
        } else {
          current.delete(id);
        }
        list.updateValue(id, newValue);
      },
      () => {
        commit(current, () => {
          done();
        });
      },
      { enableSearch: true },
    );

    // Full-description view, opened with ctrl+o on the selected skill.
    let detail = false;
    const detailHeight = Math.max(1, tui.terminal.rows - PANEL_RESERVED_ROWS - 4);
    const detailView = new DescriptionDetailView(
      theme,
      detailHeight,
      (text, maxWidth) => wrapTextWithAnsi(text, maxWidth),
      (text, maxWidth) => truncateToWidth(text, maxWidth),
    );

    const component: Component = {
      handleInput: (data: string) => {
        const keybindings = getKeybindings();
        if (detail) {
          if (
            matchesKey(data, "ctrl+o") ||
            keybindings.matches(data, "tui.select.cancel") ||
            keybindings.matches(data, "tui.select.confirm")
          ) {
            detail = false;
          } else if (keybindings.matches(data, "tui.select.up")) {
            detailView.scrollBy(-1);
          } else if (keybindings.matches(data, "tui.select.down")) {
            detailView.scrollBy(1);
          } else if (keybindings.matches(data, "tui.select.pageUp")) {
            detailView.scrollBy(-detailHeight);
          } else if (keybindings.matches(data, "tui.select.pageDown")) {
            detailView.scrollBy(detailHeight);
          }
          tui.requestRender();
          return;
        }
        if (matchesKey(data, "ctrl+o") && selectedId !== undefined) {
          detailView.open(selectedId, descriptionById.get(selectedId) ?? "");
          detail = true;
          tui.requestRender();
          return;
        }
        list.handleInput(data);
        tui.requestRender();
      },
      invalidate: () => {
        list.invalidate();
      },
      render: (width: number) => {
        if (detail) {
          return detailView.render(width);
        }
        // Recomputed every render; SettingsList flags the selected row through
        // the wrapped theme callback above.
        selectedId = undefined;
        clampItemDescriptions(items, descriptions, width, descriptionLines);
        // SettingsList always ends its output with a blank spacer and its hint
        // line; swap that hint for ours so the footer advertises ctrl+o.
        const rendered = list.render(width);
        rendered[rendered.length - 1] = theme.fg(
          "dim",
          "  Type to search · Enter/Space to change · ctrl+o detail · Esc to cancel",
        );
        // Header, spacer, then the list.
        const lines = [truncateToWidth(header, width), "", ...rendered];
        return lines.map((line) => truncateToWidth(line, width));
      },
    };

    return component;
  });
}

// ─── extension ───────────────────────────────────────────────────────────────

function skillz(pi: ExtensionAPI) {
  // In-memory cache of hidden skill names, refreshed on session start and on
  // every /skillz toggle so before_agent_start sees the latest state.
  let hidden = new Set<string>();

  pi.on("session_start", async (_event, ctx) => {
    try {
      hidden = await readHiddenSkills();
    } catch {
      hidden = new Set();
    }
    // Register autocomplete for inline /skill: markers. The factory wraps the
    // existing provider so native slash-command and file completion survive.
    skillEntriesCache = loadedSkillEntries(pi);
    ctx.ui.addAutocompleteProvider((current) =>
      createSkillAutocompleteProvider(current, () => skillEntriesCache ?? loadedSkillEntries(pi)),
    );
  });

  // Hide toggled-off skills from the model's <available_skills> advertisement
  // while keeping them loaded (so /skill:name still works).
  pi.on("before_agent_start", (event) =>
    hideHiddenSkills(event.systemPrompt, event.systemPromptOptions, hidden),
  );

  // Expand /skill:name markers anywhere in the prompt (not just the start).
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension" || !event.text.includes("/skill:")) {
      return { action: "continue" };
    }

    const skillsByName = getSkillsByName(pi);
    const invocations = findInvocations(event.text);
    if (invocations.length === 0) {
      return { action: "continue" };
    }

    const unknown = invocations.filter((invocation) => !skillsByName.has(invocation.name));
    if (unknown.length > 0) {
      ctx.ui.notify(
        `Unknown skill invocation(s): ${[...new Set(unknown.map((invocation) => invocation.name))].join(", ")}`,
        "warning",
      );
    }

    const uniqueSkills = new Map<string, SkillCommandInfo>();
    for (const invocation of invocations) {
      const skill = skillsByName.get(invocation.name);
      if (skill !== undefined) {
        uniqueSkills.set(invocation.name, skill);
      }
    }

    const blocks = new Map<string, string>();
    await Promise.all(
      [...uniqueSkills].map(async ([name, skill]) => {
        try {
          blocks.set(name, await readSkillBlock(skill));
        } catch (error) {
          ctx.ui.notify(
            `Failed to read skill ${name}: ${error instanceof Error ? error.message : String(error)}`,
            "warning",
          );
        }
      }),
    );

    if (blocks.size === 0) {
      return { action: "continue" };
    }

    const expanded = event.text.replace(
      SKILL_INVOCATION_PATTERN,
      (fullMatch: string, prefix: string, name: string) => {
        const block = blocks.get(name);
        return block !== undefined ? `${prefix}\n\n${block}\n\n` : fullMatch;
      },
    );

    return { action: "transform", images: event.images, text: normalizeBlankLines(expanded) };
  });

  // /skillz — fuzzy-searchable visibility menu.
  pi.registerCommand("skillz", {
    description: "Enable/disable skills (hide from the model, keep invokable).",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/skillz requires the interactive TUI", "warning");
        return;
      }

      const skills = listConfigurableSkills(pi);
      if (skills.length === 0) {
        ctx.ui.notify("No configurable skills are loaded.", "info");
        return;
      }

      const previous = new Set(hidden);
      await showSkillzMenu(ctx, skills, previous, (next, close) => {
        // Esc / cancel: commit the final selection and close. Skip the disk
        // write when nothing actually changed.
        const changed = !setsEqual(next, previous);
        hidden = new Set(next);
        if (changed) {
          void persistHidden(next, ctx.ui.notify.bind(ctx.ui)).finally(close);
        } else {
          close();
        }
      });
    },
  });
}

async function hideHiddenSkills(
  systemPrompt: string,
  options: { skills: Skill[] },
  hidden: Set<string>,
): Promise<{ systemPrompt: string } | undefined> {
  const { skills } = options;
  const anyHidden = skills.some((skill) => isTopLevelSkill(skill) && hidden.has(skill.name));
  if (!anyHidden) {
    return undefined;
  }

  const updated: Skill[] = [];
  for (const skill of skills) {
    if (isTopLevelSkill(skill) && hidden.has(skill.name)) {
      updated.push({ ...skill, disableModelInvocation: true });
    } else {
      updated.push(skill);
    }
  }

  // Reflect the flags back into the mutable options so later handlers and any
  // re-render see the same hidden state, then force the re-rendered prompt.
  options.skills = updated;
  const replaced = await replaceSkillsSection(systemPrompt, updated);
  if (replaced === undefined) {
    return undefined;
  }
  return { systemPrompt: replaced };
}

async function persistHidden(
  next: Set<string>,
  notify: (message: string, type?: "info" | "warning" | "error") => void,
): Promise<void> {
  try {
    await writeHiddenSkills(next);
    const count = next.size;
    notify(
      count === 0
        ? "All skills visible to the model."
        : `${count} skill${count === 1 ? "" : "s"} hidden from the model.`,
      "info",
    );
  } catch (error) {
    notify(
      `Failed to save skill visibility: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

interface LoadedSkillInfo {
  name: string;
  description: string;
}

function listConfigurableSkills(pi: ExtensionAPI): LoadedSkillInfo[] {
  return [...loadedSkillEntries(pi).values()].toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export { readHiddenSkills, writeHiddenSkills };
export default skillz;
