"""Bounded startup TCP probe; migrations still verify database readiness."""

import os
import socket
import sys
import time
from urllib.parse import urlsplit


def wait_for_db(url: str, timeout: float = 60) -> None:
    if not url:
        return
    try:
        parsed = urlsplit(url)
        host, port = parsed.hostname, parsed.port or 5432
        if not host or not parsed.scheme.startswith("postgres"):
            raise ValueError
    except ValueError:
        raise ValueError("Invalid PostgreSQL DATABASE_URL (credentials omitted)") from None
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Database TCP connection timed out; migrations not started")
        try:
            with socket.create_connection((host, port), timeout=min(1, remaining)):
                return
        except OSError:
            time.sleep(min(1, max(0, deadline - time.monotonic())))


if __name__ == "__main__":
    try:
        wait_for_db(os.environ.get("DATABASE_URL", ""))
    except (ValueError, TimeoutError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
