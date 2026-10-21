# ospec-workflow en 10 minutos — para el reviewer

**La pregunta que respondes aquí: ¿cómo leo un change?**

Hay dos tipos de change. Un change IDD es el caso normal y se lee desde su `state.yaml`. Un change SDD es el modo opcional y se lee desde sus artefactos. Las dos secciones son independientes.

## Un change IDD

Un change IDD vive en `idd/<change>/` mientras está abierto y en `idd/archive/<fecha>-<change>/` una vez cerrado. Lo que lo define es `state.yaml`, que solo escribe el CLI `ospec`. Léelo en este orden.

1. **Intención y aceptación** (`state.yaml` → `intent`). `kind`, `summary` y `acceptance` dicen qué debe cumplirse. Si la petición original era ambigua, `intent.request` la conserva y el gate `ambiguous-intent` tuvo que resolverse con la respuesta del usuario. ¿La aceptación es lo que el negocio necesita? Si no, todo lo demás da igual.
2. **Hechos abiertos y suposiciones** (`facts` y `assumptions`). `facts` recoge las preguntas que se declararon antes de editar. `assumptions` recoge lo que el agente decidió sin preguntar. Cerrar el change no las bloquea, así que pregúntate si alguna debió ser una pregunta.
3. **Señales y plan** (`signals` y `plan`). Cada señal tiene un `reason` y un `source` (`declaration` o `diff`). Las señales son las que activan obligaciones: `bug-fix` pide un test de reproducción, `public-contract` pide contrato y test, `persistent-data` pide migración y test, y `security-boundary` pide revisión de confianza. `retracted` muestra las señales que se retiraron y por qué.
4. **Obligaciones y su evidencia** (`obligations` y `evidence`). Una obligación `satisfied` cita los `evidence` que el CLI grabó al ejecutar algo (`check-run`, `repro-run-pair`, `tdd-red-green`, `frozen-review`...). `runs` guarda cada ejecución observada. Una obligación `withdrawn` tiene `withdrawn_reason`: retirarla es una decisión, así que léela.
5. **Gates** (`gates`). Cada gate resuelto debe llevar la respuesta del usuario en `answer` y su `source`. Un gate abierto bloquea el cierre.
6. **`change.md`** (cuando existe). Trae `Intent and acceptance`, `Plan`, `Decisions` y `Evidence`, en ese orden. Las decisiones de desarrollo viven aquí, no como ADR. La sección `Evidence` la escribe solo el CLI, entre sus marcadores.
7. **El diff**, al final. Con la intención, las señales y la evidencia leídas, revisas el diff contra un contrato y no contra tu intuición.

### Revisión de confianza (solo con señal de frontera de seguridad)

- `state.yaml` → `reviews` guarda cada linaje de revisión, del más antiguo al más nuevo, con sus findings congelados.
- Sin ningún finding `BLOCKER` ni `CRITICAL`, la revisión queda aprobada y se graba `frozen-review`. Si los hay, cabe una sola corrección acotada, que se valida contra esos mismos IDs. Si la validación falla, el linaje termina.
- `ospec review record` rechaza un resultado sin el `request_digest` de la petición o sin citas `ruta:línea` reales de cada ruta revisada. `ospec review validate` exige lo mismo para la corrección: el `request_digest` que devuelve `ospec review correct` y citas de cada ruta corregida en el árbol corregido. La evidencia `frozen-review` lleva `attestation: relayed`: el CLI comprobó esas citas, no que el revisor se ejecutara. La evidencia anterior a esta comprobación no lleva `attestation`.
- En Claude Code y Codex, el hook `SubagentStop` deja en `.ospec/review-receipts/` un recibo del resultado de `review-trust` o `review-correction`. Si el resultado que llega al CLI coincide con el del recibo, la evidencia lleva `attestation: subagent-stop`; si no coincide, se rechaza. Sin recibo se registra `relayed` con un aviso. El recibo no es una prueba: el agente principal puede escribir el mismo fichero.
- Un change tiene como máximo tres revisiones. Al agotarse, el gate `review-limit` pide tu respuesta, y una respuesta autoriza una revisión más.
- Una aprobación caduca si cambia el código revisado: `trust-review` vuelve a `pending`.
- Un change que solo toca documentación no necesita revisión de confianza.

### Qué no tienes que repetir

La máquina ya comprueba que cada obligación tiene evidencia grabada sobre el árbol actual. Tu valor está en lo que la máquina no puede juzgar: si la aceptación es la correcta, si las suposiciones son aceptables, si los findings de la revisión de confianza son reales y si la corrección los resuelve de verdad.

### Señales de alerta en un change IDD

- Un change que no cierra porque `trust-review` sigue en `pending` tras agotar sus revisiones: `ospec check` deja `review-limit` abierto y solo tu respuesta lo desbloquea.
- Una obligación `withdrawn` con un motivo genérico, o una señal `retracted` sin razón clara.
- Una suposición que cambia el comportamiento observable y que debió ser una pregunta.
- Un `impacts` con `amends`, `supersedes` o `contradicts`: el gate `adr-amend-or-contradict` tuvo que resolverse con respuesta del usuario.

## Un change SDD (modo opcional)

Un change SDD vive en `openspec/changes/<change>/`. Léelo en este orden.

1. **`proposal.md`**: intención, alcance y rollback. ¿El problema es el que crees que es?
2. **`specs/{dominio}/spec.md`**: el contrato, con requirements y escenarios Given/When/Then. Si los requirements tienen ids estables (`{#REQ-dominio-NNN}`), el reviewer puede seguirlos hasta las tareas y los tests. Revisa el spec antes que el diff.
3. **`design.md`** y `decisions/` del change: el cómo y el porqué. Si una decisión te chirría, mira primero si ya tiene justificación y alternativas descartadas.
4. **`verify-report.md`**: el veredicto (`PASS`, `PASS WITH WARNINGS` o `FAIL`) y, cuando hay ids de requirement, la Traceability Matrix (REQ → tasks → commits → tests). Un REQ de tipo MUST sin test vinculado sale como WARNING (CRITICAL con Strict TDD).
5. **El diff**, al final.

### Lo que ya ha revisado la máquina

- **Quality Review Gate**: en `state.yaml` → `gates.quality-review-gate`, con sus dominios `trust`, `runtime`, `evolution` y `efficiency`. El gate 4R antiguo (`gates.4r-review-gate`) solo sigue vivo en lineages `schema_version: 1` que ya estaban en curso.
- **TDD estricto** (si está activo): `apply-progress.md` trae una tabla de evidencia con RED, GREEN y REFACTOR por task.
- **Presupuesto de revisión**: el objetivo es ~400 líneas cambiadas por PR. Un PR más grande necesita el label `size:exception` aprobado.

### Señales de alerta en un change SDD

- `verify-report.md` con veredicto `PASS WITH WARNINGS` sin aceptación explícita de los warnings.
- Commits sin trailers `Ospec-Change` / `Ospec-Task` en un repo con `traceability: trailers: required`.
- Un `stale-baseline` (bloqueo del gate de colisión o del archivo): un change archivado cuyo delta pisó un baseline que otro change movió.
