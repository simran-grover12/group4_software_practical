from database import get_connection, initialize_database
import json

OUTLETS = [
    (
        "Dining Hall / Mess",
        "Daily campus meals",
        "Indian, Campus Dining",
        "🍛"
    ),
    (
        "Kalai Naturals",
        "Healthy snacks and natural products",
        "Healthy Food",
        "🌱"
    ),
    (
        "Bhagat Ji",
        "Pure vegetarian food",
        "North Indian, Chinese",
        "🥘"
    ),
    (
        "Sweet and Salt Affair",
        "Sweet and savoury snacks",
        "Snacks and Desserts",
        "🍰"
    ),
    (
        "Scoops",
        "Ice cream and cold desserts",
        "Desserts",
        "🍨"
    ),
    (
        "CopaMoca",
        "Pure non-vegetarian menu",
        "Pizza, Burgers, Fast Food",
        "🍕"
    ),
    (
        "Cravory",
        "Quick bites and beverages",
        "Cafe Food",
        "☕"
    )
]


def seed_outlets():
    connection = get_connection()

    for index, outlet in enumerate(OUTLETS):
        connection.execute(
            """
            INSERT OR IGNORE INTO outlets
            (name, description, cuisine_type, image, sort_order)
            VALUES (?, ?, ?, ?, ?)
            """,
            (*outlet, index)
        )

    connection.commit()
    connection.close()


def seed_menus():
    connection = get_connection()

    with open("data/menus.json", "r", encoding="utf-8") as file:
        menus = json.load(file)

    for outlet_name, outlet_data in menus.items():
        outlet = connection.execute(
            "SELECT id FROM outlets WHERE name = ?",
            (outlet_name,)
        ).fetchone()

        if outlet is None:
            continue

        outlet_id = outlet["id"]
        dietary_type = outlet_data.get("dietary_type", "veg")

        for category_name, items in outlet_data["categories"].items():
            connection.execute(
                """
                INSERT INTO menu_categories(outlet_id, name)
                VALUES (?, ?)
                """,
                (outlet_id, category_name)
            )

            category_id = connection.execute(
                "SELECT last_insert_rowid()"
            ).fetchone()[0]

            for item in items:
                if "sizes" in item:
                    for size, price in item["sizes"].items():
                        item_name = f"{item['name']} - {size}"

                        connection.execute(
                            """
                            INSERT INTO menu_items
                            (
                                outlet_id, category_id, name, price,
                                is_available, preparation_time, dietary_type
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                outlet_id,
                                category_id,
                                item_name,
                                price,
                                int(item.get("available", True)),
                                item.get("preparation_time", 15),
                                dietary_type
                            )
                        )
                else:
                    connection.execute(
                        """
                        INSERT INTO menu_items
                        (
                            outlet_id, category_id, name, price,
                            is_available, preparation_time, dietary_type
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            outlet_id,
                            category_id,
                            item["name"],
                            item["price"],
                            int(item.get("available", True)),
                            item.get("preparation_time", 15),
                            dietary_type
                        )
                    )

    connection.commit()
    connection.close()


if __name__ == "__main__":
    initialize_database()
    seed_outlets()
    print("Database initialized and outlets added.")