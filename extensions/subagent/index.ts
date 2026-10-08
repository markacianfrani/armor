/**
 * subagent — observable Pi subagents in Herdr tabs.
 *
 * Parent side: advertises the bundled skill, renders a status widget for
 * active children, and provides `/subagent` to select one and focus its tab.
 * Child side (`PI_SUBAGENT_RUN_DIR` set by `subagent spawn`): syncs run
 * metadata with the live session and delivers messages queued by
 * `subagent send` from the run's inbox directory.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text } from "@earendil-works/pi-tui";

import type { InboxMessage, RunMetadata, RunState } from "./shared.ts";

const {
  effectiveRunState,
  inboxDir,
  isRecord,
  listRuns,
  readMetadata,
  runDisplayName,
  updateMetadata,
} = await import("./shared.ts");

const packageDir = dirname(fileURLToPath(import.meta.url));

function isInboxMessage(value: unknown): value is InboxMessage {
  if (!isRecord(value)) {
    return false;
  }
  const { delivery, message } = value;
  return typeof message === "string" && (delivery === "auto" || delivery === "followUp");
}

function displayState(metadata: RunMetadata): string {
  return effectiveRunState(metadata).padEnd(8);
}

function stateColor(state: RunState): "warning" | "success" | "error" | "muted" {
  if (state === "busy") {
    return "warning";
  }
  if (state === "idle") {
    return "success";
  }
  if (state === "error") {
    return "error";
  }
  return "muted";
}

function parseInboxFile(path: string): { message: InboxMessage } | { error: string } {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isInboxMessage(value)) {
      return { message: value };
    }
    return { error: "Invalid inbox message" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

let widgetTimer: ReturnType<typeof setInterval> | undefined;
let widgetContext: ExtensionContext | undefined;

function refreshWidget(): void {
  if (widgetContext === undefined) {
    return;
  }
  const context = widgetContext;
  const activeRuns = listRuns(context.sessionManager.getSessionId())
    .map((run) => ({ run, state: effectiveRunState(run) }))
    .filter((entry) => entry.state !== "exited");
  if (activeRuns.length === 0) {
    context.ui.setWidget("subagents", undefined);
    return;
  }

  const visible = activeRuns
    .slice(0, 5)
    .map(({ run, state }) =>
      context.ui.theme.fg(stateColor(state), `${run.name ?? run.handle}:${state}`),
    );
  if (activeRuns.length > visible.length) {
    visible.push(context.ui.theme.fg("muted", `+${activeRuns.length - visible.length}`));
  }
  context.ui.setWidget(
    "subagents",
    [context.ui.theme.fg("dim", "subagents: ") + visible.join(context.ui.theme.fg("dim", " | "))],
    { placement: "belowEditor" },
  );
}

async function selectSubagent(ctx: ExtensionCommandContext): Promise<void> {
  const { DynamicBorder, keyHint } = await import("@earendil-works/pi-coding-agent");
  const runs = listRuns(ctx.sessionManager.getSessionId()).filter(
    (run) => effectiveRunState(run) !== "exited",
  );
  if (runs.length === 0) {
    ctx.ui.notify("No active subagents spawned by this session", "info");
    return;
  }

  const items = runs.map((run) => ({
    label: `${runDisplayName(run)}  ${displayState(run)}  ${run.provider}/${run.model}  ${run.thinking}`,
    value: run.handle,
  }));
  // Cancel resolves `done` with "" so the run lookup below misses and returns.
  const selected = await ctx.ui.custom<string>((customTui, theme, _keybindings, done) => {
    const list = new SelectList(items, Math.min(items.length, 10), {
      description: (text) => theme.fg("muted", text),
      noMatch: (text) => theme.fg("warning", text),
      scrollInfo: (text) => theme.fg("dim", text),
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
    });
    list.onSelect = (item) => {
      done(item.value);
    };
    list.onCancel = () => {
      done("");
    };

    const container = new Container();
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Focus subagent")), 1, 0));
    container.addChild(list);
    container.addChild(
      new Text(
        theme.fg(
          "dim",
          `${keyHint("tui.select.confirm", "focus")}  ${keyHint("tui.select.cancel", "cancel")}`,
        ),
        1,
        0,
      ),
    );
    container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

    return {
      handleInput: (data) => {
        list.handleInput(data);
        customTui.requestRender();
      },
      invalidate: () => {
        container.invalidate();
      },
      render: (width) => container.render(width),
    };
  });
  const run = runs.find((candidate) => candidate.handle === selected);
  if (run === undefined) {
    return;
  }

  const focus = spawnSync("herdr", ["tab", "focus", run.tabId], { timeout: 5000 });
  if (focus.status !== 0) {
    const detail =
      focus.error === undefined ? `exit code ${focus.status ?? "signal"}` : focus.error.message;
    ctx.ui.notify(`Could not focus ${runDisplayName(run)}: ${detail}`, "error");
  }
}

function registerParentSide(pi: ExtensionAPI): void {
  pi.on("resources_discover", () => ({ skillPaths: [join(packageDir, "skills")] }));

  pi.registerCommand("subagent", {
    description: "Select and focus a subagent spawned by this session",
    handler: async (_args, ctx) => {
      await selectSubagent(ctx);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }
    widgetContext = ctx;
    refreshWidget();
    widgetTimer = setInterval(refreshWidget, 1000);
    widgetTimer.unref();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (widgetTimer !== undefined) {
      clearInterval(widgetTimer);
    }
    widgetTimer = undefined;
    widgetContext = undefined;
    ctx.ui.setWidget("subagents", undefined);
  });
}

function registerChildSide(pi: ExtensionAPI, runDir: string): void {
  let currentContext: ExtensionContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let processing = false;
  let sessionName: string | undefined;

  const syncSessionName = (): void => {
    const metadata = readMetadata(runDir);
    if (metadata === undefined) {
      return;
    }
    const next = `subagent ${metadata.name ?? metadata.handle}`;
    if (next === sessionName) {
      return;
    }
    pi.setSessionName(next);
    sessionName = next;
  };

  const deliverInboxMessage = (
    context: ExtensionContext,
    path: string,
    payload: InboxMessage,
  ): boolean => {
    updateMetadata(runDir, { error: undefined, state: "busy" });
    try {
      if (context.isIdle()) {
        pi.sendUserMessage(payload.message);
      } else {
        pi.sendUserMessage(payload.message, {
          deliverAs: payload.delivery === "followUp" ? "followUp" : "steer",
        });
      }
      unlinkSync(path);
    } catch (error) {
      updateMetadata(runDir, {
        error: error instanceof Error ? error.message : String(error),
        state: context.isIdle() ? "idle" : "busy",
      });
      return false;
    }
    return true;
  };

  const processInbox = (): void => {
    if (processing || currentContext === undefined) {
      return;
    }
    syncSessionName();
    const queueDir = inboxDir(runDir);
    if (!existsSync(queueDir)) {
      return;
    }
    processing = true;
    const context = currentContext;
    try {
      const names = readdirSync(queueDir)
        .filter((entry) => entry.endsWith(".json"))
        .toSorted();
      for (const name of names) {
        const path = join(queueDir, name);
        const parsed = parseInboxFile(path);
        if ("message" in parsed) {
          if (!deliverInboxMessage(context, path, parsed.message)) {
            break;
          }
        } else {
          unlinkSync(path);
          updateMetadata(runDir, { error: parsed.error, state: "error" });
        }
      }
    } finally {
      processing = false;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    currentContext = ctx;
    const metadata = readMetadata(runDir);
    if (metadata === undefined) {
      return;
    }
    updateMetadata(runDir, {
      error: undefined,
      sessionFile: ctx.sessionManager.getSessionFile() ?? metadata.sessionFile,
      state: ctx.isIdle() ? "idle" : "busy",
    });
    syncSessionName();
    if (timer === undefined) {
      timer = setInterval(processInbox, 250);
      timer.unref();
    }
    processInbox();
  });

  pi.on("agent_start", (_event, ctx) => {
    currentContext = ctx;
    updateMetadata(runDir, { error: undefined, hasStarted: true, state: "busy" });
  });

  pi.on("agent_settled", (_event, ctx) => {
    currentContext = ctx;
    if (ctx.isIdle()) {
      updateMetadata(runDir, { state: "idle" });
    }
  });

  pi.on("session_shutdown", (event) => {
    currentContext = undefined;
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    if (event.reason === "quit") {
      updateMetadata(runDir, { state: "exited" });
    }
  });
}

export default function subagentExtension(pi: ExtensionAPI): void {
  const runDir = process.env["PI_SUBAGENT_RUN_DIR"];
  if (runDir === undefined) {
    registerParentSide(pi);
    return;
  }
  registerChildSide(pi, runDir);
}
