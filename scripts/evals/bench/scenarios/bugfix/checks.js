"use strict";

// Hidden checks for bugfix. They never enter the agent's workspace.

const range = (length) => Array.from({ length }, (_, index) => index + 1);
const paginate = (kit, ...args) => kit.load("src/paginate.js").paginate(...args);

module.exports = [
  {
    id: "exact-multiple",
    kind: "acceptance",
    describe: "an exact multiple of the page size has no empty extra page",
    run(kit) {
      const result = paginate(kit, range(20), 2, 10);
      kit.assert.equal(result.totalPages, 2);
      kit.assert.deepEqual(result.items, range(20).slice(10));
      kit.assert.equal(paginate(kit, range(21), 1, 10).totalPages, 3);
    },
  },
  {
    id: "page-below-one",
    kind: "fact",
    fact: "F1",
    describe: "page 0 behaves as page 1 and reports page 1",
    run(kit) {
      const result = paginate(kit, range(25), 0, 10);
      kit.assert.deepEqual(result.items, range(10));
      kit.assert.equal(result.page, 1);
    },
  },
  {
    id: "beyond-last-page",
    kind: "fact",
    fact: "F2",
    describe: "a page past the end is empty and keeps the real page count",
    run(kit) {
      const result = paginate(kit, range(20), 5, 10);
      kit.assert.deepEqual(result.items, []);
      kit.assert.equal(result.totalPages, 2);
    },
  },
  {
    id: "empty-list",
    kind: "fact",
    fact: "F3",
    describe: "an empty list has zero pages",
    run(kit) {
      kit.assert.equal(paginate(kit, [], 1, 10).totalPages, 0);
    },
  },
  {
    id: "invalid-page-size",
    kind: "fact",
    fact: "F4",
    describe: "a page size below one throws RangeError",
    run(kit) {
      kit.assert.throws(() => paginate(kit, range(5), 1, 0), RangeError);
    },
  },
  {
    id: "existing-pages",
    kind: "regression",
    describe: "ordinary pages and the default size are unchanged",
    run(kit) {
      kit.assert.deepEqual(paginate(kit, range(25), 3, 10).items, [21, 22, 23, 24, 25]);
      kit.assert.equal(paginate(kit, range(25), 1).items.length, 10);
      kit.assert.equal(paginate(kit, range(25), 1, 10).totalPages, 3);
      kit.assert.equal(kit.load("src/catalog.js").listProducts(2).items[0].id, 11);
    },
  },
  {
    id: "suite",
    kind: "regression",
    describe: "the project's own test suite passes",
    run(kit) {
      const result = kit.node(["--test"]);
      kit.assert.equal(result.status, 0, result.stdout + result.stderr);
    },
  },
];
