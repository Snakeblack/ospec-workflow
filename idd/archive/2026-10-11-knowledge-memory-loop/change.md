# knowledge-memory-loop

## Intent and acceptance

ADR, TSR, DC y aprendizajes se reflejan en la memoria entre sesiones con procedencia y revisión; al empezar un cambio se recuperan las decisiones previas relacionadas, sin que la memoria sea autoridad ni su caída bloquee (E3.5)

Acceptance: Un cambio nuevo cita una decisión previa relevante encontrada en memoria y la contrasta con el disco; sin memoria, IDD, SDD y foundation se comportan igual

## Plan

1. **Registros al cerrar.** `knowledgeRecords` (puro, `scripts/lib/idd-close.js`) deriva del cambio archivado un registro por decisión de `change.md`, por impacto distinto de `none` y por ADR nuevo adjuntado con `--record`, con `topic` estable, `title`, `summary`, `source`, `change` y `date`; `ospec close` los devuelve en `records` (REQ-idd-024). La CLI no lee ni escribe memoria (ADR 0006).
2. **Protocolo IDD.** `skills/idd/references/memory-loop.md`, cargado bajo demanda: recuperar una vez antes de los open facts, contrastar con el disco y citar en Decisions; guardar los `records` de `close` por `topic`; traspaso del roadmap (movido desde `SKILL.md`). `SKILL.md` apunta a él en la regla 1 y al final.
3. **SDD y foundation.** El addendum de memoria del orquestador guarda las `decisions/dc-NNN.md` archivadas bajo `knowledge/dc/{change}/{NNN}` y recupera al empezar un cambio; foundation guarda cada ADR (`knowledge/adr/NNNN`) y registro tecnológico (`knowledge/tsr/<choice>`). REQ-session-memory-011.
4. **Tests y roadmap.** Unitarios y de CLI de los registros, contrato del protocolo en los 7 targets, hitos del addendum; E3.5 hecho en el roadmap.

## Decisions

- **Decisión previa (memoria):** «ADR 0006 tiene fitness function real: ningún idd-*.js alcanza la detección de memoria; E3.5 debe respetarla» (traspaso `roadmap/next-change`) -> `docs/architecture/decisions/0006-memoria-sin-autoridad.md` y `scripts/lib/memory-boundary.test.js`: current. El ADR declara `- Check: node --test scripts/lib/memory-boundary.test.js` y el test recorre los `require` de cada `idd-*.js`; por eso los registros los deriva la CLI y los guarda el agente, y ningún módulo del motor toca la memoria.
- **Decisión previa (memoria):** «cada modo guarda `team:` en su configuración» (E3.4, ADR 0011) -> `docs/architecture/decisions/0011-modos-sdd-e-idd-separados-en-disco.md`: current. El addendum SDD guarda las DC de `openspec/changes/archive/`, e IDD las de `idd/archive/`; ningún modo lee los artefactos del otro.
- **Respuestas del gate open-facts (usuario, «si, con las recomendadas»):**
  - La CLI deriva qué reflejar (`ospec close --json` → `records`) y el agente solo guarda (ADR 0003).
  - Un registro por DC, por impacto distinto de `none` y por ADR adjuntado; los aprendizajes salen de Decisions, sin sección nueva.
  - Procedencia: ruta, change y fecha de cierre (sin commit, `close` va antes del commit); clave estable `knowledge/adr/<id>`, `knowledge/tsr/<id>`, `knowledge/dc/<change>/<n>` con upsert.
  - Recuperación una vez, tras leer el código y antes de los open facts; cita y contraste en Decisions, nunca en `state.yaml`.
  - Si la memoria contradice el disco, gana el disco: avisar y re-guardar o marcar obsoleto.
  - Cubre IDD, SDD (addendum) y foundation; solo el addendum nombra el producto de memoria. Referencia aparte para la skill `idd`. Minor, un PR.
- **Clave de los impactos:** `knowledge/impact/<change>/<kind>-<id>`. El gate fijó las claves de ADR, TSR y DC; un impacto es una decisión del cambio sobre una referencia, así que queda bajo el cambio y no pisa la entrada del propio ADR.
- **Título de una DC:** la etiqueta en negrita del bullet, o su primera frase, cortada a 80 caracteres con `…`. El resumen es el bullet entero: la memoria guarda un puntero con contexto y la fuente sigue en disco.
- **Las citas de memoria también son registros:** una línea «Decisión previa (memoria)» queda como DC del cambio. Es la revisión de la entrada: fecha en que el disco la confirmó o la contradijo.
- **Presupuesto de la skill `idd`:** el traspaso del roadmap pasa a `references/memory-loop.md`; `SKILL.md` baja de 11 909 a 11 642 bytes con las dos referencias nuevas.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-11T22:25:54.542Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-11T22:25:54.542Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-11T22:25:54.542Z)
- ev-4: check-run for checks-pass (2026-10-11T22:26:28.538Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-10-11T22:26:28.538Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-10-11T22:26:28.538Z)
- ev-7: living-doc-current for living-doc (2026-10-11T22:26:33.467Z)
<!-- ospec:evidence:end -->
