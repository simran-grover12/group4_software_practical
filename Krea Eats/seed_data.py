from database import get_connection, initialize_database

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


if __name__ == "__main__":
    initialize_database()
    seed_outlets()
    print("Database initialized and outlets added.")