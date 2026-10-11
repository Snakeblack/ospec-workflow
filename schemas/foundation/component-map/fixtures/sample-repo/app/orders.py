from app import payments_client
from app import store


def place(customer, items):
    total = sum(item["price"] for item in items)
    payments_client.charge(customer, total)
    return store.insert_order(customer, items, total)
