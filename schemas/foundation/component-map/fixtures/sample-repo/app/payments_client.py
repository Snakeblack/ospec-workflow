import json
import urllib.request

PAYMENTS_URL = "https://payments.internal/charge"


def charge(customer, amount):
    body = json.dumps({"customer": customer, "amount": amount}).encode()
    request = urllib.request.Request(PAYMENTS_URL, data=body, method="POST")
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.status == 200
