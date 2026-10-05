"use strict";

// Directory of users. Every user belongs to exactly one organization (tenant).
const USERS = Object.freeze([
  { id: "u1", tenantId: "acme", name: "Ana" },
  { id: "u2", tenantId: "acme", name: "Bruno" },
  { id: "u3", tenantId: "acme", name: "Carla" },
  { id: "u9", tenantId: "globex", name: "Zoe" },
]);

function findUser(id) {
  return USERS.find((user) => user.id === id) || null;
}

module.exports = { USERS, findUser };
