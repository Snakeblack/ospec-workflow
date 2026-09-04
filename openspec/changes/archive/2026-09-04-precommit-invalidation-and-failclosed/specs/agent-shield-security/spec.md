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
El Advisor de Seguridad MUST desactivar todos sus controles si se detecta la variable de entorno `DISABLE_AGENT_SHIELD=true`:
- En `PreToolUse`, MUST omitir la interceptación y retornar `allow` de inmediato sin consultar al usuario.
- En `SessionStart`, MUST omitir las advertencias sobre archivos no ignorados o credenciales en configuración local.
- En el hook pre-commit de Git, MUST omitir por completo el escaneo de archivos sensibles y secretos en blobs preparados, permitiendo continuar con las restantes validaciones del commit.

#### Scenario: Bypass de seguridad activo
- GIVEN la variable de entorno `DISABLE_AGENT_SHIELD=true` en el sistema
- WHEN se solicita leer un archivo de clave privada SSH `/home/user/.ssh/id_rsa`
- THEN el hook MUST retornar `allow` de inmediato, omitiendo el control de seguridad

#### Scenario: Bypass del escaneo preventivo en pre-commit
- GIVEN la variable de entorno `DISABLE_AGENT_SHIELD=true` en el sistema
- AND un archivo clasificado como sensible (`.env`) o con una clave de API preparado en el índice de Git
- WHEN se ejecuta el hook pre-commit
- THEN el escaneo de seguridad de AgentShield se omite y no bloquea la confirmación del commit.

---

### Requirement: Escaneo preventivo de secretos en pre-commit sobre blobs del índice de Git {#REQ-agent-shield-security-001}
El sistema AgentShield en el hook pre-commit MUST inspeccionar preventivamente todos los archivos preparados en el índice de Git (`staged`) para impedir la confirmación de credenciales o archivos sensibles, aplicando un comportamiento fail-closed ante errores de lectura:
- MUST obtener la lista de archivos preparados mediante `git diff --cached --name-only --diff-filter=ACMR`.
- Para cada archivo en la lista, MUST clasificar la ruta mediante `classifySensitiveFile`. Si la acción requerida es `deny` (e.g. claves SSH privadas, `.git/config`, `.npmrc`) o `ask` (e.g. `.env`, `.env.*`, `secrets.json`, `credentials`), el hook pre-commit MUST cancelar de inmediato el commit con código de error 1 y emitir un mensaje indicando el archivo sensible detectado y las opciones de bypass.
- Para los archivos preparados que no coincidan como archivos sensibles por nombre y cuyo tamaño sea menor a 1 MB (`MAX_SCAN_SIZE_BYTES`), el sistema MUST leer el contenido del blob directamente desde el índice de Git invocando `getStagedContent` (`git show :<path>` con `shell: false`, codificación UTF-8 y ruta relativa a la raíz del repositorio), absteniéndose de leer del sistema de archivos de trabajo (`fs.readFileSync`).
- Si la lectura del contenido del blob staged a través de `getStagedContent` falla o arroja una excepción, el hook pre-commit MUST abortar de inmediato con código de salida 1 y mostrar un mensaje de error descriptivo (`"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"`). Los fallos al inspeccionar blobs staged MUST NOT ser ignorados ni silenciados.
- El contenido del blob extraído MUST ser evaluado con `scanContentForSecrets`. Si coincide con tokens de proveedores conocidos (`KNOWN_TOKEN_PATTERNS`: OpenAI, Google, AWS, Slack, JWT) o expresiones de credenciales genéricas (`GENERIC_CREDENTIAL_REGEX`), el commit MUST ser cancelado con código 1 indicando el patrón detectado.
- Si un secreto está presente en el árbol de trabajo (`working tree`) pero no se encuentra preparado en el índice (`unstaged`), el escaneo de pre-commit MUST permitir el commit.
- Si un secreto se encuentra preparado en el índice (`staged`) pero ha sido eliminado o modificado en el árbol de trabajo, el escaneo de pre-commit MUST bloquear el commit.

#### Scenario: Bloqueo de commit por secreto preparado en el índice de Git
- GIVEN un archivo de texto preparado en el índice de Git que contiene una clave API de OpenAI (`sk-...`)
- AND el archivo en el árbol de trabajo (`working tree`) ha sido borrado o editado para no contener el secreto
- WHEN el desarrollador ejecuta `git commit`
- THEN el hook extrae el blob del índice mediante `git show :<path>`
- AND el escaneo detecta el patrón `openai-api-key`
- AND el commit es cancelado con código de salida 1 y mensaje de advertencia.

#### Scenario: Commit permitido cuando el secreto solo existe en el working tree
- GIVEN un archivo preparado en el índice de Git sin credenciales ni secretos
- AND el desarrollador añade una clave de API al archivo en el árbol de trabajo sin prepararla (`unstaged`)
- WHEN el desarrollador ejecuta `git commit`
- THEN el hook evalúa exclusivamente el contenido del blob en el índice de Git
- AND el commit es permitido sin bloqueos de seguridad.

#### Scenario: Integración en Git temporal detectando secreto staged con working tree limpio
- GIVEN un repositorio Git temporal inicializado con pre-commit activo
- AND un archivo `config.json` con una clave secreta preparado en el índice (`git add config.json`)
- AND una modificación posterior en `config.json` en el working tree que elimina la clave secreta
- WHEN se ejecuta el pre-commit
- THEN el hook detecta la clave presente en el blob del índice
- AND la ejecución finaliza con código 1 impidiendo el commit.

#### Scenario: Bloqueo de commit por fallo al leer blob staged en escaneo de secretos (fail-closed)
- GIVEN un archivo preparado en el índice de Git
- AND la invocación de `getStagedContent` falla o lanza una excepción al intentar acceder al blob
- WHEN el hook pre-commit ejecuta el escaneo de secretos de AgentShield
- THEN el hook captura el fallo sin silenciarlo
- AND aborta inmediatamente la ejecución con código de salida 1
- AND emite el mensaje `"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"`.
