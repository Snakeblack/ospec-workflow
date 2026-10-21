"use strict";

const { ROOMS, findRoom } = require("./rooms.js");

// HTTP-shaped handler. The gateway authenticates and passes `user`
// ({ id, tenantId }); a request without user is rejected.
// Tenant isolation: a room from another organization is reported as missing (404).
function createApp() {
  function handle({ method, path, user }) {
    if (!user) return { status: 401, body: { error: "unauthenticated" } };

    if (path === "/rooms" && method === "GET") {
      return { status: 200, body: ROOMS.filter((room) => room.tenantId === user.tenantId).map((room) => ({ ...room })) };
    }

    const match = /^\/rooms\/([^/]+)$/.exec(path);
    if (match && method === "GET") {
      const room = findRoom(match[1]);
      if (!room || room.tenantId !== user.tenantId) return { status: 404, body: { error: "not-found" } };
      return { status: 200, body: { ...room } };
    }

    return { status: 404, body: { error: "not-found" } };
  }

  return { handle };
}

module.exports = { createApp };
