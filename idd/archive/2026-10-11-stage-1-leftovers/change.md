# stage-1-leftovers

## Intent and acceptance

El pre-commit de Strict TDD sigue el modo activo y avisa si la otra fuente contradice; el sucesor de review IDD no pide aprobación.

Acceptance: Un proyecto IDD con strict_tdd true y sin openspec bloquea el commit de producción sin test igual que uno SDD con tdd_mode strict. Si el modo es IDD, strict_tdd false no bloquea aunque openspec diga strict, y el doctor avisa. Sin idd/config.yaml o con mode sdd, solo cuenta tdd_mode. La instalación en un repositorio añade .ospec/ a .gitignore si falta. Un sucesor IDD no pide aprobación; el código sin cambios y el cuarto review se rechazan. createSuccessor de SDD sigue exigiendo aprobación.

## Plan

1. El pre-commit usa una sola fuente según el modo. IDD lee `strict_tdd`. SDD, o un repositorio sin `idd/config.yaml`, lee `testing.tdd_mode: strict`. El doctor avisa cuando la otra fuente existe y contradice, sin cambiar el hook.
2. `.ospec/` se queda. La instalación en un repositorio añade la entrada a `.gitignore` si falta. El doctor avisa solo si la carpeta existe y git no la ignora.
3. `AGENTS.md` separa el sucesor SDD, que sigue exigiendo aprobación, del sucesor IDD, que no la pide y conserva el tope de tres, el código distinto y la corrección única.

## Decisions

- **Modo activo.** Si `idd/config.yaml` existe y `mode` no es `sdd`, el hook usa `strict_tdd`. Si la clave no está, no exige tests. Sin el archivo, o con `mode: sdd`, usa `testing.tdd_mode: strict`. Una configuración IDD ilegible no cae a OpenSpec: el hook no exige tests.
- **Contradicción visible.** El doctor avisa solo cuando la fuente inactiva existe y su booleano estricto difiere del modo activo, y el hook de pre-commit está instalado. Las dos fuentes en `strict`, o las dos apagadas, no avisan.
- **`.ospec/` derivado.** No se mueve. `setup:git-hooks` y la instalación de Codex en un repositorio escriben `.ospec/` en `.gitignore` si ninguna línea ya ignora ese directorio.
- **Sucesor IDD sin aprobación.** La equivalencia con la aprobación de SDD está en el CLI: código distinto, máximo tres reviews, una corrección por review, y ni retry, ni check, ni close restauran el linaje. Un linaje en reconciliación no se sustituye. `createSuccessor` no cambia.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-11T08:29:33.721Z)
- ev-2: frozen-review for trust-review (2026-10-11T08:44:00.001Z)
- ev-3: check-run for checks-pass (2026-10-11T08:45:32.029Z)
- ev-4: living-doc-current for living-doc (2026-10-11T08:45:40.864Z)
<!-- ospec:evidence:end -->
