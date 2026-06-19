# Especificación: agent-shield-security

## Purpose

Esta especificación define el comportamiento de la capacidad "AgentShield Security", la cual se encarga de analizar automáticamente la configuración del arnés y proteger el espacio de trabajo de accesos no autorizados a información sensible por parte del agente. Su fin es evitar la fuga accidental de credenciales, secretos, llaves SSH y tokens de API en las interacciones de herramientas.

## Requirements

### Requirement: Escaneo automático en SessionStart
El sistema MUST inspeccionar el espacio de trabajo en `SessionStart` en busca de archivos de configuración con permisos inseguros o secretos expuestos:
- MUST buscar la existencia de archivos de variables de entorno comunes como `.env`, `.env.local`, `.env.development`, `.npmrc` y verificar si se encuentran listados en el archivo `.gitignore` del proyecto. Si no están ignorados, MUST reportar una alerta de seguridad.
- MUST inspeccionar la configuración local de Git (`.git/config`) en busca de credenciales en texto plano (como contraseñas o tokens en URLs de origen de repositorios).

#### Scenario: Archivos sensibles no ignorados en Git
- GIVEN un espacio de trabajo con un archivo `.env`
- AND el archivo `.env` no está listado en `.gitignore`
- WHEN se ejecuta el hook `SessionStart`
- THEN el resultado de la inicialización MUST incluir una advertencia de seguridad indicando que `.env` está expuesto a Git

#### Scenario: Git config con credenciales en texto plano
- GIVEN un archivo `.git/config` que contiene un URL remoto con credenciales: `https://username:password123@github.com/repo.git`
- WHEN se ejecuta el hook `SessionStart`
- THEN el resultado de la inicialización MUST incluir una advertencia de seguridad indicando que `.git/config` contiene credenciales expuestas

---

### Requirement: Interceptación y bloqueo de lectura de secretos en PreToolUse
El sistema MUST interceptar las llamadas a herramientas que impliquen lectura de archivos (como `view_file`) en `PreToolUse`. Si el archivo solicitado es clasificado como sensible o contiene secretos, el Advisor de Seguridad MUST bloquear la llamada (`deny`) o solicitar aprobación del usuario (`ask`):
- Archivos bloqueados estrictamente (`deny`): claves privadas SSH (`id_rsa`, `id_ecdsa`, `id_ed25519`, etc.), archivos `.git/config` y archivos `.npmrc`.
- Archivos consultados (`ask`): archivos `.env`, `.env.*`, `secrets.json`, `credentials` o cualquier archivo cuyo contenido contenga patrones que parezcan llaves de API (por ejemplo, `AIzaSy...` para Google Cloud o `sk-...` para OpenAI).

#### Scenario: Lectura de clave privada SSH bloqueada
- GIVEN una llamada a la herramienta `view_file` para un archivo con ruta `/home/user/.ssh/id_rsa`
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN el Advisor de Seguridad MUST retornar una decisión de `deny` explicando que las llaves SSH no pueden ser leídas por el agente

#### Scenario: Lectura de archivo .env requiere aprobación
- GIVEN una llamada a la herramienta `view_file` para un archivo con ruta `c:\project\.env`
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN el Advisor de Seguridad MUST retornar una decisión de `ask` indicando que se está intentando leer un archivo de entorno que puede contener credenciales sensibles

---

### Requirement: Desactivación por variable de entorno
El Advisor de Seguridad MUST desactivar todos sus controles si se detecta la variable de entorno `DISABLE_AGENT_SHIELD=true`.

#### Scenario: Bypass de seguridad activo
- GIVEN la variable de entorno `DISABLE_AGENT_SHIELD=true` en el sistema
- WHEN se solicita leer un archivo de clave privada SSH `/home/user/.ssh/id_rsa`
- THEN el hook MUST retornar `allow` de inmediato, omitiendo el control de seguridad
