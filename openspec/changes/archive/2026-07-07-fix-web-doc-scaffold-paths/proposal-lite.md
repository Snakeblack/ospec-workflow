# Proposal Lite: Corregir rutas y import del scaffold web-doc (Opción D)

## Change Class

small

## Intent

El template de scaffold Opción D (OpenWiki + Starlight) que envía este repo genera sitios `web-doc/` que crashean en runtime. Dos defectos de origen: (1) `content.config.ts` va en la RAÍZ del template, pero Astro 5 solo lo lee desde `src/content.config.ts` → la colección `docs` carga sin el schema de Starlight y explota con `Cannot read properties of undefined (reading 'hidden')`; (2) el import es `@astrojs/starlight/loader` (singular) pero el paquete solo exporta `./loaders` (plural) → error de build `Missing "./loader" specifier`. Además, el sitio da 404 en `/` porque no hay index/redirect raíz. Este cambio corrige el template FUENTE, docs, spec baseline y test de contrato para que las generaciones futuras sean correctas.

## Boundaries

- In scope: mover el template a `src/content.config.ts`, arreglar import a `loaders`, añadir `redirects: { "/": "/quickstart" }` en `astro.config.mjs`, actualizar docs/spec/test de contrato en sincronía.
- Out of scope: rediseñar el scaffold, tocar el sync script, o cambiar `web-doc/` ya generados (el usuario ya recibió hot-fix local; el template es copy-if-missing).

## Affected Areas

| Area | Impact | Notes |
|------|--------|-------|
| `skills/sdd-document/assets/web-doc-template/content.config.ts` | Move | → `src/content.config.ts` + import `loaders` (plural) |
| `skills/sdd-document/assets/web-doc-template/astro.config.mjs` | Modify | Añadir redirect `/` → `/quickstart` |
| `skills/sdd-document/references/option-d-starlight.md` | Modify | §3 lista de archivos del scaffold |
| `openspec/specs/sdd-document/spec.md` | Modify (vía delta) | REQ-014 ~L317/L328: `content.config.ts` → `src/content.config.ts` |
| `openspec/changes/fix-web-doc-scaffold-paths/specs/sdd-document/spec.md` | Add | Delta MODIFIED de REQ-014 para que archive sincronice el baseline |
| `scripts/starlight-web-doc-contract.test.js` | Modify | ~L99 ruta esperada + aserción del import `loaders` y placement en `src/` |

## Acceptance Checks

- [ ] El template tiene `src/content.config.ts` (no en raíz) y su import es `@astrojs/starlight/loaders`.
- [ ] `astro.config.mjs` del template define `redirects: { "/": "/quickstart" }`.
- [ ] `node --test scripts/starlight-web-doc-contract.test.js` pasa con la ruta y el import corregidos, cubriendo la regresión.
- [ ] Existe delta spec MODIFIED de REQ-sdd-document-014 en la carpeta del change para que `sdd-archive` propague la corrección al baseline.

## Risks and Rollback

- Risk: Low — cambios acotados a template estático, docs, spec y test; sin runtime de producción. El delta de spec es una corrección de ruta, no un cambio de comportamiento.
- Rollback: revertir el commit; el template es copy-if-missing, así que los `web-doc/` ya generados no se ven afectados.

**Branch advisory:** Antes de que arranque `sdd-apply`, SE DEBERÍA crear una rama de feature siguiendo la convención `<tipo>/<descripción>` del skill `branch-pr` (p. ej. `git checkout -b fix/web-doc-scaffold-paths main`).
