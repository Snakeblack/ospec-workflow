# delivery-release-changelog

## Intent and acceptance

Opción de changelog y de cadencia de release en la sección delivery de idd/config.yaml, con recomendación por perfil; el flujo IDD deja la entrada del cambio en el changelog y propone la release con su versión, su tag y sus notas

Acceptance: Con la opción declarada, un cambio cerrado deja su entrada en el changelog del proyecto y la release se propone con su versión, su tag y sus notas, y solo se hace con el OK del usuario; ospec team da cada opción con su origen y sus motivos; un valor inválido se rechaza con config-invalid; sin declarar nada, close no escribe nada y next solo sugiere sin bloquear

## Plan

1. **CLI y contrato.**
   - `scripts/lib/team-profile.js`: `changelog` y `release` en los defaults por tamaño (`solo` → `CHANGELOG.md` + `per-change`; `small` y `multi-team` → `CHANGELOG.md` + `batched`), sus motivos y sus reglas, y `resolveDelivery`, que resuelve las tres claves de `delivery` (declarado > perfil > recomendado).
   - `scripts/lib/idd-config.js`: `delivery.changelog` (ruta relativa dentro del proyecto o `none`) y `delivery.release` (`per-change`, `batched` o `none`), validados con `config-invalid`.
   - `scripts/lib/idd-changelog.js` (nuevo, puro): la entrada del cambio, su inserción bajo `## [Unreleased]` y la release propuesta.
   - `scripts/lib/idd-next.js`: sugerencias `changelog-undeclared` y `release-undeclared` en `declare-plan` y `close`.
   - `scripts/ospec.js`: `close` escribe la entrada y devuelve `changelog` y `release`; `team` y `next` muestran las opciones nuevas.
   - REQ-idd-025 nuevo, y REQ-idd-013, REQ-idd-017 y REQ-idd-023 en `openspec/specs/idd/spec.md`.
   - `scripts/lib/k1-scope-guard.test.js`: el módulo nuevo entra en la lista de sucesores K2, como los demás `idd-*`.
2. **Skill, repo y roadmap.**
   - `skills/idd/SKILL.md` (Delivery): el changelog que escribe `close`, las sugerencias y la release con el OK del usuario.
   - `idd/config.yaml` declara `changelog: CHANGELOG.md` y `release: per-change`; AGENTS.md mueve la línea de `close` bajo la versión en el commit de release.
   - Roadmap: E3.9 hecho; sigue el bloque A.

## Decisions

Prior decision (memory): «Política de ramas/PRs y changelog como opción del harness» -> idd/archive/2026-10-25-delivery-branching/change.md: current.

Decisiones del usuario del 2026-10-25 (gate `open-facts`, todas las recomendadas):

- `delivery.changelog` (ruta o `none`) y `delivery.release` (`per-change`, `batched` o `none`). `solo` recomienda `CHANGELOG.md` y `per-change`; `small` y `multi-team`, `CHANGELOG.md` y `batched`. Este repositorio declara `CHANGELOG.md` y `per-change`.
- El perfil solo recomienda: hasta que se declaren, `next` sugiere sin bloquear y `close` no escribe nada.
- `ospec close` escribe la entrada bajo `## [Unreleased]` una sola vez, y crea el fichero o la sección si faltan.
- Todos los tipos dejan entrada: `feature` → `Added`, `bug` → `Fixed`, `refactor` y `docs` → `Changed`, con la línea `- <summary> (<change-id>)`.
- Con `per-change`, `close` propone la última versión subida un minor si `[Unreleased]` tiene `Added` y si no un patch, nunca un major, con el tag `v<versión>` y las notas de `[Unreleased]`; con `batched` no propone. La release se hace solo con el OK del usuario.

Decisiones de desarrollo:

- **A diferencia del branching, el perfil no basta para que `close` actúe.** El branching es solo guía, pero el changelog escribe un fichero del proyecto: un proyecto con perfil que lleva su changelog con otra herramienta no debe encontrarse un `CHANGELOG.md` nuevo. Por eso las sugerencias salen también con perfil, mientras falte la declaración.
- **`close` valida antes de escribir.** Llama a `closeChange` sobre el estado leído, que rechaza lo pendiente sin escribir nada, luego escribe la entrada y por último marca el cambio cerrado. Si se interrumpe después de escribir, el siguiente `close` no la duplica, porque una línea que el fichero ya tiene no se añade.
- **Una configuración ilegible rechaza el primer `close` y se ignora en los siguientes.** El primero escribiría según ella; repetir `close` sobre un cambio archivado solo informa, como `next` con una configuración ilegible.
- **La ruta del changelog es relativa y sin `..`.** `close` la escribe, así que una ruta absoluta o que sale del proyecto se rechaza con `config-invalid`.
- **La release sale del changelog.** La versión es la última cabecera `## [x.y.z]` bajo `[Unreleased]`. Con una versión previa con sufijo (`-rc.1`) o sin versión previa, `version` y `tag` son null y el agente pregunta. Sin changelog declarado, `per-change` devuelve la release con todos los campos a null.
- **`describeBranching` pasa a `describeOption`.** Las tres claves de `delivery` se describen igual en `next` y `team`, y la salida del branching no cambia.
- **Las señales `public-contract`, `persistent-data` y `adr-or-quality-attribute` se cumplen, no se retiran.** El contrato es REQ-idd-025 con sus tests, y las ADR del componente se declaran una a una. `persistent-data` es real: `idd/config.yaml` gana dos claves y `close` escribe en el changelog del proyecto. Es aditivo: sin las claves nada cambia, un ospec anterior las rechaza con `config-invalid` y `close` solo inserta una línea. Rollback: quitar las claves.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: migration-test for migration-compat-and-test (2026-10-25T20:31:43.547Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-10-25T20:32:50.464Z)
- ev-3: check-run for checks-pass (2026-10-25T20:34:17.995Z)
- ev-4: contract-spec-and-test for contract-spec-and-test (2026-10-25T20:34:17.995Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-10-25T20:34:17.995Z)
- ev-6: migration-test for migration-compat-and-test (2026-10-25T20:34:27.444Z)
- ev-7: living-doc-current for living-doc (2026-10-25T20:34:36.755Z)
<!-- ospec:evidence:end -->
