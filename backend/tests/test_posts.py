"""End-to-end tests for the post lifecycle.

The tests demonstrate the contract this template enforces with the
platform: anonymous reads OK, anonymous writes 401, signed-in writes
land in the feed.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_feed_empty_for_fresh_db(client: AsyncClient) -> None:
    r = await client.get("/api/feed")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_anonymous_cannot_post(client: AsyncClient) -> None:
    r = await client.post("/api/posts", json={"body": "hi"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_signed_in_post_shows_up_in_feed(
    client: AsyncClient, signed_in_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/api/posts", json={"body": "first post!"}, headers=signed_in_headers
    )
    assert create.status_code == 201, create.text
    created = create.json()
    assert created["body"] == "first post!"
    assert created["author_name"].startswith("user-")

    feed = await client.get("/api/feed")
    assert feed.status_code == 200
    bodies = [p["body"] for p in feed.json()]
    assert bodies == ["first post!"]


@pytest.mark.asyncio
async def test_me_lazily_creates_local_user(
    client: AsyncClient, signed_in_headers: dict[str, str]
) -> None:
    """First-sight visitor → a row gets created and /api/me returns it."""
    r = await client.get("/api/me", headers=signed_in_headers)
    assert r.status_code == 200
    me = r.json()
    assert me["coders_id"] == signed_in_headers["X-Coders-User"]
    assert me["display_name"].startswith("user-")
