"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createApp } = require("../src/app.js");

const ana = { id: "u1" };
const bruno = { id: "u2" };

function adjuntos() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adjuntos-"));
  fs.mkdirSync(path.join(dir, "n1"));
  fs.writeFileSync(path.join(dir, "n1", "orden del día.txt"), "Orden del día\n");
  fs.writeFileSync(path.join(dir, "n1", "acta.txt"), "Acta\n");
  return dir;
}

test("cada usuario ve solo sus notas", () => {
  const app = createApp({ adjuntosDir: adjuntos() });
  assert.deepEqual(app.handle({ method: "GET", path: "/notes", user: ana }).body.map((nota) => nota.id), ["n1"]);
  assert.deepEqual(app.handle({ method: "GET", path: "/notes", user: bruno }).body.map((nota) => nota.id), ["n2"]);
});

test("el dueño lista los adjuntos de su nota y nadie más", () => {
  const app = createApp({ adjuntosDir: adjuntos() });
  assert.deepEqual(app.handle({ method: "GET", path: "/notes/n1/attachments", user: ana }).body, ["acta.txt", "orden del día.txt"]);
  assert.equal(app.handle({ method: "GET", path: "/notes/n1/attachments", user: bruno }).status, 404);
});

test("las peticiones sin usuario se rechazan", () => {
  assert.equal(createApp({ adjuntosDir: adjuntos() }).handle({ method: "GET", path: "/notes" }).status, 401);
});
