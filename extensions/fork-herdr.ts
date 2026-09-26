import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const HERDR_COMMAND_TIMEOUT_MS = 10_000;

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

async function runHerdr(pi: ExtensionAPI, args: string[], cwd: string): Promise<unknown> {
  const result = await pi.exec("herdr", args, {
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
    throw new Error(`Herdr returned invalid JSON: ${result.stdout.trim()}`);
  }
}

function getHerdrPaneId(): string | undefined {
  const paneId = process.env["HERDR_PANE_ID"]?.trim();
  return paneId !== undefined && paneId.length > 0 ? paneId : undefined;
}

async function forkIntoHerdr(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  destination: "pane" | "tab",
): Promise<string> {
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (sessionFile === undefined) {
    throw new Error("The current Pi session is ephemeral, so it cannot be forked.");
  }

  const currentPaneId = getHerdrPaneId();
  if (process.env["HERDR_ENV"] !== "1" || currentPaneId === undefined) {
    throw new Error("/fork pane and /fork tab require Pi to be running inside Herdr.");
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

const FORK_ARGUMENTS = [
  { value: "pane", label: "pane", description: "Fork this Pi session into a split pane" },
  { value: "tab", label: "tab", description: "Fork this Pi session into a new tab" },
] as const;

function createForkAutocompleteProvider(current: AutocompleteProvider): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);

      // Argument completion after "/fork ".
      const match = beforeCursor.match(/^\/fork\s+(\S*)$/);
      if (match !== null) {
        const query = match[1];
        const items = FORK_ARGUMENTS.filter((argument) => argument.value.startsWith(query.toLowerCase()))
          .map((argument) => ({ ...argument }));
        if (items.length > 0) {
          return { prefix: query, items };
        }
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      // Inject full "/fork pane" and "/fork tab" entries into the slash
      // command menu itself (e.g. while typing "/f"), so the Herdr options
      // are discoverable before any completion happens.
      const fragment = beforeCursor.match(/^\/(\S*)$/);
      if (fragment !== null) {
        const builtIn = await current.getSuggestions(lines, cursorLine, cursorCol, options);
        if (builtIn === null || builtIn.prefix === "" || !builtIn.prefix.startsWith("/")) {
          return builtIn;
        }
        const extra = FORK_ARGUMENTS
          .map((argument) => ({
            value: `fork ${argument.value}`,
            label: `fork ${argument.value}`,
            description: argument.description,
          }))
          .filter((item) => item.value.startsWith(fragment[1]));
        if (extra.length === 0) {
          return builtIn;
        }
        // Keep the native `fork` entry on top (it wins default selection via
        // the first-prefix-match rule) with the Herdr options directly below
        // it, so everything relevant is visible while nothing shadows native
        // behavior at any prefix length.
        const forkItem = builtIn.items.find((i) => i.value === "fork");
        const items = forkItem !== undefined
          ? [forkItem, ...extra, ...builtIn.items.filter((i) => i !== forkItem)]
          : [...extra, ...builtIn.items];
        return { prefix: builtIn.prefix, items };
      }

      return current.getSuggestions(lines, cursorLine, cursorCol, options);
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
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

    const destination = match[1] === "pane" ? "pane" : "tab";
    try {
      const paneId = await forkIntoHerdr(pi, ctx, destination);
      ctx.ui.notify(`Forked Pi session into Herdr ${destination} (${paneId})`, "info");
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
