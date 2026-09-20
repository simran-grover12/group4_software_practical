import json
import os
import sqlite3
import secrets
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATABASE = os.path.join(BASE_DIR, "krood.db")

HOST = "localhost"
PORT = 8000

SESSIONS = {}


def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    connection = get_db()
    cursor = connection.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS outlets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            image TEXT,
            is_open INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outlet_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            category TEXT,
            dietary_type TEXT,
            calories INTEGER,
            preparation_time INTEGER,
            is_available INTEGER DEFAULT 1,
            FOREIGN KEY(outlet_id) REFERENCES outlets(id)
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            outlet_id INTEGER NOT NULL,
            total REAL NOT NULL,
            payment_status TEXT NOT NULL,
            order_status TEXT NOT NULL,
            estimated_time INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY(outlet_id) REFERENCES outlets(id)
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            menu_item_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            item_price REAL NOT NULL,
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(menu_item_id) REFERENCES menu_items(id)
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            outlet_id INTEGER,
            rating INTEGER,
            comment TEXT,
            created_at TEXT NOT NULL
        );
    """)

    existing_outlets = cursor.execute(
        "SELECT COUNT(*) AS count FROM outlets"
    ).fetchone()["count"]

    if existing_outlets == 0:
        outlets = [
            (
                "Dining Hall / Mess Food",
                "Daily breakfast, lunch, snacks and dinner",
                "🍛"
            ),
            (
                "Kalai Naturals",
                "Fresh, healthy and natural food",
                "🥗"
            ),
            (
                "Bhagat Ji",
                "Comfort food and campus favourites",
                "🍔"
            ),
            (
                "Sweet and Salt Affair",
                "Sweet and savoury snacks",
                "🍰"
            ),
            (
                "Scoops",
                "Ice creams, desserts and cold treats",
                "🍨"
            ),
            (
                "CopaMoca",
                "Coffee, tea and quick bites",
                "☕"
            ),
            (
                "Cravory",
                "Cravings, wraps, sandwiches and more",
                "🌯"
            )
        ]

        cursor.executemany("""
            INSERT INTO outlets (name, description, image)
            VALUES (?, ?, ?)
        """, outlets)

        menu_items = [
            (1, "South Indian Thali", "Rice, sambar, vegetables and curd", 120, "Meals", "Vegetarian", 650, 15, 1),
            (1, "Chapati Meal", "Chapatis with dal and seasonal vegetables", 100, "Meals", "Vegetarian", 520, 12, 1),
            (1, "Chicken Curry Meal", "Rice, chicken curry and salad", 160, "Meals", "Non-Vegetarian", 720, 18, 1),
            (1, "Fruit Bowl", "Seasonal fresh fruits", 70, "Healthy", "Vegan", 180, 5, 1),

            (2, "Green Goddess Salad", "Fresh greens, vegetables and dressing", 150, "Salads", "Vegan", 280, 8, 1),
            (2, "Peanut Butter Smoothie", "Banana, peanut butter and oat milk", 130, "Beverages", "Vegetarian", 360, 7, 1),
            (2, "Avocado Toast", "Multigrain toast with avocado", 180, "Breakfast", "Vegan", 410, 10, 1),

            (3, "Classic Veg Burger", "Vegetable patty, lettuce and sauce", 110, "Burgers", "Vegetarian", 560, 15, 1),
            (3, "Chicken Burger", "Chicken patty with cheese and lettuce", 160, "Burgers", "Non-Vegetarian", 680, 18, 1),
            (3, "French Fries", "Crispy salted fries", 80, "Sides", "Vegan", 320, 8, 1),

            (4, "Chocolate Brownie", "Warm chocolate brownie", 90, "Desserts", "Vegetarian", 430, 6, 1),
            (4, "Masala Fries", "Fries with Indian spices", 90, "Snacks", "Vegan", 340, 8, 1),
            (4, "Salted Caramel Tart", "Sweet and salty caramel tart", 120, "Desserts", "Vegetarian", 390, 10, 1),

            (5, "Vanilla Scoop", "Classic vanilla ice cream", 70, "Ice Cream", "Vegetarian", 210, 3, 1),
            (5, "Chocolate Scoop", "Rich chocolate ice cream", 70, "Ice Cream", "Vegetarian", 230, 3, 1),
            (5, "Mango Sundae", "Mango ice cream with toppings", 120, "Desserts", "Vegetarian", 330, 5, 1),

            (6, "Cappuccino", "Espresso with steamed milk", 100, "Coffee", "Vegetarian", 120, 6, 1),
            (6, "Cold Coffee", "Chilled coffee with milk", 120, "Coffee", "Vegetarian", 220, 8, 1),
            (6, "Veg Sandwich", "Grilled sandwich with vegetables", 110, "Snacks", "Vegetarian", 390, 10, 1),

            (7, "Paneer Wrap", "Paneer, vegetables and sauces", 140, "Wraps", "Vegetarian", 510, 14, 1),
            (7, "Chicken Wrap", "Chicken, vegetables and sauces", 170, "Wraps", "Non-Vegetarian", 590, 16, 1),
            (7, "Hummus Pita", "Hummus, pita bread and vegetables", 130, "Healthy", "Vegan", 430, 12, 1)
        ]

        cursor.executemany("""
            INSERT INTO menu_items
            (
                outlet_id,
                name,
                description,
                price,
                category,
                dietary_type,
                calories,
                preparation_time,
                is_available
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, menu_items)

    connection.commit()
    connection.close()


def json_response(handler, data, status=200, extra_headers=None):
    response = json.dumps(data).encode("utf-8")

    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(response)))

    if extra_headers:
        for key, value in extra_headers.items():
            handler.send_header(key, value)

    handler.end_headers()
    handler.wfile.write(response)


def read_json_body(handler):
    content_length = int(handler.headers.get("Content-Length", 0))

    if content_length == 0:
        return {}

    raw_body = handler.rfile.read(content_length)
    return json.loads(raw_body.decode("utf-8"))


def get_session_user(handler):
    cookie = handler.headers.get("Cookie", "")

    for item in cookie.split(";"):
        item = item.strip()

        if item.startswith("krood_session="):
            session_id = item.split("=", 1)[1]
            return SESSIONS.get(session_id)

    return None


def require_user(handler):
    user = get_session_user(handler)

    if not user:
        json_response(
            handler,
            {"error": "You must be logged in"},
            status=401
        )
        return None

    return user


class KroodHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path.startswith("/api/"):
            self.handle_api_get(path)
        else:
            self.serve_static_file(path)

    def do_POST(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path.startswith("/api/"):
            self.handle_api_post(path)
        else:
            json_response(
                self,
                {"error": "POST route not found"},
                status=404
            )

    def handle_api_get(self, path):
        if path == "/api/session":
            user = get_session_user(self)

            json_response(self, {
                "authenticated": bool(user),
                "user": user
            })
            return

        if path == "/api/outlets":
            connection = get_db()

            outlets = connection.execute("""
                SELECT *
                FROM outlets
                ORDER BY id
            """).fetchall()

            connection.close()

            json_response(self, {
                "outlets": [dict(outlet) for outlet in outlets]
            })
            return

        if path.startswith("/api/outlets/") and path.endswith("/menu"):
            try:
                outlet_id = int(path.split("/")[3])
            except ValueError:
                json_response(self, {"error": "Invalid outlet ID"}, 400)
                return

            connection = get_db()

            outlet = connection.execute("""
                SELECT *
                FROM outlets
                WHERE id = ?
            """, (outlet_id,)).fetchone()

            items = connection.execute("""
                SELECT *
                FROM menu_items
                WHERE outlet_id = ?
                ORDER BY category, name
            """, (outlet_id,)).fetchall()

            connection.close()

            if not outlet:
                json_response(self, {"error": "Outlet not found"}, 404)
                return

            json_response(self, {
                "outlet": dict(outlet),
                "items": [dict(item) for item in items]
            })
            return

        if path == "/api/orders":
            user = require_user(self)

            if not user:
                return

            connection = get_db()

            orders = connection.execute("""
                SELECT
                    orders.*,
                    outlets.name AS outlet_name
                FROM orders
                JOIN outlets ON outlets.id = orders.outlet_id
                WHERE orders.user_email = ?
                ORDER BY orders.id DESC
            """, (user["email"],)).fetchall()

            connection.close()

            json_response(self, {
                "orders": [dict(order) for order in orders]
            })
            return

        if path == "/api/notifications":
            user = require_user(self)

            if not user:
                return

            connection = get_db()

            notifications = connection.execute("""
                SELECT *
                FROM notifications
                WHERE user_email = ?
                ORDER BY id DESC
                LIMIT 20
            """, (user["email"],)).fetchall()

            connection.close()

            json_response(self, {
                "notifications": [
                    dict(notification)
                    for notification in notifications
                ]
            })
            return

        json_response(self, {"error": "API route not found"}, 404)

    def handle_api_post(self, path):
        if path == "/api/login":
            data = read_json_body(self)

            name = data.get("name", "").strip()
            email = data.get("email", "").strip()

            if not name or not email:
                json_response(
                    self,
                    {"error": "Name and email are required"},
                    status=400
                )
                return

            session_id = secrets.token_urlsafe(32)

            user = {
                "name": name,
                "email": email
            }

            SESSIONS[session_id] = user

            json_response(
                self,
                {
                    "message": "Login successful",
                    "user": user
                },
                extra_headers={
                    "Set-Cookie": f"krood_session={session_id}; HttpOnly; Path=/"
                }
            )
            return

        if path == "/api/logout":
            cookie = self.headers.get("Cookie", "")

            for item in cookie.split(";"):
                item = item.strip()

                if item.startswith("krood_session="):
                    session_id = item.split("=", 1)[1]
                    SESSIONS.pop(session_id, None)

            json_response(
                self,
                {"message": "Logged out"},
                extra_headers={
                    "Set-Cookie": "krood_session=; HttpOnly; Path=/; Max-Age=0"
                }
            )
            return

        if path == "/api/orders":
            user = require_user(self)

            if not user:
                return

            data = read_json_body(self)

            outlet_id = data.get("outlet_id")
            items = data.get("items", [])
            payment_method = data.get("payment_method", "Simulated payment")

            if not outlet_id or not items:
                json_response(
                    self,
                    {"error": "Outlet and cart items are required"},
                    status=400
                )
                return

            connection = get_db()

            total = 0
            total_preparation_time = 0
            valid_items = []

            for item in items:
                menu_item_id = item.get("menu_item_id")
                quantity = int(item.get("quantity", 0))

                if quantity <= 0:
                    continue

                menu_item = connection.execute("""
                    SELECT *
                    FROM menu_items
                    WHERE id = ?
                    AND outlet_id = ?
                    AND is_available = 1
                """, (menu_item_id, outlet_id)).fetchone()

                if not menu_item:
                    connection.close()

                    json_response(
                        self,
                        {"error": "One or more items are unavailable"},
                        status=400
                    )
                    return

                total += menu_item["price"] * quantity
                total_preparation_time += menu_item["preparation_time"]
                valid_items.append((menu_item, quantity))

            if not valid_items:
                connection.close()

                json_response(
                    self,
                    {"error": "Your cart is empty"},
                    status=400
                )
                return

            created_at = datetime.now().isoformat(timespec="seconds")

            cursor = connection.cursor()

            cursor.execute("""
                INSERT INTO orders
                (
                    user_email,
                    outlet_id,
                    total,
                    payment_status,
                    order_status,
                    estimated_time,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                user["email"],
                outlet_id,
                total,
                "Paid - Simulated",
                "Received",
                total_preparation_time,
                created_at
            ))

            order_id = cursor.lastrowid

            for menu_item, quantity in valid_items:
                cursor.execute("""
                    INSERT INTO order_items
                    (
                        order_id,
                        menu_item_id,
                        quantity,
                        item_price
                    )
                    VALUES (?, ?, ?, ?)
                """, (
                    order_id,
                    menu_item["id"],
                    quantity,
                    menu_item["price"]
                ))

            cursor.execute("""
                INSERT INTO notifications
                (
                    user_email,
                    message,
                    created_at
                )
                VALUES (?, ?, ?)
            """, (
                user["email"],
                f"Order #{order_id} has been received by Krood OS.",
                created_at
            ))

            connection.commit()
            connection.close()

            json_response(self, {
                "message": "Order placed successfully",
                "order_id": order_id,
                "total": total,
                "estimated_time": total_preparation_time,
                "payment_method": payment_method
            })
            return

        if path == "/api/feedback":
            user = require_user(self)

            if not user:
                return

            data = read_json_body(self)

            outlet_id = data.get("outlet_id")
            rating = data.get("rating")
            comment = data.get("comment", "")

            if not rating:
                json_response(
                    self,
                    {"error": "Rating is required"},
                    status=400
                )
                return

            connection = get_db()

            connection.execute("""
                INSERT INTO feedback
                (
                    user_email,
                    outlet_id,
                    rating,
                    comment,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?)
            """, (
                user["email"],
                outlet_id,
                rating,
                comment,
                datetime.now().isoformat(timespec="seconds")
            ))

            connection.commit()
            connection.close()

            json_response(self, {
                "message": "Thank you for your feedback"
            })
            return

        json_response(self, {"error": "API route not found"}, 404)

    def serve_static_file(self, path):
        if path == "/":
            path = "/index.html"

        requested_file = os.path.normpath(
            os.path.join(STATIC_DIR, path.lstrip("/"))
        )

        if not requested_file.startswith(STATIC_DIR):
            self.send_error(403)
            return

        if not os.path.isfile(requested_file):
            self.send_error(404)
            return

        if requested_file.endswith(".html"):
            content_type = "text/html"
        elif requested_file.endswith(".css"):
            content_type = "text/css"
        elif requested_file.endswith(".js"):
            content_type = "application/javascript"
        elif requested_file.endswith(".png"):
            content_type = "image/png"
        elif requested_file.endswith(".jpg") or requested_file.endswith(".jpeg"):
            content_type = "image/jpeg"
        else:
            content_type = "application/octet-stream"

        with open(requested_file, "rb") as file:
            content = file.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    initialize_database()

    server = HTTPServer((HOST, PORT), KroodHandler)

    print(f"Krood OS running at http://{HOST}:{PORT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Krood OS...")
        server.server_close()