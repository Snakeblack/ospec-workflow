"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { NOTAS, findNota } = require("./notas.js");

const ADJUNTOS_DIR = path.join(__dirname, "..", "data", "adjuntos");

const json = (status, body) => ({ status, headers: { "content-type": "application/json" }, body });

// Manejador con forma HTTP. El gateway autentica y pasa `user` ({ id }); una
// petición sin usuario se rechaza. La nota de otra persona no existe (404).
function createApp({ adjuntosDir = ADJUNTOS_DIR } = {}) {
  function handle({ method, path: url, user }) {
    if (!user) return json(401, { error: "unauthenticated" });

    if (url === "/notes" && method === "GET") {
      return json(200, NOTAS.filter((nota) => nota.owner === user.id).map((nota) => ({ ...nota })));
    }

    const lista = /^\/notes\/([^/]+)\/attachments$/.exec(url);
    if (lista && method === "GET") {
      const nota = findNota(decodeURIComponent(lista[1]));
      if (!nota || nota.owner !== user.id) return json(404, { error: "not-found" });
      const dir = path.join(adjuntosDir, nota.id);
      return json(200, fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
    }

    return json(404, { error: "not-found" });
  }

  return { handle };
}

module.exports = { createApp };
