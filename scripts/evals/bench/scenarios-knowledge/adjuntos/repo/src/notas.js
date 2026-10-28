"use strict";

// Notas de cada usuario. Cada nota pertenece a una sola persona y guarda sus
// adjuntos en `<adjuntosDir>/<id de la nota>/`.
const NOTAS = Object.freeze([
  { id: "n1", owner: "u1", titulo: "Reunión de marzo" },
  { id: "n2", owner: "u2", titulo: "Presupuesto" },
]);

function findNota(id) {
  return NOTAS.find((nota) => nota.id === id) || null;
}

module.exports = { NOTAS, findNota };
