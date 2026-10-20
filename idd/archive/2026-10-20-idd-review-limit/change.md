# idd-review-limit

## Intent and acceptance

Tras 3 trust reviews un cambio IDD no tiene salida: la spec dice que la persona decide (REQ-idd-016) pero el CLI no ofrece ningún comando, y volver al candidato aprobado no recupera la aprobación

Acceptance: Con 3 de 3 reviews usadas, una decisión explícita del usuario registrada con el CLI permite seguir y cerrar; un árbol que vuelve al último candidato aprobado deja trust-review satisfecha otra vez

## Plan

- `idd-contract.js`: `review-limit` es el quinto gate.
- `idd-review.js`: el límite es 3 más una review por cada `review-limit` resuelto. `ospec check` abre el gate cuando `trust-review` está pendiente tras una review terminal y no quedan reviews. Si el árbol vuelve al candidato de la review aprobada actual, `trust-review` se satisface otra vez con su evidencia `frozen-review`.
- `idd-record.js`: `review-limit` solo lo abre el CLI (`gate-managed-by-review`). Puede repetirse: se responde la entrada abierta o, si no hay ninguna, la última.
- `idd-next.js`: la pregunta del gate.
- Spec REQ-idd-008 (cinco gates) y REQ-idd-016 (límite, gate y restauración), skill `idd` y READMEs.

## Decisions

- La persona autoriza una review más y no acepta un diff sin revisar. Así la única evidencia de `trust-review` sigue siendo una review aprobada (respuesta del usuario en `open-facts`).
- La decisión se registra como un gate y no como una opción de `review start`, de modo que `next` la pide como `resolve-gate` (respuesta del usuario).
- Cada autorización es una entrada propia del gate, con su respuesta y su fuente. El número de entradas resueltas es lo que amplía el límite, sin un contador aparte.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-20T19:53:00.410Z)
- ev-2: check-run for checks-pass (2026-10-20T19:54:57.468Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-20T19:54:57.468Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-20T19:55:40.316Z)
- ev-5: check-run for checks-pass (2026-10-20T19:56:48.055Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-20T19:56:48.055Z)
- ev-7: living-doc-current for living-doc (2026-10-20T19:56:48.141Z)
<!-- ospec:evidence:end -->
