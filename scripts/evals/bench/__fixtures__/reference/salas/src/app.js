"use strict";

const { ROOMS, findRoom } = require("./rooms.js");

function createApp() {
  const bookings = [];
  let sequence = 0;

  const ownRoom = (id, user) => {
    const room = findRoom(id);
    return room && room.tenantId === user.tenantId ? room : null;
  };

  function handle({ method, path, user, body = {} }) {
    if (!user) return { status: 401, body: { error: "unauthenticated" } };

    if (path === "/rooms" && method === "GET") {
      return { status: 200, body: ROOMS.filter((room) => room.tenantId === user.tenantId).map((room) => ({ ...room })) };
    }

    if (path === "/bookings" && method === "POST") {
      const room = ownRoom(body.roomId, user);
      if (!room) return { status: 404, body: { error: "not-found" } };
      const start = Date.parse(body.start);
      const end = Date.parse(body.end);
      if (Number.isNaN(start) || Number.isNaN(end) || start >= end) return { status: 400, body: { error: "invalid-range" } };
      if (bookings.some((booking) => booking.roomId === room.id && booking.startMs < end && start < booking.endMs)) {
        return { status: 409, body: { error: "overlap" } };
      }
      sequence += 1;
      const booking = { id: `b${sequence}`, roomId: room.id, userId: user.id, start: body.start, end: body.end, startMs: start, endMs: end };
      bookings.push(booking);
      return { status: 201, body: view(booking) };
    }

    const listing = /^\/rooms\/([^/]+)\/bookings$/.exec(path);
    if (listing && method === "GET") {
      const room = ownRoom(listing[1], user);
      if (!room) return { status: 404, body: { error: "not-found" } };
      const rows = bookings.filter((booking) => booking.roomId === room.id).sort((a, b) => a.startMs - b.startMs);
      return { status: 200, body: rows.map(view) };
    }

    const match = /^\/rooms\/([^/]+)$/.exec(path);
    if (match && method === "GET") {
      const room = ownRoom(match[1], user);
      if (!room) return { status: 404, body: { error: "not-found" } };
      return { status: 200, body: { ...room } };
    }

    return { status: 404, body: { error: "not-found" } };
  }

  const view = ({ startMs: _start, endMs: _end, ...booking }) => ({ ...booking });

  return { handle };
}

module.exports = { createApp };
