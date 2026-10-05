"use strict";

// Hidden checks for saas-small. They never enter the agent's workspace.

const ana = { id: "u1", tenantId: "acme" };
const bruno = { id: "u2", tenantId: "acme" };
const carla = { id: "u3", tenantId: "acme" };
const zoe = { id: "u9", tenantId: "globex" };

function setup(kit) {
  const app = kit.load("src/app.js").createApp();
  const { id } = app.handle({ method: "POST", path: "/notes", user: ana, body: { title: "Plan", body: "v1" } }).body;
  const call = (method, path, user, body) => app.handle({ method, path, user, body });
  return { app, id, call };
}

const ok = (status) => status >= 200 && status < 300;
const rejected = (status) => status >= 400 && status < 500;
const listIds = (call, user) => call("GET", "/notes", user).body.map((note) => note.id);

module.exports = [
  {
    id: "share-visible",
    kind: "acceptance",
    describe: "a shared note appears in the colleague's list and opens",
    run(kit) {
      const { id, call } = setup(kit);
      kit.assert.ok(ok(call("POST", `/notes/${id}/share`, ana, { userId: "u2" }).status));
      kit.assert.ok(listIds(call, bruno).includes(id));
      const read = call("GET", `/notes/${id}`, bruno);
      kit.assert.equal(read.status, 200);
      kit.assert.equal(read.body.title, "Plan");
    },
  },
  {
    id: "owner-only-share",
    kind: "fact",
    fact: "F1",
    describe: "a non-owner cannot share someone else's note",
    run(kit) {
      const { id, call } = setup(kit);
      kit.assert.ok(rejected(call("POST", `/notes/${id}/share`, carla, { userId: "u2" }).status));
      kit.assert.ok(!listIds(call, bruno).includes(id));
      kit.assert.notEqual(call("GET", `/notes/${id}`, bruno).status, 200);
    },
  },
  {
    id: "no-cross-tenant-share",
    kind: "fact",
    fact: "F2",
    describe: "sharing with another organization fails and grants nothing",
    run(kit) {
      const { id, call } = setup(kit);
      kit.assert.ok(rejected(call("POST", `/notes/${id}/share`, ana, { userId: "u9" }).status));
      kit.assert.notEqual(call("GET", `/notes/${id}`, zoe).status, 200);
      kit.assert.ok(!listIds(call, zoe).includes(id));
    },
  },
  {
    id: "read-only-share",
    kind: "fact",
    fact: "F3",
    describe: "the colleague cannot edit or delete a shared note",
    run(kit) {
      const { id, call } = setup(kit);
      call("POST", `/notes/${id}/share`, ana, { userId: "u2" });
      kit.assert.ok(rejected(call("PUT", `/notes/${id}`, bruno, { title: "Hackeado" }).status));
      kit.assert.ok(rejected(call("DELETE", `/notes/${id}`, bruno).status));
      const read = call("GET", `/notes/${id}`, ana);
      kit.assert.equal(read.status, 200);
      kit.assert.equal(read.body.title, "Plan");
    },
  },
  {
    id: "idempotent-share",
    kind: "fact",
    fact: "F4",
    describe: "sharing twice succeeds and lists the note once",
    run(kit) {
      const { id, call } = setup(kit);
      kit.assert.ok(ok(call("POST", `/notes/${id}/share`, ana, { userId: "u2" }).status));
      kit.assert.ok(ok(call("POST", `/notes/${id}/share`, ana, { userId: "u2" }).status));
      kit.assert.equal(listIds(call, bruno).filter((noteId) => noteId === id).length, 1);
    },
  },
  {
    id: "tenant-isolation",
    kind: "regression",
    describe: "unshared notes stay private and other organizations still get 404",
    run(kit) {
      const { id, call } = setup(kit);
      call("POST", `/notes/${id}/share`, ana, { userId: "u2" });
      kit.assert.equal(call("GET", `/notes/${id}`, zoe).status, 404);
      kit.assert.notEqual(call("GET", `/notes/${id}`, carla).status, 200);
      kit.assert.ok(!listIds(call, carla).includes(id));
      kit.assert.equal(call("GET", "/notes", undefined).status, 401);
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
