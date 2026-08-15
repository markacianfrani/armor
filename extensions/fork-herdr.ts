import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

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
}

export default forkHerdrExtension;
