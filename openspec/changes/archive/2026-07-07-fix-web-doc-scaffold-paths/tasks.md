# Tasks: Corregir rutas y import del scaffold web-doc (Opción D)

## Lite Change Contract

- Change class: small
- Behavioral contract: el template fuente de Opción D debe escribir `src/content.config.ts` (no en raíz) con `import { docsLoader } from "@astrojs/starlight/loaders"` (plural), y `astro.config.mjs` debe declarar `redirects: { "/": "/quickstart" }`; docs, spec baseline (vía delta) y test de contrato quedan sincronizados con esa realidad.
- Acceptance checks:
  - Template tiene `src/content.config.ts` (no raíz) con import `@astrojs/starlight/loaders`.
  - `astro.config.mjs` del template define `redirects: { "/": "/quickstart" }`.
  - `node --test scripts/starlight-web-doc-contract.test.js` pasa cubriendo la regresión (ruta + import).
  - Delta spec MODIFIED de REQ-sdd-document-014 existe en la carpeta del change.
- Escalation trigger: si aparece necesidad de rediseñar el scaffold, tocar el sync script, o migrar `web-doc/` ya generados — eso excede "small" y requiere escalar a SDD completo.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~90-120 (2 archivos template pequeños, 1 test, 1 doc, 1 delta spec) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Fix completo: test RED→GREEN, template, docs y delta spec | PR 1 | Todo el diff cabe holgado bajo 400 líneas; maintainer ya aceptó size:exception si hiciera falta. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: RED — Endurecer el test de contrato

- [x] 1.1 En `scripts/starlight-web-doc-contract.test.js`, modificar el test "ships the exact scaffold file set" (~L95-109): reemplazar `"content.config.ts"` por `path.join("src", "content.config.ts")` en `expectedFiles`.
- [x] 1.2 En el mismo archivo, añadir un test nuevo que lea `src/content.config.ts` del template y assert `import.*docsLoader.*@astrojs\/starlight\/loaders` (plural), fallando si el import es `/loader` singular o si el archivo vive en la raíz.
- [x] 1.3 Añadir un test que lea `astro.config.mjs` del template y assert la presencia de `redirects` con la entrada `"/"` → `/quickstart` (o ruta equivalente definida en el proyecto).
- [x] 1.4 Ejecutar `node --test scripts/starlight-web-doc-contract.test.js` y confirmar que los tests 1.1-1.3 FALLAN contra el template actual (RED confirmado antes de tocar el template).

## Phase 2: GREEN — Corregir el template fuente

- [x] 2.1 Mover `skills/sdd-document/assets/web-doc-template/content.config.ts` a `skills/sdd-document/assets/web-doc-template/src/content.config.ts`.
- [x] 2.2 En el archivo movido, corregir el import a `import { docsLoader } from "@astrojs/starlight/loaders";` (plural).
- [x] 2.3 En `skills/sdd-document/assets/web-doc-template/astro.config.mjs`, añadir `redirects: { "/": "/quickstart" }` al objeto pasado a `defineConfig`.
- [x] 2.4 Ejecutar `node --test scripts/starlight-web-doc-contract.test.js` y confirmar GREEN (todos los tests pasan, incluidos los 3 nuevos/modificados de la Fase 1).

## Phase 3: Sincronizar docs y spec

- [x] 3.1 En `skills/sdd-document/references/option-d-starlight.md` §3 (lista de archivos del scaffold, ~L26-31), cambiar `- \`content.config.ts\`` por `- \`src/content.config.ts\`` para reflejar la ubicación correcta.
- [x] 3.2 Crear `openspec/changes/fix-web-doc-scaffold-paths/specs/sdd-document/spec.md` con delta MODIFIED de `REQ-sdd-document-014`: actualizar el file set citado (raíz `content.config.ts` → `src/content.config.ts`) en el cuerpo del requisito (~L317 baseline) y en el escenario "Option D output generated" (~L328 baseline), preservando el resto del texto normativo sin cambios de comportamiento.
- [x] 3.3 Ejecutar `npm test` completo una vez más para confirmar que no se rompió ningún otro test que referencie estas rutas (p. ej. tests de `route-document.md` o `SKILL.md` que citen el file set).

## Phase 4: Cierre

- [x] 4.1 Revisar el diff completo (`git diff`) y confirmar que se mantiene el límite de ~400 líneas y que no se tocó `web-doc/` ya generado ni el sync script.
- [x] 4.2 Actualizar `openspec/changes/fix-web-doc-scaffold-paths/state.yaml` marcando `phases.tasks.status: done` y `status: ready-for-apply` (lo hace este mismo agente al persistir).
