import sqlite3

DB_PATH = "orders.db"


def insert_order(customer, items, total):
    with sqlite3.connect(DB_PATH) as db:
        cursor = db.execute("INSERT INTO orders (customer, total) VALUES (?, ?)", (customer, total))
        return cursor.lastrowid


def delete_order(order_id):
    with sqlite3.connect(DB_PATH) as db:
        db.execute("DELETE FROM orders WHERE id = ?", (order_id,))
