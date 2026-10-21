"use strict";

// Directory of meeting rooms. Every room belongs to exactly one organization (tenant).
const ROOMS = Object.freeze([
  { id: "r1", tenantId: "acme", name: "Atlas", seats: 8 },
  { id: "r2", tenantId: "acme", name: "Boreal", seats: 4 },
  { id: "r9", tenantId: "globex", name: "Zenit", seats: 12 },
]);

function findRoom(id) {
  return ROOMS.find((room) => room.id === id) || null;
}

module.exports = { ROOMS, findRoom };
