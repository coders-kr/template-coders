"""Local-development event hub for the coders.kr agent toolbar.

The browser and one or more host-side agent bridges connect over separate
WebSockets. The browser never invokes Codex directly; it publishes an intent
(`deploy` or `pick`) and receives delivery acknowledgements from the bridge.

This module is intentionally in-memory. It is a development aid, not part of
the deployed application's durable state.
"""

from __future__ import annotations

import asyncio
import base64
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()

ALLOWED_ACTIONS = {"deploy", "pick"}
ALLOWED_PROVIDERS = {"codex", "claude", "antigravity", "generic"}
PAIRING_TTL_SECONDS = 300
ALLOWED_UI_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
}


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _pairing_code() -> str:
    raw = base64.b32encode(secrets.token_bytes(10)).decode().rstrip("=")
    return "-".join(raw[index : index + 4] for index in range(0, len(raw), 4))


def _pairing_prompt(provider: str, manifest_url: str) -> str:
    boundary = (
        "Pairing only connects this session to local development events. "
        "Do not deploy or edit files as part of linking."
    )
    if provider == "claude":
        return f"""<coders_pairing>
  <goal>Link this Claude Code session and its current workspace to coders.kr.</goal>
  <manifest_url>{manifest_url}</manifest_url>
  <instructions>Open the one-time manifest and run its bridge command. Keep Agent Bridge running for this session.</instructions>
  <boundary>{boundary}</boundary>
</coders_pairing>"""
    if provider == "antigravity":
        return f"""# Link this Antigravity agent to coders.kr

## Pairing manifest
{manifest_url}

## Task
Open the one-time manifest, run its bridge command, and keep Agent Bridge running for this workspace.

## Permission boundary
{boundary}"""
    if provider == "generic":
        return f"""Link this AI coding session and its current workspace to coders.kr.

Open this one-time pairing manifest and run its bridge command:
{manifest_url}

Keep Agent Bridge running for this session. {boundary}"""
    return f"""# Link this Codex task to coders.kr

Open the one-time pairing manifest below and run its bridge command:

{manifest_url}

Keep Agent Bridge running for this task and the current workspace. {boundary}"""


class PairingCreate(BaseModel):
    provider: Literal["codex", "claude", "antigravity", "generic"] = "codex"


@dataclass
class PairingTicket:
    code: str
    provider: str
    created_at: datetime
    expires_at: datetime
    agent_id: str | None = None

    @property
    def status(self) -> str:
        return "connected" if self.agent_id else "pending"


@dataclass
class AgentConnection:
    websocket: WebSocket
    id: str
    name: str
    thread_id: str
    project_path: str
    capabilities: list[str]
    provider: str = "codex"
    status: str = "idle"
    last_seen_at: str = field(default_factory=_utc_now)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "threadId": self.thread_id,
            "projectPath": self.project_path,
            "capabilities": self.capabilities,
            "provider": self.provider,
            "status": self.status,
            "lastSeenAt": self.last_seen_at,
        }


class DevAgentHub:
    def __init__(self) -> None:
        self.agents: dict[str, AgentConnection] = {}
        self.ui_clients: set[WebSocket] = set()
        self.pairings: dict[str, PairingTicket] = {}
        self._lock = asyncio.Lock()

    def _ticket(self, code: str) -> PairingTicket | None:
        normalized = code.upper()
        ticket = self.pairings.get(normalized)
        if ticket and ticket.expires_at <= datetime.now(UTC):
            self.pairings.pop(normalized, None)
            return None
        return ticket

    def create_pairing(self, provider: str, public_url: str) -> dict[str, Any]:
        code = _pairing_code()
        now = datetime.now(UTC)
        ticket = PairingTicket(
            code=code,
            provider=provider,
            created_at=now,
            expires_at=now + timedelta(seconds=PAIRING_TTL_SECONDS),
        )
        self.pairings[code] = ticket
        manifest_url = f"{public_url.rstrip('/')}/api/dev/pair/{code}"
        return {
            "code": code,
            "provider": provider,
            "manifestUrl": manifest_url,
            "prompt": _pairing_prompt(provider, manifest_url),
            "expiresAt": ticket.expires_at.isoformat(),
        }

    def pairing_manifest(self, code: str, public_url: str) -> dict[str, Any]:
        ticket = self._ticket(code)
        if ticket is None:
            raise KeyError(code)
        manifest_url = f"{public_url.rstrip('/')}/api/dev/pair/{ticket.code}"
        return {
            "protocol": "coders-agent-bridge",
            "version": 1,
            "project": {"name": "local coders.kr project"},
            "providerHint": ticket.provider,
            "pairingCode": ticket.code,
            "websocketUrl": public_url.rstrip("/").replace("http://", "ws://").replace(
                "https://", "wss://"
            )
            + "/api/dev/ws/agent",
            "bridgeCommand": (
                "node scripts/coders-agent-bridge.mjs "
                f'--pair "{manifest_url}"'
            ),
            "scopes": ["events:listen", "events:ack"],
            "status": ticket.status,
            "expiresAt": ticket.expires_at.isoformat(),
        }

    def pairing_status(self, code: str) -> dict[str, Any]:
        ticket = self._ticket(code)
        if ticket is None:
            raise KeyError(code)
        return {
            "status": ticket.status,
            "agentId": ticket.agent_id,
            "expiresAt": ticket.expires_at.isoformat(),
        }

    async def add_ui(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.ui_clients.add(websocket)
        await websocket.send_json(self.snapshot())

    async def remove_ui(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.ui_clients.discard(websocket)

    async def add_agent(self, websocket: WebSocket, hello: dict[str, Any]) -> AgentConnection:
        capabilities = [
            item for item in hello.get("capabilities", []) if item in ALLOWED_ACTIONS
        ]
        agent_id = str(hello.get("agentId") or uuid4())
        pairing_code = str(hello.get("pairingCode") or "")
        provider = str(hello.get("provider") or "codex")
        if pairing_code:
            ticket = self._ticket(pairing_code)
            if ticket is None:
                raise ValueError("Pairing code expired or not found")
            if ticket.agent_id and ticket.agent_id != agent_id:
                raise ValueError("Pairing code already used")
            ticket.agent_id = agent_id
            provider = ticket.provider
        if provider not in ALLOWED_PROVIDERS:
            provider = "generic"
        agent = AgentConnection(
            websocket=websocket,
            id=agent_id,
            name=str(hello.get("name") or provider.title()),
            thread_id=str(hello.get("threadId") or "unknown"),
            project_path=str(hello.get("projectPath") or ""),
            capabilities=capabilities or sorted(ALLOWED_ACTIONS),
            provider=provider,
        )
        async with self._lock:
            replaced = self.agents.get(agent.id)
            self.agents[agent.id] = agent
        if replaced and replaced.websocket is not websocket:
            await replaced.websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
        await self.broadcast_snapshot()
        return agent

    async def remove_agent(self, agent: AgentConnection) -> None:
        async with self._lock:
            current = self.agents.get(agent.id)
            if current and current.websocket is agent.websocket:
                self.agents.pop(agent.id, None)
        await self.broadcast_snapshot()

    def snapshot(self) -> dict[str, Any]:
        return {
            "type": "agents.snapshot",
            "agents": [agent.public() for agent in self.agents.values()],
        }

    async def _broadcast_ui(self, payload: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for websocket in tuple(self.ui_clients):
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        if stale:
            async with self._lock:
                for websocket in stale:
                    self.ui_clients.discard(websocket)

    async def broadcast_snapshot(self) -> None:
        await self._broadcast_ui(self.snapshot())

    async def publish_action(self, message: dict[str, Any]) -> None:
        action = str(message.get("action") or "")
        request_id = str(message.get("requestId") or uuid4())
        if action not in ALLOWED_ACTIONS:
            await self._broadcast_ui(
                {
                    "type": "action.status",
                    "requestId": request_id,
                    "action": action,
                    "status": "failed",
                    "detail": "unsupported action",
                }
            )
            return

        target_id = message.get("agentId")
        candidates = [
            agent
            for agent in self.agents.values()
            if action in agent.capabilities and (not target_id or agent.id == target_id)
        ]
        candidates.sort(key=lambda item: item.status != "idle")
        if not candidates:
            await self._broadcast_ui(
                {
                    "type": "action.status",
                    "requestId": request_id,
                    "action": action,
                    "status": "no_agent",
                    "detail": "No connected agent can handle this action.",
                }
            )
            return

        agent = candidates[0]
        payload = {
            "type": "action.requested",
            "requestId": request_id,
            "action": action,
            "agentId": agent.id,
            "payload": message.get("payload") or {},
            "createdAt": _utc_now(),
        }
        try:
            await agent.websocket.send_json(payload)
            await self._broadcast_ui(
                {
                    "type": "action.status",
                    "requestId": request_id,
                    "action": action,
                    "agentId": agent.id,
                    "status": "sent",
                }
            )
        except Exception:
            await self.remove_agent(agent)
            await self._broadcast_ui(
                {
                    "type": "action.status",
                    "requestId": request_id,
                    "action": action,
                    "agentId": agent.id,
                    "status": "failed",
                    "detail": "Agent connection closed before delivery.",
                }
            )

    async def handle_agent_message(
        self, agent: AgentConnection, message: dict[str, Any]
    ) -> None:
        message_type = message.get("type")
        if message_type == "heartbeat":
            agent.last_seen_at = _utc_now()
            agent.status = str(message.get("status") or agent.status)
            await self.broadcast_snapshot()
            return
        if message_type == "action.status":
            agent.last_seen_at = _utc_now()
            agent.status = "busy" if message.get("status") == "received" else "idle"
            await self._broadcast_ui({**message, "agentId": agent.id})
            await self.broadcast_snapshot()


hub = DevAgentHub()


def _ensure_enabled() -> None:
    if not settings.dev_agent_bridge:
        raise HTTPException(status_code=404, detail="Development Agent Bridge disabled")


@router.post("/api/dev/pair", status_code=status.HTTP_201_CREATED)
async def create_pairing(body: PairingCreate) -> dict[str, Any]:
    _ensure_enabled()
    return hub.create_pairing(body.provider, settings.dev_agent_public_url)


@router.get("/api/dev/pair/{code}")
async def pairing_manifest(code: str) -> dict[str, Any]:
    _ensure_enabled()
    try:
        return hub.pairing_manifest(code, settings.dev_agent_public_url)
    except KeyError:
        raise HTTPException(
            status_code=410, detail="Pairing code expired or not found"
        ) from None


@router.get("/api/dev/pair/{code}/status")
async def pairing_status(code: str) -> dict[str, Any]:
    _ensure_enabled()
    try:
        return hub.pairing_status(code)
    except KeyError:
        raise HTTPException(
            status_code=410, detail="Pairing code expired or not found"
        ) from None


async def _reject_if_disabled(websocket: WebSocket) -> bool:
    if settings.dev_agent_bridge:
        return False
    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    return True


@router.websocket("/api/dev/ws/ui")
async def ui_websocket(websocket: WebSocket) -> None:
    if await _reject_if_disabled(websocket):
        return
    origin = websocket.headers.get("origin")
    if origin not in ALLOWED_UI_ORIGINS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    await hub.add_ui(websocket)
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "action.create":
                await hub.publish_action(message)
    except WebSocketDisconnect:
        await hub.remove_ui(websocket)


@router.websocket("/api/dev/ws/agent")
async def agent_websocket(websocket: WebSocket) -> None:
    if await _reject_if_disabled(websocket):
        return
    # Browsers always send Origin. Requiring an origin-less client prevents an
    # arbitrary webpage from impersonating a local host bridge.
    if websocket.headers.get("origin"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    agent: AgentConnection | None = None
    try:
        hello = await websocket.receive_json()
        if hello.get("type") != "agent.hello":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        try:
            agent = await hub.add_agent(websocket, hello)
        except ValueError:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        await websocket.send_json({"type": "agent.ready", "agentId": agent.id})
        while True:
            message = await websocket.receive_json()
            await hub.handle_agent_message(agent, message)
    except WebSocketDisconnect:
        pass
    finally:
        if agent:
            await hub.remove_agent(agent)
