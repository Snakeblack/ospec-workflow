# ADR-001: Lectura de blobs desde Git index mediante `git show :<path>` con normalización POSIX

- Status: proposed
- Change: fast-precommit-remediation
- Date: 2026-09-04

## Context

El hook pre-commit validaba archivos leyendo del working tree (`fs.readFileSync`) en vez del índice de Git (`staged`). Esto permitía confirmar archivos con errores sintácticos o secretos si el working tree se limpiaba tras hacer `git add`, y bloqueaba commits válidos si existían cambios rotos sin preparar.

## Decision

Extraer el contenido de los archivos preparados directamente desde el índice de Git mediante `git show :<path>` ejecutado con `spawnSync` (`shell: false`, UTF-8) y normalizando obligatoriamente la ruta relativa a formato POSIX con separadores `/`.

## Alternatives

- `git checkout-index` a directorio temporal: I/O innecesario en disco y complejidad de limpieza de temporales.
- `git stash --keep-index`: Alto riesgo de pérdida de datos o conflictos al hacer pop si el proceso aborta.
- `fs.readFileSync` (estado anterior): Falla fundamental de corrección para escenarios de staging parcial.

## Consequences

Mayor precisión: se valida exactamente el contenido que se confirmará en el commit con ejecución ultrarrápida en memoria (<5ms). Requiere normalizar barras invertidas de Windows a slashes POSIX. Reversibilidad alta.
