"use strict";

function paginate(items, page, pageSize = 10) {
  if (!(pageSize >= 1)) throw new RangeError("pageSize must be at least 1");
  const current = page >= 1 ? page : 1;
  const totalPages = Math.ceil(items.length / pageSize);
  const start = (current - 1) * pageSize;
  return { page: current, pageSize, totalPages, items: items.slice(start, start + pageSize) };
}

module.exports = { paginate };
