import json
import secrets
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from database import (
    initialize_database,
    get_connection,
    query_all,
    query_one
)

HOST = "localhost"
PORT = 8000

# Simulated in-memory sessions.
# This is suitable for a course project, but not production.
SESSIONS = {}


def send_json(handler, data, status=200):
    body = json.dumps(data).encode("utf-8")

    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler):
    length = int(handler.headers.get("Content-Length", 0))
    body = handler.rfile.read(length)
    return json.loads(body.decode("utf-8"))


def get_session_user(handler):
    cookie = handler.headers.get("Cookie", "")

    for part in cookie.split(";"):
        part = part.strip()

        if part.startswith("session_id="):
            session_id = part.split("=", 1)[1]
            return SESSIONS.get(session_id)

    return None


class FoodHandler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/api/session":
            user = get_session_user(self)

            if user:
                send_json(self, {
                    "authenticated": True,
                    "user": user
                })
            else:
                send_json(self, {
                    "authenticated": False
                })
            return

        if path == "/api/outlets":
            self.get_outlets()
            return

        if path == "/api/menu":
            outlet_id = params.get("outlet_id", [None])[0]
            dietary_type = params.get("dietary_type", [None])[0]
            self.get_menu(outlet_id, dietary_type)
            return

        if path == "/api/cart":
            self.get_cart()
            return

        if path == "/api/orders":
            self.get_orders()
            return

        if path == "/api/notifications":
            self.get_notifications()
            return

        if path.startswith("/"):
            self.serve_static(path)
            return

        send_json(self, {"error": "Not found"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/login":
            self.login()
            return

        if path == "/api/cart":
            self.add_to_cart()
            return

        if path == "/api/order":
            self.create_order()
            return

        if path == "/api/payment":
            self.process_payment()
            return

        if path == "/api/logout":
            self.logout()
            return

        send_json(self, {"error": "Not found"}, 404)

    def do_PUT(self):
        parsed = urlparse(self.path)

        if parsed.path.startswith("/api/cart/"):
            self.update_cart_item()
            return

        send_json(self, {"error": "Not found"}, 404)

    def login(self):
        data = read_json(self)

        krea_id = data.get("krea_id", "").strip()
        name = data.get("name", "").strip()

        if not krea_id or not name:
            send_json(self, {
                "error": "Krea ID and name are required"
            }, 400)
            return

        connection = get_connection()

        connection.execute(
            """
            INSERT OR IGNORE INTO users(krea_id, name, email)
            VALUES (?, ?, ?)
            """,
            (krea_id, name, f"{krea_id}@krea.edu.in")
        )

        user = connection.execute(
            "SELECT * FROM users WHERE krea_id = ?",
            (krea_id,)
        ).fetchone()

        connection.commit()
        connection.close()

        session_id = secrets.token_urlsafe(32)
        SESSIONS[session_id] = dict(user)

        send_json(
            self,
            {
                "success": True,
                "user": dict(user)
            }
        )

        # Note:
        # A production implementation should set the cookie before ending headers.
        # The simplified version below is replaced by login_cookie().
