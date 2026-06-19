# Propuesta: git-precommit-hook

**Cambio**: git-precommit-hook
**Clasificación**: normal
**Entrega**: single PR, exception-ok

## Problem Statement

El desarrollador a menudo confía el estado del Spec-Driven Development (SDD) a la interacción dentro del chat del agente. Si hay discrepancias o errores en las especificaciones antes de realizar el commit, estos solo se detectan en la fase de verificación remota o del chat, consumiendo más tiempo y tokens.

Añadir una "Validación Local Pre-Commit" (inspirado en `gga` de Gentle AI) permitirá ejecutar validaciones rápidas sobre el estado de OpenSpec y del repositorio directamente en la máquina del desarrollador local antes de confirmar el commit con Git.

## Goals

1. **Hook Git nativo**: Configurar un script pre-commit instalable que valide la integridad estructural de los cambios de OpenSpec.
2. **Validación de estado**: Comprobar que no existan cambios en el código de producción sin sus correspondientes especificaciones actualizadas o tareas cerradas (según los estándares de Strict TDD y OpenSpec).
3. **Instalación fácil**: Proveer un comando sencillo de configuración (ej. `npm run setup:git-hooks`) para registrarlo de forma idempotente en `.git/hooks/pre-commit`.

## Non-Goals

- Ejecutar la suite completa de pruebas unitarias pesadas o pruebas de integración e2e en el pre-commit si esto incrementa significativamente la latencia del commit.

## Proposed Solution

*(La solución detallada se refinará durante la fase de diseño)*

## Rollback Plan

Eliminar el archivo `.git/hooks/pre-commit` o desvincular el script ejecutor del hook de Git.

## Risk Assessment

| Riesgo | Mitigación |
| --- | --- |
| Bloqueo de commits de emergencia o refactorizaciones rápidas | Permitir el bypass estándar de Git (`git commit --no-verify`) o definir banderas rápidas de omisión. |

## Estimated Changed Lines

~80-120 líneas de código para el script del hook y configuraciones asociadas.
