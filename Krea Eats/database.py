import sqlite3

DATABASE = "krea_food.db"


def get_connection():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    connection = get_connection()

    with open("schema.sql", "r", encoding="utf-8") as file:
        connection.executescript(file.read())

    connection.commit()
    connection.close()


def query_all(sql, parameters=()):
    connection = get_connection()
    rows = connection.execute(sql, parameters).fetchall()
    connection.close()
    return rows


def query_one(sql, parameters=()):
    connection = get_connection()
    row = connection.execute(sql, parameters).fetchone()
    connection.close()
    return row
