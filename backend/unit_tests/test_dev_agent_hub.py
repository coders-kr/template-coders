from __future__ import annotations

from typing import Any

import pytest
from app.dev_agent_hub import DevAgentHub


class FakeWebSocket:
    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []
        self.closed = False

    async def send_json(self, message: dict[str, Any]) -> None:
        self.messages.append(message)

    async def close(self, code: int) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_action_reports_no_agent() -> None:
    test_hub = DevAgentHub()
    ui = FakeWebSocket()
    await test_hub.add_ui(ui)  # type: ignore[arg-type]

    await test_hub.publish_action(
        {"type": "action.create", "requestId": "r-1", "action": "deploy"}
    )

    assert ui.messages[-1]["status"] == "no_agent"
    assert ui.messages[-1]["requestId"] == "r-1"


@pytest.mark.asyncio
async def test_action_is_routed_and_acknowledged() -> None:
    test_hub = DevAgentHub()
    ui = FakeWebSocket()
    bridge = FakeWebSocket()
    await test_hub.add_ui(ui)  # type: ignore[arg-type]
    agent = await test_hub.add_agent(  # type: ignore[arg-type]
        bridge,
        {
            "type": "agent.hello",
            "agentId": "agent-1",
            "name": "Codex",
            "threadId": "thread-1",
            "projectPath": "/project",
            "capabilities": ["deploy", "pick"],
        },
    )

    await test_hub.publish_action(
        {"type": "action.create", "requestId": "r-2", "action": "pick"}
    )
    assert bridge.messages[-1] == {
        "type": "action.requested",
        "requestId": "r-2",
        "action": "pick",
        "agentId": "agent-1",
        "payload": {},
        "createdAt": bridge.messages[-1]["createdAt"],
    }
    assert ui.messages[-1]["status"] == "sent"

    await test_hub.handle_agent_message(
        agent,
        {
            "type": "action.status",
            "requestId": "r-2",
            "action": "pick",
            "status": "received",
        },
    )
    statuses = [
        message.get("status")
        for message in ui.messages
        if message.get("type") == "action.status"
    ]
    assert statuses == ["sent", "received"]


@pytest.mark.asyncio
async def test_pairing_is_provider_specific_and_single_agent() -> None:
    test_hub = DevAgentHub()
    pairing = test_hub.create_pairing("claude", "http://localhost:8000")

    assert pairing["prompt"].startswith("<coders_pairing>")
    assert pairing["manifestUrl"] in pairing["prompt"]
    manifest = test_hub.pairing_manifest(
        pairing["code"], "http://localhost:8000"
    )
    assert manifest["providerHint"] == "claude"
    assert manifest["scopes"] == ["events:listen", "events:ack"]
    assert "--pair" in manifest["bridgeCommand"]

    bridge = FakeWebSocket()
    agent = await test_hub.add_agent(  # type: ignore[arg-type]
        bridge,
        {
            "type": "agent.hello",
            "agentId": "agent-claude",
            "name": "Claude Code",
            "threadId": "unknown",
            "projectPath": "/project",
            "pairingCode": pairing["code"],
            "provider": "generic",
            "capabilities": ["deploy", "pick"],
        },
    )
    assert agent.provider == "claude"
    assert test_hub.pairing_status(pairing["code"])["status"] == "connected"

    with pytest.raises(ValueError, match="already used"):
        await test_hub.add_agent(  # type: ignore[arg-type]
            FakeWebSocket(),
            {
                "type": "agent.hello",
                "agentId": "another-agent",
                "pairingCode": pairing["code"],
            },
        )
