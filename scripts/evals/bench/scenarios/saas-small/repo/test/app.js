"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../src/app.js");

const ana = { id: "u1", tenantId: "acme" };
const bruno = { id: "u2", tenantId: "acme" };
const zoe = { id: "u9", tenantId: "globex" };

test("owners create, list, read, update, and delete their notes", () => {
  const app = createApp();
  const created = app.handle({ method: "POST", path: "/notes", user: ana, body: { title: "Plan" } });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.deepEqual(app.handle({ method: "GET", path: "/notes", user: ana }).body.map((note) => note.id), [id]);
  assert.equal(app.handle({ method: "PUT", path: `/notes/${id}`, user: ana, body: { title: "Plan B" } }).body.title, "Plan B");
  assert.equal(app.handle({ method: "DELETE", path: `/notes/${id}`, user: ana }).status, 204);
  assert.equal(app.handle({ method: "GET", path: `/notes/${id}`, user: ana }).status, 404);
});

test("other users cannot read a note", () => {
  const app = createApp();
  const { id } = app.handle({ method: "POST", path: "/notes", user: ana, body: { title: "Privada" } }).body;
  assert.equal(app.handle({ method: "GET", path: `/notes/${id}`, user: bruno }).status, 403);
  assert.equal(app.handle({ method: "GET", path: `/notes/${id}`, user: zoe }).status, 404);
  assert.deepEqual(app.handle({ method: "GET", path: "/notes", user: bruno }).body, []);
});

test("requests without user are rejected", () => {
  assert.equal(createApp().handle({ method: "GET", path: "/notes" }).status, 401);
});
