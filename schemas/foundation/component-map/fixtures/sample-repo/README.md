# Orders

Small internal service that takes orders and charges them.

## Architecture

The HTTP API reads and writes orders only through the orders service.
The store is the single owner of the orders table.
