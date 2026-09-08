import importlib.util
import socket
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "wait_for_db", Path(__file__).parents[1] / "wait_for_db.py"
)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class DatabaseProbeTests(unittest.TestCase):
    def test_ready_immediately(self):
        with socket.socket() as server:
            server.bind(("127.0.0.1", 0))
            server.listen()
            probe.wait_for_db(f"postgresql://127.0.0.1:{server.getsockname()[1]}/db", .5)

    def test_ipv6_and_password(self):
        with patch.object(probe.socket, "create_connection") as connect:
            probe.wait_for_db("postgresql+asyncpg://u:p%40ss@[::1]:5433/db")
            self.assertEqual(connect.call_args.args[0], ("::1", 5433))

    def test_timeout(self):
        with patch.object(probe.socket, "create_connection", side_effect=OSError):
            with self.assertRaises(TimeoutError):
                probe.wait_for_db("postgresql://localhost/db", .02)

    def test_invalid_url_does_not_leak_password(self):
        with self.assertRaisesRegex(ValueError, "credentials omitted"):
            probe.wait_for_db("postgresql://u:secret@host:invalid/db")

    def test_no_database(self):
        with patch.object(probe.socket, "create_connection") as connect:
            probe.wait_for_db("")
            connect.assert_not_called()
