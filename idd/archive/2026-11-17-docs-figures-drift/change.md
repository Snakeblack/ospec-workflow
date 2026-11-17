# docs-figures-drift

## Intent and acceptance

Cifras públicas coherentes con su fuente (gates, targets, revisores), un test que falla si se desfasan, un quickstart en inglés, una sola licencia declarada en todas las skills, el aviso de gentle-ai en NOTICE y el plugin del marketplace con LICENSE y NOTICE, que su manifiesto ya cita (E1.78, R12)

Acceptance: El quickstart y el catálogo del handbook dicen nueve gates como el README; un test nuevo falla si una cifra pública de gates, targets o revisores difiere de catalog.json, de los perfiles de target o de agents/review-*, o si una skill declara otra licencia que MIT AND Commons-Clause; existe docs/en/quickstart.md enlazado desde README.md y docs/en/README.md; NOTICE lleva el aviso MIT de gentle-ai y la lista de skills derivadas; el plugin que construye buildClaudeMarketplace lleva LICENSE y NOTICE en plugins/ospec-workflow/

## Plan

<!-- ospec:plan:start -->
- Files: `NOTICE`, `README.es.md`, `README.md`, `docs/en/README.md`, `docs/en/quickstart.md`, `docs/roadmaps/harness-evolution.md`, `handbook/agentes/catalogo.md`, `handbook/legal/license.md`, `handbook/quickstart.md`, `scripts/configure/claude-marketplace.js`, `scripts/configure/claude-marketplace.test.js`, `scripts/docs-figures.test.js`, `skills`, `skills/accessibility/SKILL.md`, `skills/caveman-compress/SKILL.md`, `skills/skill-creator/SKILL.md`, `skills/stack-angular/SKILL.md`
- Work units: 3
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- LICENSE y NOTICE viajan solo en el plugin del marketplace de Claude (plugins/ospec-workflow/), que es la única distribución que no pasa por un clon del repo: install-target.js copia la raíz de los paquetes de OpenCode y Copilot sobre la raíz del repositorio del usuario y sustituiría su LICENSE (respuesta del usuario)
- Todas las skills declaran MIT AND Commons-Clause; las derivadas de gentle-ai llevan author con los dos nombres y NOTICE conserva su aviso MIT hasta que E1.98 own-skills las reescriba (respuesta del usuario)
- El quickstart en inglés vive en docs/en/quickstart.md fuera del handbook, que sigue en un solo idioma, y sustituye el índice de páginas por enlaces al README y al handbook (respuesta del usuario)
- El test de deriva lee las cifras de su fuente: gates de internal/iddsession/catalog.json, targets de scripts/lib/target-profiles y revisores de agents/review-*.agent.md; recorre README.md, README.es.md, docs/en y handbook salvo historia/, en cifra o palabra, en inglés y en español
- NOTICE lleva una sección por proyecto de origen con su aviso MIT y la lista de skills que conservan su texto: gentle-ai, ECC (affaan-m) y caveman, copiada cuando caveman aún era MIT; las copias llevan author con los nombres de origen y el propio, y las cuatro con origin: ECC solo ganan la licencia (respuesta del usuario)
- La reescritura se parte: E1.98 own-skills reescribe las de gentle-ai justo detrás de E1.78 y E1.99 own-stack-skills las de ECC y caveman, fuera del orden ▶; NOTICE se queda hasta que las dos estén hechas (respuesta del usuario)
- La línea base de contexto sube 12 bytes por target: la línea license de la skill de IDD pasa de Apache-2.0 a MIT AND Commons-Clause, consecuencia de la licencia única que eligió el usuario
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-17T20:04:22.460Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-17T20:17:58.224Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-17T20:18:56.874Z)
- ev-4: check-run for checks-pass (2026-11-17T20:20:54.707Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-17T20:20:54.707Z)
- ev-6: living-doc-current for living-doc (2026-11-17T20:21:18.327Z)
<!-- ospec:evidence:end -->
