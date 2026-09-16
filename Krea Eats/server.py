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

        '''
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
        '''

        body = json.dumps({
            "success": True,
            "user": dict(user)
        }).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header(
            "Set-Cookie",
            f"session_id={session_id}; Path=/; HttpOnly"
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def logout(self):
        cookie = self.headers.get("Cookie", "")

        for part in cookie.split(";"):
            part = part.strip()

            if part.startswith("session_id="):
                session_id = part.split("=", 1)[1]
                SESSIONS.pop(session_id, None)

        send_json(self, {"success": True})

    def get_outlets(self):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        rows = query_all(
            """
            SELECT
                o.*,
                COALESCE(uop.position, o.sort_order) AS user_position
            FROM outlets o
            LEFT JOIN user_outlet_positions uop
                ON o.id = uop.outlet_id
                AND uop.user_id = ?
            ORDER BY user_position
            """,
            (user["id"],)
        )

        send_json(self, {
            "outlets": [dict(row) for row in rows]
        })

    def get_menu(self, outlet_id, dietary_type=None):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        if not outlet_id:
            send_json(self, {"error": "outlet_id is required"}, 400)
            return

        sql = """
            SELECT
                menu_items.*,
                menu_categories.name AS category_name
            FROM menu_items
            LEFT JOIN menu_categories
                ON menu_items.category_id = menu_categories.id
            WHERE menu_items.outlet_id = ?
        """

        parameters = [outlet_id]

        if dietary_type and dietary_type != "all":
            sql += " AND menu_items.dietary_type = ?"
            parameters.append(dietary_type)

        sql += " ORDER BY category_name, name"

        rows = query_all(sql, parameters)

        send_json(self, {
            "items": [dict(row) for row in rows]
        })

    def get_cart(self):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        rows = query_all(
            """
            SELECT
                cart_items.id,
                cart_items.quantity,
                menu_items.id AS item_id,
                menu_items.name,
                menu_items.price,
                menu_items.is_available,
                outlets.name AS outlet_name,
                outlets.id AS outlet_id
            FROM cart_items
            JOIN menu_items ON cart_items.item_id = menu_items.id
            JOIN outlets ON menu_items.outlet_id = outlets.id
            WHERE cart_items.user_id = ?
            """,
            (user["id"],)
        )

        total = sum(row["price"] * row["quantity"] for row in rows)

        send_json(self, {
            "items": [dict(row) for row in rows],
            "total": total
        })

    def add_to_cart(self):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        data = read_json(self)
        item_id = data.get("item_id")
        quantity = int(data.get("quantity", 1))

        item = query_one(
            """
            SELECT * FROM menu_items
            WHERE id = ? AND is_available = 1
            """,
            (item_id,)
        )

        if not item:
            send_json(self, {
                "error": "Item is unavailable"
            }, 400)
            return

        connection = get_connection()

        connection.execute(
            """
            INSERT INTO cart_items(user_id, item_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, item_id)
            DO UPDATE SET quantity = quantity + excluded.quantity
            """,
            (user["id"], item_id, quantity)
        )

        connection.commit()
        connection.close()

        send_json(self, {"success": True})

    def update_cart_item(self):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        cart_item_id = self.path.split("/")[-1]
        data = read_json(self)
        quantity = int(data.get("quantity", 0))

        connection = get_connection()

        if quantity <= 0:
            connection.execute(
                """
                DELETE FROM cart_items
                WHERE id = ? AND user_id = ?
                """,
                (cart_item_id, user["id"])
            )
        else:
            connection.execute(
                """
                UPDATE cart_items
                SET quantity = ?
                WHERE id = ? AND user_id = ?
                """,
                (quantity, cart_item_id, user["id"])
            )

        connection.commit()
        connection.close()

        send_json(self, {"success": True})

    def create_order(self):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        data = read_json(self)
        payment_method = data.get("payment_method", "SIMULATED_ONLINE")

        connection = get_connection()

        cart = connection.execute(
            """
            SELECT
                cart_items.item_id,
                cart_items.quantity,
                menu_items.name,
                menu_items.price,
                menu_items.outlet_id,
                menu_items.is_available
            FROM cart_items
            JOIN menu_items ON cart_items.item_id = menu_items.id
            WHERE cart_items.user_id = ?
            """,
            (user["id"],)
        ).fetchall()

        if not cart:
            connection.close()
            send_json(self, {"error": "Cart is empty"}, 400)
            return

        if any(not row["is_available"] for row in cart):
            connection.close()
            send_json(self, {
                "error": "One or more items are unavailable"
            }, 400)
            return

        outlet_ids = set(row["outlet_id"] for row in cart)

        if len(outlet_ids) != 1:
            connection.close()
            send_json(self, {
                "error": "Items must be from one outlet per order"
            }, 400)
            return

        outlet_id = cart[0]["outlet_id"]
        total = sum(row["price"] * row["quantity"] for row in cart)
        estimated_time = max(
            row["quantity"] * 5 + 10 for row in cart
        )

        pickup_otp = str(secrets.randbelow(9000) + 1000)

        order_cursor = connection.execute(
            """
            INSERT INTO orders
            (
                user_id, outlet_id, status, payment_status,
                payment_method, total, estimated_time, pickup_otp
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                outlet_id,
                "PLACED",
                "PENDING",
                payment_method,
                total,
                estimated_time,
                pickup_otp
            )
        )

        ## ORDER CREATION ##
        order_id = order_cursor.lastrowid

        for row in cart:
            connection.execute(
                """
                INSERT INTO order_items
                (order_id, item_id, item_name, price, quantity)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    order_id,
                    row["item_id"],
                    row["name"],
                    row["price"],
                    row["quantity"]
                )
            )

        connection.execute(
            "DELETE FROM cart_items WHERE user_id = ?",
            (user["id"],)
        )

        connection.execute(
            """
            INSERT INTO notifications(user_id, message)
            VALUES (?, ?)
            """,
            (
                user["id"],
                f"Order #{order_id} has been placed."
            )
        )

        connection.commit()
        connection.close()

        send_json(self, {
            "success": True,
            "order_id": order_id,
            "total": total,
            "estimated_time": estimated_time
        })

    def process_payment(self):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        data = read_json(self)
        order_id = data.get("order_id")
        success = data.get("simulate_success", True)

        connection = get_connection()

        order = connection.execute(
            """
            SELECT * FROM orders
            WHERE id = ? AND user_id = ?
            """,
            (order_id, user["id"])
        ).fetchone()

        if not order:
            connection.close()
            send_json(self, {"error": "Order not found"}, 404)
            return

        if success:
            payment_status = "PAID"
            status = "PREPARING"
            message = f"Payment successful for order #{order_id}."
        else:
            payment_status = "FAILED"
            status = "PAYMENT_FAILED"
            message = f"Payment failed for order #{order_id}."

        connection.execute(
            """
            UPDATE orders
            SET payment_status = ?, status = ?
            WHERE id = ?
            """,
            (payment_status, status, order_id)
        )

        connection.execute(
            """
            INSERT INTO notifications(user_id, message)
            VALUES (?, ?)
            """,
            (user["id"], message)
        )

        connection.commit()
        connection.close()

        send_json(self, {
            "success": success,
            "payment_status": payment_status,
            "status": status
        })

    ## Add order, notification and static-file methods ##
    def get_orders(self):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        rows = query_all(
            """
            SELECT
                orders.*,
                outlets.name AS outlet_name
            FROM orders
            JOIN outlets ON orders.outlet_id = outlets.id
            WHERE orders.user_id = ?
            ORDER BY orders.created_at DESC
            """,
            (user["id"],)
        )

        send_json(self, {
            "orders": [dict(row) for row in rows]
        })

    def get_notifications(self):
        user = get_session_user(self)

        if not user:
            send_json(self, {"error": "Login required"}, 401)
            return

        rows = query_all(
            """
            SELECT *
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 30
            """,
            (user["id"],)
        )

        send_json(self, {
            "notifications": [dict(row) for row in rows]
        })

    def serve_static(self, path):
        import os
        from urllib.parse import unquote

        path = unquote(path)

        if path == "/":
            path = "/index.html"

        file_path = os.path.join("public", path.lstrip("/"))

        if not os.path.isfile(file_path):
            send_json(self, {"error": "File not found"}, 404)
            return

        if file_path.endswith(".html"):
            content_type = "text/html"
        elif file_path.endswith(".js"):
            content_type = "application/javascript"
        elif file_path.endswith(".css"):
            content_type = "text/css"
        else:
            content_type = "application/octet-stream"

        with open(file_path, "rb") as file:
            body = file.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    initialize_database()

    server = ThreadingHTTPServer((HOST, PORT), FoodHandler)

    print(f"Krea Food running at http://{HOST}:{PORT}")
    server.serve_forever()
