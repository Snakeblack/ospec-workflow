# non-git-workspace

## Intent and acceptance

IDD solo dentro de un proyecto: un work tree git cuyo toplevel no es $HOME ni /. Fuera, el router manda trabajo directo; pedir un proyecto sin git lleva a montar el repositorio (git init -b main aquí o en <nombre>/, commit base con aprobación para código existente). La CLI se detiene en record intent y next fuera de git (not-a-git-repo, git-not-found).

Acceptance: El router de los 7 targets dice que fuera de un proyecto se trabaja directo y que pedir un proyecto lleva a montar el repositorio; en un directorio sin git, record intent y next terminan con not-a-git-repo y el siguiente paso sin crear nada en idd/; sin git instalado, git-not-found; un git init -b main sin commits llega hasta close; dentro de un repositorio nada cambia; el always-on sigue por debajo de 4096 bytes.

## Plan

1. CLI (`scripts/ospec.js`, `scripts/lib/idd-workspace.js`): `requireWorkTree` distingue `git-not-found` (ENOENT) de `not-a-git-repo` y lleva un `how`; `record intent` y `next` lo llaman antes de leer o escribir `idd/`; el error JSON y el de texto imprimen el `how`. Un cambio con `base: null` compara su diff con el árbol vacío (`diffBase`), y `readGitDiff` acepta ese árbol como base.
2. Router y protocolo (`rules/ospec-router.instructions.md`, `skills/idd/SKILL.md`, `skills/idd/references/repository.md`): definición de proyecto, trabajo directo fuera de uno, montaje del repositorio bajo demanda.
3. Contrato y tests: REQ-idd-011 y REQ-idd-014 en `openspec/specs/idd/spec.md`, REQ-generator-024 en `openspec/specs/generator/spec.md`; `scripts/ospec.test.js` (raíces con git por defecto y `plainRoot` para fuera de git) y `scripts/configure/idd-protocol.test.js` en los 7 targets; `scripts/configure/real-repo.test.js` e `install-codex.test.js` ejecutan `ospec next` dentro de un `git init -b main`.
4. Presupuesto: techos de `scripts/fixtures/context-baseline.json` con `--update` (always-on 3625–3957 B).
5. Documentación: roadmap (E4.8 hecho, E4.11 nuevo), `README.md`, `docs/README.md`, `docs/target-capabilities.md`.

## Decisions

- Decisiones del usuario (2026-10-13): un proyecto es un work tree git cuyo toplevel no es `$HOME` ni `/`; fuera, trabajo directo; una petición de proyecto ofrece `git init -b main` aquí o en `<nombre>/`; commit base de código existente solo con aprobación y tras revisar `.gitignore`; una pregunta si la intención es ambigua; `main` solo en repositorios nuevos; la raíz desde un subdirectorio pasa a E4.11.
- Open facts (respuesta del usuario: «si acepto»): la regla de `$HOME` y `/` vive solo en el router; `next` se niega siempre fuera de git y `status` sigue funcionando; solo `record intent` y `next` se añaden a `check` y `close` como comandos que se detienen; el error lleva `how`; el detalle va en `references/repository.md`; los techos del fixture suben sin pasar de 4096.
- Fallo encontrado durante el cambio: en un repositorio sin commits, `check` fallaba con `unknown-base: HEAD`, justo el camino que recomienda el router. Se corrige con el árbol vacío como base cuando `base` es `null`, para que los commits hechos durante el cambio sigan en su diff.
- `--update` del fixture también baja 45 B los techos de los revisores `review-*`, que ya medían menos; un ratchet que baja no necesita justificación.
- Comprobado en `~`: `ospec next` termina con `not-a-git-repo` y el `how`, y `ospec status` sigue listando `monitor-pbp-toggle`.
- Los tests de la CLI pasan a crear un repositorio sin commits en cada raíz temporal (`tempRoot`), porque un cambio ya no se abre fuera de git; las pruebas de fuera de git usan `plainRoot` o borran `.git` tras abrir el cambio.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: adr-impact-declaration for adr-impact-declaration (2026-10-13T16:58:42.874Z)
- ev-2: check-run for checks-pass (2026-10-13T17:00:04.731Z)
- ev-3: contract-spec-and-test for contract-spec-and-test (2026-10-13T17:00:04.731Z)
- ev-4: adr-impact-declaration for adr-impact-declaration (2026-10-13T17:00:04.731Z)
- ev-5: living-doc-current for living-doc (2026-10-13T17:00:16.063Z)
<!-- ospec:evidence:end -->
