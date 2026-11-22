import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

const HERDR_COMMAND_TIMEOUT_MS = 10_000;
const GUI_TAB_LABEL = "fork";

type HerdrDestination = "pane" | "tab";
/** Which Herdr is hosting this Pi: the terminal multiplexer TUI or the desktop app. */
type HerdrHost = "tui" | "gui";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\\''`)}'`;
}

function findPaneId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const paneId = findPaneId(item);
      if (paneId !== undefined) {
        return paneId;
      }
    }
    return undefined;
  }

  const paneId: unknown = Reflect.get(value, "pane_id");
  if (typeof paneId === "string" && paneId.length > 0) {
    return paneId;
  }

  for (const child of Object.values(value)) {
    const childPaneId = findPaneId(child);
    if (childPaneId !== undefined) {
      return childPaneId;
    }
  }

  return undefined;
}

async function runJsonCommand(
  pi: ExtensionAPI,
  command: string,
  args: string[],
  cwd: string,
): Promise<unknown> {
  const result = await pi.exec(command, args, {
    cwd,
    timeout: HERDR_COMMAND_TIMEOUT_MS,
  });

  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
    throw new Error(detail);
  }

  if (!result.stdout.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error(`${command} returned invalid JSON: ${result.stdout.trim()}`);
  }
}

function runHerdr(pi: ExtensionAPI, args: string[], cwd: string): Promise<unknown> {
  return runJsonCommand(pi, "herdr", args, cwd);
}

function readField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function readId(value: unknown, key: string): string | undefined {
  const field = readField(value, key);
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function readList(value: unknown, key: string): unknown[] {
  const field = readField(value, key);
  return Array.isArray(field) ? field : [];
}

function getHerdrPaneId(): string | undefined {
  const paneId = process.env["HERDR_PANE_ID"]?.trim();
  return paneId !== undefined && paneId.length > 0 ? paneId : undefined;
}

function getCoreTerminalId(): string | undefined {
  const terminalId = process.env["HC_TERMINAL_ID"]?.trim();
  return terminalId !== undefined && terminalId.length > 0 ? terminalId : undefined;
}

/**
 * The two Herdr hosts inject different caller context and run on different
 * servers, so the same `/fork` has to be answered by a different tool:
 *
 * - Herdr TUI pane: `HERDR_ENV=1` + `HERDR_PANE_ID`, driven by `herdr` and its
 *   workspace/tab/pane IDs.
 * - Herdr desktop app terminal: `HC_TERMINAL_ID` (a herdr-core terminal
 *   address, not a pane ID), driven by `herdr-app do …`, which is exactly what
 *   the app's Cmd+T / split shortcuts dispatch.
 *
 * Prefer the innermost Herdr when both are present, e.g. a TUI attach started
 * from a desktop-app terminal.
 */
function detectHerdrHost(): HerdrHost | undefined {
  if (process.env["HERDR_ENV"] === "1" && getHerdrPaneId() !== undefined) {
    return "tui";
  }
  if (getCoreTerminalId() !== undefined) {
    return "gui";
  }
  return undefined;
}

function getSessionFile(ctx: ExtensionContext): string {
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (sessionFile === undefined) {
    throw new Error("The current Pi session is ephemeral, so it cannot be forked.");
  }
  return sessionFile;
}

async function forkIntoHerdrTui(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  destination: HerdrDestination,
  sessionFile: string,
): Promise<string> {
  const currentPaneId = getHerdrPaneId();
  if (currentPaneId === undefined) {
    throw new Error("Herdr did not tell Pi which pane it is running in.");
  }

  let targetPaneId: string | undefined;
  if (destination === "pane") {
    const split = await runHerdr(
      pi,
      ["pane", "split", "--pane", currentPaneId, "--direction", "right", "--no-focus"],
      ctx.cwd,
    );
    targetPaneId = findPaneId(split);
  } else {
    const tab = await runHerdr(
      pi,
      ["tab", "create", "--cwd", ctx.cwd, "--label", "fork", "--no-focus"],
      ctx.cwd,
    );
    targetPaneId = findPaneId(tab);
  }

  if (targetPaneId === undefined) {
    throw new Error(`Herdr did not return the new ${destination} pane id.`);
  }

  await runHerdr(
    pi,
    ["pane", "run", targetPaneId, `pi --fork ${shellQuote(sessionFile)}`],
    ctx.cwd,
  );

  return targetPaneId;
}

interface GuiLocation {
  paneId: string;
  spaceId: string;
}

/**
 * `HC_TERMINAL_ID` is a terminal address, not a pane or tab id, so resolve the
 * pane and space hosting this terminal. Doing that instead of relying on the
 * app's focused pane keeps the fork attached to this Pi's own tab even when the
 * person is looking somewhere else.
 */
async function locateGuiTerminal(pi: ExtensionAPI, cwd: string): Promise<GuiLocation> {
  const terminalId = getCoreTerminalId();
  if (terminalId === undefined) {
    throw new Error("Herdr did not tell Pi which terminal it is running in.");
  }

  const listing = await runJsonCommand(pi, "herdr-app", ["ls"], cwd);
  const spaces = readField(listing, "spaces");
  if (!Array.isArray(spaces)) {
    throw new TypeError("herdr-app ls returned no spaces. Is the Herdr window open?");
  }

  for (const space of spaces) {
    for (const tab of readList(space, "tabs")) {
      for (const terminal of readList(tab, "terminals")) {
        if (readId(terminal, "terminal") === terminalId) {
          const paneId = readId(terminal, "pane");
          const spaceId = readId(space, "id");
          if (paneId === undefined || spaceId === undefined) {
            throw new Error("herdr-app ls did not report the pane hosting this terminal.");
          }
          return { paneId, spaceId };
        }
      }
    }
  }

  throw new Error(`The Herdr window is not showing terminal ${terminalId}.`);
}

async function forkIntoHerdrGui(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  destination: HerdrDestination,
  sessionFile: string,
): Promise<string> {
  const location = await locateGuiTerminal(pi, ctx.cwd);
  // The desktop app execs argv in the new terminal instead of typing a command
  // line into a shell, so arguments need no shell quoting.
  const argv = ["pi", "--fork", sessionFile];

  if (destination === "pane") {
    const split = await runJsonCommand(
      pi,
      "herdr-app",
      ["do", "pane.split", JSON.stringify({ argv, direction: "right", pane: location.paneId })],
      ctx.cwd,
    );

    // A split can take the focus; hold this pane in front the way the TUI path
    // passes --no-focus.
    await runJsonCommand(
      pi,
      "herdr-app",
      ["do", "pane.focus", JSON.stringify({ pane: location.paneId })],
      ctx.cwd,
    );

    return readId(split, "pane") ?? location.paneId;
  }

  // focus false appends the tab and keeps the shown one, matching the TUI
  // path's --no-focus; pane.split has no focus argument, hence the pane.focus
  // call above instead.
  const tab = await runJsonCommand(
    pi,
    "herdr-app",
    [
      "do",
      "tab.new",
      JSON.stringify({
        argv,
        focus: false,
        folder: ctx.cwd,
        name: GUI_TAB_LABEL,
        space: location.spaceId,
      }),
    ],
    ctx.cwd,
  );

  return readId(tab, "tab") ?? location.spaceId;
}

async function forkIntoHerdr(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  destination: HerdrDestination,
): Promise<string> {
  const sessionFile = getSessionFile(ctx);
  const host = detectHerdrHost();

  if (host === undefined) {
    throw new Error(
      "/fork pane and /fork tab need Pi running inside Herdr (a TUI pane or a desktop app terminal).",
    );
  }

  const target =
    host === "tui"
      ? await forkIntoHerdrTui(pi, ctx, destination, sessionFile)
      : await forkIntoHerdrGui(pi, ctx, destination, sessionFile);

  return target;
}

const FORK_ARGUMENTS = [
  { description: "Fork this Pi session into a split pane", label: "pane", value: "pane" },
  { description: "Fork this Pi session into a new tab", label: "tab", value: "tab" },
] as const;

function createForkAutocompleteProvider(current: AutocompleteProvider): AutocompleteProvider {
  return {
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);

      // Argument completion after "/fork ".
      const match = /^\/fork\s+(\S*)$/.exec(beforeCursor);
      if (match !== null) {
        const [, query] = match;
        const items = FORK_ARGUMENTS.filter((argument) =>
          argument.value.startsWith(query.toLowerCase()),
        );
        if (items.length > 0) {
          return { items, prefix: query };
        }
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      // Inject full "/fork pane" and "/fork tab" entries into the slash
      // command menu itself (e.g. while typing "/f"), so the Herdr options
      // are discoverable before any completion happens.
      const fragment = /^\/(\S*)$/.exec(beforeCursor);
      if (fragment !== null) {
        const builtIn = await current.getSuggestions(lines, cursorLine, cursorCol, options);
        if (builtIn === null || builtIn.prefix === "" || !builtIn.prefix.startsWith("/")) {
          return builtIn;
        }
        const extra = FORK_ARGUMENTS.map((argument) => ({
          description: argument.description,
          label: `fork ${argument.value}`,
          value: `fork ${argument.value}`,
        })).filter((item) => item.value.startsWith(fragment[1]));
        if (extra.length === 0) {
          return builtIn;
        }
        // Keep the native `fork` entry on top (it wins default selection via
        // the first-prefix-match rule) with the Herdr options directly below
        // it, so everything relevant is visible while nothing shadows native
        // behavior at any prefix length.
        const forkItem = builtIn.items.find((entry) => entry.value === "fork");
        const items =
          forkItem !== undefined
            ? [forkItem, ...extra, ...builtIn.items.filter((entry) => entry !== forkItem)]
            : [...extra, ...builtIn.items];
        return { items, prefix: builtIn.prefix };
      }

      return current.getSuggestions(lines, cursorLine, cursorCol, options);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

function forkHerdrExtension(pi: ExtensionAPI): void {
  const forkModePattern = /^\/fork\s+(pane|tab)$/;

  pi.on("input", async (event, ctx) => {
    // Leave bare `/fork` entirely alone: Pi's native command handles it.
    const match = forkModePattern.exec(event.text.trim());
    if (match === null) {
      return { action: "continue" };
    }

    const destination: HerdrDestination = match[1] === "pane" ? "pane" : "tab";
    try {
      const target = await forkIntoHerdr(pi, ctx, destination);
      ctx.ui.notify(`Forked Pi session into Herdr ${destination} (${target})`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Could not fork into Herdr ${destination}: ${message}`, "error");
    }

    return { action: "handled" };
  });

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider(createForkAutocompleteProvider);
  });
}

export default forkHerdrExtension;
