"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { paginate } = require("../src/paginate.js");
const { listProducts } = require("../src/catalog.js");

const items = Array.from({ length: 25 }, (_, index) => index + 1);

test("first page", () => {
  const result = paginate(items, 1, 10);
  assert.deepEqual(result.items, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(result.totalPages, 3);
});

test("partial last page", () => {
  assert.deepEqual(paginate(items, 3, 10).items, [21, 22, 23, 24, 25]);
});

test("catalog lists ten products per page", () => {
  assert.equal(listProducts(2).items[0].id, 11);
});
