"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { NOTAS, findNota } = require("./notas.js");

const ADJUNTOS_DIR = path.join(__dirname, "..", "data", "adjuntos");

const json = (status, body) => ({ status, headers: { "content-type": "application/json" }, body });
const NOT_FOUND = json(404, { error: "not-found" });

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

// Manejador con forma HTTP. El gateway autentica y pasa `user` ({ id }); una
// petición sin usuario se rechaza. La nota de otra persona no existe (404).
function createApp({ adjuntosDir = ADJUNTOS_DIR } = {}) {
  function notaDe(user, id) {
    const nota = findNota(decode(id));
    return nota && nota.owner === user.id ? nota : null;
  }

  function handle({ method, path: url, user }) {
    if (!user) return json(401, { error: "unauthenticated" });

    if (url === "/notes" && method === "GET") {
      return json(200, NOTAS.filter((nota) => nota.owner === user.id).map((nota) => ({ ...nota })));
    }

    const lista = /^\/notes\/([^/]+)\/attachments$/.exec(url);
    if (lista && method === "GET") {
      const nota = notaDe(user, lista[1]);
      if (!nota) return NOT_FOUND;
      const dir = path.join(adjuntosDir, nota.id);
      return json(200, fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
    }

    const descarga = /^\/notes\/([^/]+)\/attachments\/([^/]+)$/.exec(url);
    if (descarga && method === "GET") {
      const nota = notaDe(user, descarga[1]);
      if (!nota) return NOT_FOUND;
      const dir = path.join(adjuntosDir, nota.id);
      const nombre = decode(descarga[2]);
      // Solo un fichero que está en la carpeta de la nota: ni rutas ni `..`.
      if (!fs.existsSync(dir) || !fs.readdirSync(dir).includes(nombre)) return NOT_FOUND;
      const fichero = path.join(dir, nombre);
      if (!fs.statSync(fichero).isFile()) return NOT_FOUND;
      return {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${nombre.replace(/["\\]/g, "_")}"`,
        },
        body: fs.readFileSync(fichero),
      };
    }

    return NOT_FOUND;
  }

  return { handle };
}

module.exports = { createApp };
