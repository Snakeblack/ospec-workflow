# Propuesta: agent-shield-security

**Cambio**: agent-shield-security
**Clasificación**: normal
**Entrega**: single PR, exception-ok

## Problem Statement

El uso de agentes de desarrollo de software introduce riesgos asociados a la fuga accidental de credenciales (archivos `.env`, claves SSH, tokens de API) y a la ejecución de comandos no sanitizados a través de inyecciones de prompts en dependencias.

Implementar un "Escaneo Automático de Seguridad" (inspirado en ECC / AgentShield) dentro del hook `PreToolUse` y `SessionStart` permitirá escanear el espacio de trabajo activo para interceptar lecturas a archivos sensibles y alertar sobre configuraciones vulnerables o de riesgo del plugin.

## Goals

1. **Escaneo de configuración**: Comprobar en `SessionStart` que no haya archivos de configuración con permisos de escritura inseguros o variables expuestas.
2. **PreToolUse Shielding**: Analizar las llamadas a herramientas que involucren lectura de archivos sensibles o variables de entorno del sistema, pidiendo confirmación explícita o bloqueándolas si contienen secretos.
3. **Sanitización rápida**: Mantener reglas ligeras de patrones regex para contraseñas, claves privadas y tokens de API comunes.

## Non-Goals

- Reemplazar escáneres de seguridad empresariales (como SAST/DAST dedicados). Es un gate enfocado a la protección del entorno de desarrollo local y la interacción del agente.

## Proposed Solution

*(La solución detallada se refinará durante la fase de diseño)*

## Rollback Plan

Desactivar las directivas de seguridad en `PreToolUse` y `SessionStart` revirtiendo los cambios en las reglas del arnés.

## Risk Assessment

| Riesgo | Mitigación |
| --- | --- |
| Falsos positivos bloqueando lecturas legítimas de desarrollo | Incluir mecanismos sencillos de bypass/aprobación por el usuario (ASK) en lugar de bloqueo estricto por defecto (DENY) en casos dudosos. |

## Estimated Changed Lines

~120-180 líneas de código.
