"use strict";

// Hidden checks for salas, the reserved scenario (OSP-011). They never enter
// the agent's workspace.

const ana = { id: "u1", tenantId: "acme" };
const bruno = { id: "u2", tenantId: "acme" };
const zoe = { id: "u9", tenantId: "globex" };

const at = (hour) => `2026-11-03T${String(hour).padStart(2, "0")}:00:00Z`;

function setup(kit) {
  const app = kit.load("src/app.js").createApp();
  const call = (method, path, user, body) => app.handle({ method, path, user, body });
  const book = (user, roomId, from, to) => call("POST", "/bookings", user, { roomId, start: at(from), end: at(to) });
  return { call, book };
}

const ok = (status) => status >= 200 && status < 300;
const listStarts = (call, user, roomId) => call("GET", `/rooms/${roomId}/bookings`, user).body.map((booking) => Date.parse(booking.start));

module.exports = [
  {
    id: "book-and-list",
    kind: "acceptance",
    describe: "a booking appears in the room's bookings for the whole organization",
    run(kit) {
      const { call, book } = setup(kit);
      kit.assert.ok(ok(book(ana, "r1", 10, 11).status));
      const listed = call("GET", "/rooms/r1/bookings", bruno);
      kit.assert.equal(listed.status, 200);
      kit.assert.deepEqual(listStarts(call, bruno, "r1"), [Date.parse(at(10))]);
    },
  },
  {
    id: "no-overlap",
    kind: "fact",
    fact: "F1",
    describe: "an overlapping booking of the same room fails with 409 and is not stored, a back-to-back one succeeds",
    run(kit) {
      const { call, book } = setup(kit);
      kit.assert.ok(ok(book(ana, "r1", 10, 12).status));
      kit.assert.equal(book(bruno, "r1", 11, 13).status, 409);
      kit.assert.equal(book(bruno, "r1", 9, 13).status, 409);
      kit.assert.ok(ok(book(bruno, "r1", 12, 13).status));
      kit.assert.ok(ok(book(bruno, "r2", 10, 12).status), "another room is free at the same time");
      kit.assert.deepEqual(listStarts(call, ana, "r1"), [Date.parse(at(10)), Date.parse(at(12))]);
    },
  },
  {
    id: "own-tenant-rooms",
    kind: "fact",
    fact: "F2",
    describe: "a room of another organization is missing (404) and gets no booking",
    run(kit) {
      const { call, book } = setup(kit);
      kit.assert.equal(book(ana, "r9", 10, 11).status, 404);
      kit.assert.equal(call("GET", "/rooms/r9/bookings", ana).status, 404);
      kit.assert.deepEqual(listStarts(call, zoe, "r9"), []);
    },
  },
  {
    id: "start-before-end",
    kind: "fact",
    fact: "F3",
    describe: "a booking whose start is not before its end fails with 400 and is not stored",
    run(kit) {
      const { call, book } = setup(kit);
      kit.assert.equal(book(ana, "r1", 11, 10).status, 400);
      kit.assert.equal(book(ana, "r1", 10, 10).status, 400);
      kit.assert.deepEqual(listStarts(call, ana, "r1"), []);
    },
  },
  {
    id: "sorted-by-start",
    kind: "fact",
    fact: "F4",
    describe: "the room's bookings come ordered by start, earliest first",
    run(kit) {
      const { call, book } = setup(kit);
      book(ana, "r1", 15, 16);
      book(bruno, "r1", 9, 10);
      book(ana, "r1", 12, 13);
      kit.assert.deepEqual(listStarts(call, ana, "r1"), [9, 12, 15].map((hour) => Date.parse(at(hour))));
    },
  },
  {
    id: "rooms-isolation",
    kind: "regression",
    describe: "room listings and reads stay per organization and anonymous requests get 401",
    run(kit) {
      const { call } = setup(kit);
      kit.assert.deepEqual(call("GET", "/rooms", ana).body.map((room) => room.id), ["r1", "r2"]);
      kit.assert.equal(call("GET", "/rooms/r1", zoe).status, 404);
      kit.assert.equal(call("GET", "/rooms", undefined).status, 401);
      kit.assert.equal(call("POST", "/bookings", undefined, { roomId: "r1", start: at(10), end: at(11) }).status, 401);
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
