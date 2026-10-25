# delivery-branching

## Intent and acceptance

Opción delivery.branching (serial | parallel) en idd/config.yaml: el perfil de equipo recomienda un valor con sus motivos y ospec next y ospec team la exponen con sus reglas

Acceptance: ospec team y ospec next --change <id> devuelven branching con value, source (idd/config.yaml, perfil o recomendación) y reasons; un valor fuera de serial|parallel se rechaza con config-invalid; sin declarar, next añade una sugerencia no bloqueante con el valor recomendado; la skill IDD y branch-pr describen las reglas de cada valor; este repo declara serial y AGENTS.md recoge lo propio del repo

## Plan

1. **CLI y contrato.**
   - `scripts/lib/team-profile.js`: `branching` en los defaults por tamaño (`solo` → `serial`; `small` y `multi-team` → `parallel`), los motivos y las reglas de cada valor, y `resolveBranching` en `resolveTeam` (declarado > perfil > recomendado).
   - `scripts/lib/idd-config.js`: sección `delivery` con la única clave `branching`, validada con `config-invalid`.
   - `scripts/lib/idd-next.js`: `delivery` en `declare-plan` y `close`, y la sugerencia `branching-undeclared` con origen `recommended`.
   - `scripts/ospec.js`: una lectura de la configuración para `team` y `delivery`, y las líneas `branching` de `next` y `team` en texto.
   - REQ-idd-013 y REQ-idd-023 en `openspec/specs/idd/spec.md`, con dos escenarios, y la fila «Branching policy» de §6a.2 en `openspec/specs/skills/spec.md`.
2. **Skills, repo y roadmap.**
   - `skills/idd/SKILL.md` (Delivery) y `skills/branch-pr/SKILL.md` (Multi-Developer Collaboration) remiten al branching del CLI.
   - `idd/config.yaml` declara `delivery.branching: serial` y AGENTS.md lo enlaza.
   - Roadmap: E3.8 (este cambio) y E3.9 `delivery-release-changelog`, que va antes del bloque A.

## Decisions

Prior decision (memory): «Política de ramas/PRs y changelog como opción del harness» -> idd/archive/2026-10-25-delivery-order/: current.

Decisiones del usuario del 2026-10-25 (gate `open-facts`, todas las recomendadas):

- El control de ramas y PRs es una opción del harness, no solo una instrucción del repo. Este repositorio usa `serial`.
- Valores `serial` y `parallel`; no hay `trunk`.
- Sin declarar, `ospec next` lo sugiere sin bloquear. El agente lo propone una vez y escribe la opción solo con aprobación.
- Solo guía: el CLI no inspecciona git ni las PRs.
- El changelog y las releases van en el change siguiente (E3.9), no en este.

Decisiones de desarrollo:

- **`delivery` es una sección propia, no una clave de `team`.** El perfil son hechos del equipo (REQ-idd-023 rechaza otras claves en `team`), y el branching es una elección que gana al perfil, como `strict_tdd`. La sección deja sitio a E3.9 sin cambiar su forma.
- **`delivery` sale solo en `declare-plan` y `close`.** Son los dos pasos donde el branching decide algo (empezar la rama y entregar). Mientras se construye no añade tokens a cada `next`, algo que E4.16 vigila.
- **Con perfil no hay sugerencia.** El perfil ya es una declaración del usuario y sus defaults se aplican sin preguntar, como `delivery_strategy`. Solo sin perfil ni `delivery.branching` el valor es una recomendación.
- **SDD no lee `delivery`** (ADR 0011). `ospec team --mode sdd` da el branching del perfil de `openspec/config.yaml` o el recomendado.
- **La señal `persistent-data` se cumple, no se retira.** La deriva el contenido de `scripts/ospec.js`, que ya escribía, pero el cambio sí amplía un formato persistente: `idd/config.yaml` admite `delivery`. Es aditivo: una configuración sin `delivery` se lee igual, y un ospec anterior rechaza una con `delivery` con `config-invalid` en vez de malinterpretarla. Rollback: quitar la sección.
- **`branch-pr` conserva el título `## Multi-Developer Collaboration`**, porque §6a.2 de la spec de skills lo exige. La regla «rebase feature branches regularly» chocaba con los hooks, que deniegan el force-push: queda en rebasar solo una rama no subida e integrar con merge una vez subida.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-10-25T15:34:00.137Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-10-25T15:34:00.137Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-10-25T15:34:00.137Z)
- ev-4: migration-test for migration-compat-and-test (2026-10-25T15:34:43.270Z)
- ev-5: living-doc-current for living-doc (2026-10-25T15:34:51.677Z)
<!-- ospec:evidence:end -->
