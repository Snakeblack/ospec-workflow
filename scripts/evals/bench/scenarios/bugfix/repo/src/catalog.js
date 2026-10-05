"use strict";

const { paginate } = require("./paginate.js");

const PRODUCTS = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, name: `Producto ${index + 1}` }));

// Used by the shop's product listing: GET /products?page=N
function listProducts(page) {
  return paginate(PRODUCTS, page, 10);
}

module.exports = { listProducts, PRODUCTS };
