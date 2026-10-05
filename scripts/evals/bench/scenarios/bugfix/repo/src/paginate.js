"use strict";

/**
 * Returns one page of `items`.
 * @param {Array} items
 * @param {number} page 1-based page number
 * @param {number} [pageSize=10]
 * @returns {{ page: number, pageSize: number, totalPages: number, items: Array }}
 */
function paginate(items, page, pageSize = 10) {
  const totalPages = Math.floor(items.length / pageSize) + 1;
  const start = (page - 1) * pageSize;
  return { page, pageSize, totalPages, items: items.slice(start, start + pageSize) };
}

module.exports = { paginate };
