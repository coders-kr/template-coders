#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function readArgs(argv) {
  const options = {
    server: "ws://localhost:8000/api/dev/ws/agent",
    name: "",
    provider: "codex",
    pair: "",
    pairingCode: "",
    project: process.cwd(),
    thread: process.env.CODEX_THREAD_ID ?? "",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (
      ["--server", "--name", "--project", "--thread", "--provider", "--pair"].includes(
        arg,
      )
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`coders-agent-bridge

Connect a local coders.kr project toolbar to an existing Codex task.

Usage:
  node scripts/coders-agent-bridge.mjs --pair <manifest-url>
  node scripts/coders-agent-bridge.mjs --thread <task-id-or-exact-name>

Options:
  --pair <url>       One-time pairing manifest copied from the /c toolbar
  --provider <name>  codex, claude, antigravity, or generic
  --thread <value>   Codex task UUID or exact task name (required)
  --project <path>   Project path shown to the agent (default: cwd)
  --name <value>     Name displayed in the toolbar (default: Codex)
  --server <url>     Agent hub WebSocket URL
  --dry-run          Acknowledge events without queueing Codex messages
`);
}

function stableAgentId(provider, thread, projectPath) {
  const digest = createHash("sha256")
    .update(`${provider}\0${os.hostname()}\0${thread}\0${path.resolve(projectPath)}`)
    .digest("hex")
    .slice(0, 16);
  return `${provider}-${digest}`;
}

function actionPrompt(action, projectPath, payload = {}) {
  const context = Object.keys(payload).length
    ? `Selection context: ${JSON.stringify(payload)}`
    : "";
  if (action === "deploy") {
    return [
      "The user clicked Deploy in the local coders.kr development toolbar.",
      `Project: ${path.resolve(projectPath)}`,
      context,
      "Treat this as a deployment request: inspect the current project, deploy it to coders.kr, verify the result, and report the live URL or any blocker.",
    ].join("\n");
  }
  return [
    "The user clicked Pick in the local coders.kr development toolbar.",
    `Project: ${path.resolve(projectPath)}`,
    context,
    payload.selector
      ? "Inspect the selected element and ask what change the user wants if it is not already clear. Do not deploy unless separately asked."
      : "Pick up this project as the active task. Inspect its current state and tell the user you are ready for the next requested change. Do not deploy unless separately asked.",
  ]
    .filter(Boolean)
    .join("\n");
}

function queueCodexMessage(thread, message) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "codex",
      ["queue", "--thread", thread, "--message", message],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `codex queue exited with ${code}`));
    });
  });
}

const options = readArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}
if (options.pair) {
  const response = await fetch(options.pair);
  if (!response.ok) {
    throw new Error(`Could not open pairing manifest (${response.status})`);
  }
  const manifest = await response.json();
  options.server = manifest.websocketUrl;
  options.pairingCode = manifest.pairingCode;
  options.provider = manifest.providerHint;
}
if (!options.name) {
  options.name = {
    codex: "Codex",
    claude: "Claude Code",
    antigravity: "Antigravity",
    generic: "AI Agent",
  }[options.provider] ?? "AI Agent";
}
if (options.provider === "codex" && !options.thread && !options.dryRun) {
  printHelp();
  throw new Error("Codex requires --thread (or CODEX_THREAD_ID)");
}
if (typeof WebSocket === "undefined") {
  throw new Error("Node.js 22 or newer is required for the built-in WebSocket client");
}

const agentId = stableAgentId(options.provider, options.thread, options.project);
let socket;
let reconnectTimer;
let heartbeatTimer;
let stopped = false;
let agentStatus = "idle";
let actionQueue = Promise.resolve();

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

async function handleAction(message) {
  const common = {
    type: "action.status",
    requestId: message.requestId,
    action: message.action,
  };
  agentStatus = "busy";
  send({ ...common, status: "received" });
  try {
    if (!options.dryRun && options.provider === "codex") {
      await queueCodexMessage(
        options.thread,
        actionPrompt(message.action, options.project, message.payload),
      );
    } else if (!options.dryRun) {
      console.log(actionPrompt(message.action, options.project, message.payload));
    }
    send({
      ...common,
      status: "queued",
      detail: options.dryRun
        ? "Dry run acknowledged."
        : options.provider === "codex"
          ? "Queued in Codex."
          : `Received by ${options.name} bridge.`,
    });
  } catch (error) {
    send({
      ...common,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    agentStatus = "idle";
  }
}

function connect() {
  socket = new WebSocket(options.server);
  socket.addEventListener("open", () => {
    console.log(`Connected ${options.name} to ${options.server}`);
    send({
      type: "agent.hello",
      agentId,
      name: options.name,
      provider: options.provider,
      pairingCode: options.pairingCode,
      threadId: options.thread,
      projectPath: path.resolve(options.project),
      capabilities: ["deploy", "pick"],
    });
    heartbeatTimer = setInterval(
      () => send({ type: "heartbeat", status: agentStatus }),
      10_000,
    );
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === "agent.ready") {
      console.log(`Agent ready: ${message.agentId}`);
    } else if (message.type === "action.requested") {
      actionQueue = actionQueue.then(() => handleAction(message));
    }
  });
  socket.addEventListener("error", () => {
    console.error(`Could not connect to ${options.server}`);
  });
  socket.addEventListener("close", () => {
    clearInterval(heartbeatTimer);
    if (!stopped) {
      console.log("Bridge disconnected; retrying in 2 seconds…");
      reconnectTimer = setTimeout(connect, 2_000);
    }
  });
}

process.on("SIGINT", () => {
  stopped = true;
  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);
  socket?.close();
  process.exit(0);
});

connect();
