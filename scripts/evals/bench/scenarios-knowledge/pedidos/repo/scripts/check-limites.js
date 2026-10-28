"use strict";

// Fitness function del ADR 0001: ningún módulo de src/domain importa
// infraestructura (src/infra) ni módulos de Node con E/S.

const fs = require("node:fs");
const path = require("node:path");

const PROHIBIDOS = [/(^|\/)infra(\/|$)/, /^(node:)?(fs|net|http|https|http2|child_process|dgram|tls|dns)(\/|$)/];
const IMPORTS = /\brequire\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function ficheros(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return ficheros(ruta);
    return /\.(c|m)?js$/.test(entrada.name) ? [ruta] : [];
  });
}

/** Los imports prohibidos de src/domain, como "<fichero>: <import>". */
function violaciones(raiz) {
  const encontradas = [];
  for (const fichero of ficheros(path.join(raiz, "src", "domain"))) {
    for (const match of fs.readFileSync(fichero, "utf8").matchAll(IMPORTS)) {
      const destino = match[1] || match[2] || match[3];
      const resuelto = destino.startsWith(".")
        ? path.relative(raiz, path.resolve(path.dirname(fichero), destino)).split(path.sep).join("/")
        : destino;
      if (PROHIBIDOS.some((patron) => patron.test(resuelto))) {
        encontradas.push(`${path.relative(raiz, fichero).split(path.sep).join("/")}: ${destino}`);
      }
    }
  }
  return encontradas;
}

if (require.main === module) {
  const encontradas = violaciones(path.join(__dirname, ".."));
  if (encontradas.length > 0) {
    console.error(`El dominio importa infraestructura (ADR 0001):\n${encontradas.join("\n")}`);
    process.exit(1);
  }
  console.log("ADR 0001: el dominio no importa infraestructura.");
}

module.exports = { violaciones };
