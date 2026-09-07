#!/bin/sh
set -e

# POSIX sh has no /dev/tcp. Use the image's Python, including IPv6 URLs.
python wait_for_db.py

uv run alembic upgrade head

exec uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
