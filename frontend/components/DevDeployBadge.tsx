"use client";

import {
  Check,
  Clipboard,
  CloudUpload,
  Copy,
  LoaderCircle,
  MousePointer2,
  Orbit,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Provider = "codex" | "claude" | "antigravity" | "generic";
type ActionName = "deploy" | "pick";
type ActionStatus =
  | "idle"
  | "sending"
  | "sent"
  | "received"
  | "queued"
  | "no_agent"
  | "failed";

type Agent = {
  id: string;
  name: string;
  provider: Provider;
  threadId: string;
  projectPath: string;
  capabilities: ActionName[];
  status: "idle" | "busy" | "offline";
  lastSeenAt: string;
};

type Pairing = {
  code: string;
  provider: Provider;
  manifestUrl: string;
  prompt: string;
  expiresAt: string;
};

type ActionState = {
  requestId?: string;
  status: ActionStatus;
  detail?: string;
};

const providers: Array<{ id: Provider; name: string; hint: string }> = [
  { id: "codex", name: "Codex", hint: "Concise Markdown" },
  { id: "claude", name: "Claude Code", hint: "Structured XML" },
  { id: "antigravity", name: "Antigravity", hint: "Task Markdown" },
  { id: "generic", name: "Other AI", hint: "Plain text" },
];

const initialActions: Record<ActionName, ActionState> = {
  deploy: { status: "idle" },
  pick: { status: "idle" },
};

const statusRank: Record<ActionStatus, number> = {
  idle: 0,
  sending: 1,
  sent: 2,
  received: 3,
  queued: 4,
  no_agent: 4,
  failed: 4,
};

function websocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:8000/api/dev/ws/ui`;
}

function CodersMark() {
  return (
    <span
      aria-hidden
      className="grid size-7 place-items-center rounded-lg bg-zinc-950 font-mono text-[13px] font-bold tracking-tighter text-white dark:bg-white dark:text-zinc-950"
    >
      /c
    </span>
  );
}

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "claude") {
    return <span className="text-base leading-none text-[#d97757]">✳</span>;
  }
  if (provider === "antigravity") {
    return <Orbit className="size-4 text-[#635bff]" />;
  }
  if (provider === "generic") {
    return <Sparkles className="size-4 text-zinc-500" />;
  }
  return (
    <span className="grid size-4 place-items-center rounded-full bg-zinc-950 text-[8px] font-bold text-white dark:bg-white dark:text-zinc-950">
      C
    </span>
  );
}

function ActionIcon({ action, status }: { action: ActionName; status: ActionStatus }) {
  if (["sending", "sent"].includes(status)) {
    return <LoaderCircle className="size-3.5 animate-spin" />;
  }
  if (["received", "queued"].includes(status)) {
    return <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />;
  }
  if (["no_agent", "failed"].includes(status)) {
    return <TriangleAlert className="size-3.5 text-amber-500" />;
  }
  return action === "deploy" ? (
    <CloudUpload className="size-3.5" />
  ) : (
    <MousePointer2 className="size-3.5" />
  );
}

function basename(value: string) {
  const parts = value.split("/").filter(Boolean);
  return parts.at(-1) || value || "project";
}

function targetSelector(target: Element): string {
  if (target.id) return `#${CSS.escape(target.id)}`;
  const parts: string[] = [];
  let current: Element | null = target;
  while (current && current !== document.body && parts.length < 4) {
    let part = current.tagName.toLowerCase();
    const tagName = current.tagName;
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === tagName,
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}

export function DevDeployBadge() {
  const [open, setOpen] = useState(false);
  const [hubOnline, setHubOnline] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [provider, setProvider] = useState<Provider>("codex");
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pairingConnected, setPairingConnected] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [actions, setActions] = useState(initialActions);
  const socketRef = useRef<WebSocket | null>(null);
  const clearTimers = useRef<
    Partial<Record<ActionName, ReturnType<typeof setTimeout>>>
  >({});

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const timers = clearTimers.current;

    function connect() {
      const socket = new WebSocket(websocketUrl());
      socketRef.current = socket;
      socket.addEventListener("open", () => setHubOnline(true));
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === "agents.snapshot") {
          const nextAgents = message.agents as Agent[];
          setAgents(nextAgents);
          setSelectedAgentId((current) =>
            current && nextAgents.some((agent) => agent.id === current)
              ? current
              : nextAgents[0]?.id,
          );
          return;
        }
        if (message.type !== "action.status") return;
        const action = message.action as ActionName;
        setActions((current) => {
          const previous = current[action];
          if (previous.requestId !== message.requestId) return current;
          const nextStatus = message.status as ActionStatus;
          if (statusRank[nextStatus] < statusRank[previous.status]) return current;
          return {
            ...current,
            [action]: {
              requestId: message.requestId,
              status: nextStatus,
              detail: message.detail,
            },
          };
        });
        if (["queued", "no_agent", "failed"].includes(message.status)) {
          clearTimeout(clearTimers.current[action]);
          clearTimers.current[action] = setTimeout(() => {
            setActions((current) => ({
              ...current,
              [action]: { status: "idle" },
            }));
          }, 1800);
        }
      });
      socket.addEventListener("close", () => {
        if (socketRef.current === socket) socketRef.current = null;
        setHubOnline(false);
        setAgents([]);
        if (!disposed) reconnectTimer = setTimeout(connect, 1500);
      });
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      Object.values(timers).forEach(clearTimeout);
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!pairing || pairingConnected) return;
    const interval = setInterval(async () => {
      const response = await fetch(`/api/dev/pair/${pairing.code}/status`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.status === "connected") {
        setPairingConnected(true);
        setCopied(false);
        setTimeout(() => setOpen(false), 900);
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [pairing, pairingConnected]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId],
  );

  const trigger = useCallback(
    (action: ActionName, payload: Record<string, unknown> = {}) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const requestId = crypto.randomUUID();
      clearTimeout(clearTimers.current[action]);
      setActions((current) => ({
        ...current,
        [action]: { requestId, status: "sending" },
      }));
      socket.send(
        JSON.stringify({
          type: "action.create",
          action,
          requestId,
          agentId: selectedAgentId,
          payload,
        }),
      );
    },
    [selectedAgentId],
  );

  useEffect(() => {
    if (!pickMode) return;
    let hovered: HTMLElement | null = null;
    const clear = () => {
      if (hovered) {
        hovered.style.outline = hovered.dataset.codersPreviousOutline ?? "";
        delete hovered.dataset.codersPreviousOutline;
      }
      hovered = null;
    };
    const move = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-coders-toolbar]")) return;
      if (target === hovered) return;
      clear();
      hovered = target;
      hovered.dataset.codersPreviousOutline = hovered.style.outline;
      hovered.style.outline = "2px solid #635bff";
    };
    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-coders-toolbar]")) return;
      event.preventDefault();
      event.stopPropagation();
      clear();
      setPickMode(false);
      trigger("pick", {
        url: window.location.href,
        selector: targetSelector(target),
        text: target.innerText?.trim().slice(0, 240) || null,
      });
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    return () => {
      clear();
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", click, true);
    };
  }, [pickMode, trigger]);

  async function chooseProvider(nextProvider: Provider) {
    setProvider(nextProvider);
    setPairing(null);
    setPairingConnected(false);
    setCopied(false);
    setCreating(true);
    try {
      const response = await fetch("/api/dev/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: nextProvider }),
      });
      if (!response.ok) throw new Error("Could not create pairing link");
      setPairing(await response.json());
    } finally {
      setCreating(false);
    }
  }

  async function copyPrompt() {
    if (!pairing) return;
    await navigator.clipboard.writeText(pairing.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (process.env.NODE_ENV !== "development") return null;
  const connected = agents.length > 0;

  return (
    <div
      data-coders-toolbar
      className="fixed bottom-4 left-4 z-50 font-sans text-zinc-900 dark:text-zinc-100"
    >
      {open && (
        <div className="mb-2 w-[min(92vw,560px)] overflow-hidden rounded-2xl border border-black/10 bg-white/95 shadow-2xl shadow-black/15 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95">
          <div className="flex items-start justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
            <div>
              <p className="text-[13px] font-semibold">Paste to your AI</p>
              <p className="mt-0.5 text-[10.5px] text-zinc-500">
                Choose the agent you use. The connection protocol stays the same.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
            {providers.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => chooseProvider(item.id)}
                className={`flex min-h-16 flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
                  provider === item.id && pairing
                    ? "border-zinc-900 bg-zinc-50 dark:border-white dark:bg-zinc-800"
                    : "border-black/10 dark:border-white/10"
                }`}
              >
                <ProviderIcon provider={item.id} />
                <span>
                  <span className="block text-[11px] font-medium">{item.name}</span>
                  <span className="block text-[9.5px] text-zinc-500">
                    {item.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-black/5 p-3 dark:border-white/10">
            {creating ? (
              <div className="grid h-32 place-items-center text-[11px] text-zinc-500">
                Creating a one-time link…
              </div>
            ) : pairing ? (
              <>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-100 p-3 font-mono text-[10.5px] leading-relaxed dark:bg-zinc-800">
                  {pairing.prompt}
                </pre>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[10px] text-zinc-500">
                    One use · expires in 5 minutes · listen/ack only
                  </span>
                  <button
                    type="button"
                    onClick={copyPrompt}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-[11px] font-medium text-white dark:bg-white dark:text-zinc-950"
                  >
                    {pairingConnected ? (
                      <Check className="size-3.5" />
                    ) : copied ? (
                      <Clipboard className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {pairingConnected ? "Connected" : copied ? "Copied" : "Copy prompt"}
                  </button>
                </div>
              </>
            ) : (
              <div className="grid h-32 place-items-center text-center text-[11px] text-zinc-500">
                Select your AI to create its recommended prompt.
              </div>
            )}
          </div>

          {connected && (
            <div className="border-t border-black/5 px-3 py-2.5 dark:border-white/10">
              <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                Connected now
              </p>
              <div className="flex flex-wrap gap-1.5">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] ${
                      selectedAgentId === agent.id
                        ? "border-zinc-900 dark:border-white"
                        : "border-black/10 dark:border-white/10"
                    }`}
                    title={`${basename(agent.projectPath)} · ${agent.status}`}
                  >
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    <ProviderIcon provider={agent.provider} />
                    {agent.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex h-10 items-center gap-1 rounded-xl border border-black/10 bg-white/95 p-1 shadow-lg shadow-black/10 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Connect an AI agent"
          aria-expanded={open}
          title={selectedAgent ? `Agent: ${selectedAgent.name}` : "Connect an AI agent"}
        >
          <CodersMark />
        </button>

        {connected && (
          <>
            <span className="mx-0.5 h-5 w-px bg-black/10 dark:bg-white/10" />
            <button
              type="button"
              onClick={() => trigger("deploy", { url: window.location.href })}
              disabled={!hubOnline || actions.deploy.status !== "idle"}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
            >
              <ActionIcon action="deploy" status={actions.deploy.status} />
              Deploy
            </button>
            <button
              type="button"
              onClick={() => setPickMode((value) => !value)}
              disabled={!hubOnline || actions.pick.status !== "idle"}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                pickMode
                  ? "bg-[#635bff] text-white"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <ActionIcon action="pick" status={actions.pick.status} />
              Pick
            </button>
          </>
        )}
      </div>
    </div>
  );
}
