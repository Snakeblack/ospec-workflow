from app import orders
from app import store


def create_order(request):
    return orders.place(request["customer"], request["items"])


def delete_order(order_id):
    store.delete_order(order_id)
