"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../src/app.js");

const ana = { id: "u1", tenantId: "acme" };
const zoe = { id: "u9", tenantId: "globex" };

test("users list and read the rooms of their organization", () => {
  const app = createApp();
  assert.deepEqual(app.handle({ method: "GET", path: "/rooms", user: ana }).body.map((room) => room.id), ["r1", "r2"]);
  assert.equal(app.handle({ method: "GET", path: "/rooms/r1", user: ana }).body.name, "Atlas");
});

test("rooms of another organization are missing", () => {
  const app = createApp();
  assert.equal(app.handle({ method: "GET", path: "/rooms/r1", user: zoe }).status, 404);
  assert.deepEqual(app.handle({ method: "GET", path: "/rooms", user: zoe }).body.map((room) => room.id), ["r9"]);
});

test("requests without user are rejected", () => {
  assert.equal(createApp().handle({ method: "GET", path: "/rooms" }).status, 401);
});
