# ADR-002: Política fail-closed estricta ante errores de Git en acceso al índice y escaneo de secretos

- Status: proposed
- Change: precommit-invalidation-and-failclosed
- Date: 2026-09-04

## Context
`getStagedFiles` retornaba un arreglo vacío `[]` y `getStagedContent` retornaba `null` cuando los comandos de Git (`git diff --cached`, `git show :<path>`) fallaban o eran interrumpidos. Además, `pre-commit-hook.js` silenciaba excepciones de lectura en el escaneo de secretos mediante bloques catch vacíos (`continue`), permitiendo commits inadvertidos con secretos o código roto cuando Git o el entorno fallaban (comportamiento fail-open).

## Decision
Establecer una política fail-closed estricta en toda la cadena de pre-commit:
1. `getStagedFiles`: lanzar un `Error` explicativo ante código de retorno distinto de cero o fallos de spawn en `git diff --cached`.
2. `getStagedContent`: lanzar un `Error` explicativo ante argumentos de ruta inválidos, código de retorno no nulo o fallos de ejecución en `git show :<path>`, eliminando el retorno de `null` silencioso.
3. `pre-commit-hook.js`: capturar fallos de extracción de blobs durante el escaneo de secretos y abortar inmediatamente con código 1, mostrando el banner `"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"` y detallando los bypasses de emergencia explícitos (`DISABLE_AGENT_SHIELD=true`, `git commit --no-verify`).
4. Strict TDD: abortar con código 1 si `git diff --cached` falla al verificar archivos de producción preparados.

## Alternatives
- Mantener fail-open con logging de advertencias (`console.warn`): rechazada porque permite eludir inadvertidamente la detección de secretos y la validación de sintaxis ante fallos transitorios del entorno.
- Reintentar comandos de Git antes de fallar: rechazada por añadir latencia y complejidad sin resolver fallos deterministas como blobs corruptos o índices bloqueados.

## Consequences
- Facilidad: Previene commits ciegos cuando el índice de Git está corrupto o inaccesible; asegura que ningún secreto se confirme sin inspección previa.
- Sobrecarga: Los fallos de entorno local bloquearán el commit hasta resolverse o requerirán bypass deliberado (`--no-verify` o env var).
- Reversibilidad: Alta; controlada centralizadamente en `staged-validator.js` y `pre-commit-hook.js`.
