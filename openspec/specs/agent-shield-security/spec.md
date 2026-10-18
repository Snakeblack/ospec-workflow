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
- Las lecturas por shell cuentan como lectura: `cat`, `head`, `tail`, `less`, `more`, `type`, `Get-Content`/`gc`, `grep`, `sed`, `awk`, `base64`, `xxd`, `od`, `tar`, `scp` y `cp`. Los valores de `scp -i` y `scp -o` no son rutas leídas (ssh lee la identidad sin exfiltrarla).
- Cuando el host censura la salida de las herramientas (REQ-agent-shield-security-002), el launcher recibe `--output-redaction` y `DISABLE_SECRET_REDACTION` no es `true`, una herramienta de lectura (`Read`, `Grep`, `Glob`, `LS`, `view_file` o sus equivalentes de OpenCode) MUST NOT pedir aprobación por un fichero cuyo contenido, una vez censurado (en modo de fichero sensible si su nombre está clasificado), ya no contiene nada que el escaneo de contenido señale fuera de los marcadores. Si la censura no lo cubre, el fichero guarda un bloque de clave privada (una lectura parcial devolvería el cuerpo sin la cabecera), no se puede leer o supera 1 MB, el `ask` se mantiene. Una orden de shell, una escritura y cualquier otra herramienta (MCP incluidas) conservan el `ask`, porque su salida o su efecto no pasa por la censura. El `deny` no cambia.

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
- El contenido del blob extraído MUST ser evaluado con `scanContentForSecrets`. Si coincide con tokens de proveedores conocidos (`KNOWN_TOKEN_PATTERNS`: OpenAI, OpenAI project, Anthropic, GitHub, Google, AWS, Slack, Stripe, npm, GitLab, Hugging Face, SendGrid, JWT) o expresiones de credenciales genéricas (`GENERIC_CREDENTIAL_REGEX`), el commit MUST ser cancelado con código 1 indicando el patrón detectado.
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

---

### Requirement: Censura de secretos en la salida de las herramientas (PostToolUse) {#REQ-agent-shield-security-002}
El hook `PostToolUse` (`post-tool-use`) MUST entregar al modelo la respuesta de cualquier herramienta con cada secreto sustituido por `[REDACTED:<tipo>]` y el resto intacto, sin modificar el fichero real:
- MUST recorrer la respuesta (`tool_response`) y reescribir solo sus strings, conservando la forma: el host descarta una salida reescrita que no coincide con la de la herramienta. Sin nada que censurar MUST NOT escribir nada.
- MUST censurar solo lo que tiene forma inequívoca de secreto: los tokens de `KNOWN_TOKEN_PATTERNS` salvo la cabecera PEM suelta; el cuerpo de un bloque de clave privada PEM con al menos 40 caracteres seguidos de base64 (hasta el final del texto si falta el pie); la contraseña de una URL `esquema://usuario:contraseña@host`; el token de una cabecera `Authorization: Bearer|Basic|Token`; y el valor asignado a un nombre que termina en una palabra sensible (`password`, `passwd`, `passphrase`, `pass`, `pwd`, `secret`, `token`, `apikey`, `credential(s)`, o `key` tras `api`, `access`, `secret`, `private`, `auth`, `encryption`, `signing`, `master` o `client`).
- Un valor asignado MUST NOT censurarse cuando es una referencia (`$X`, `${…}`, `$(…)`, `{{…}}`, `{…}`, `%X%`, `process.env`, `os.environ`, `getenv`, `secrets.`), un placeholder (`<…>`, `changeme`, `your…`, `example`, `xxxx`, `...`, un carácter repetido o un valor que contiene `password`, `passwd`, `secret` o `token`), un número, una ruta o fichero de clave, un nombre de constante (`GITHUB_TOKEN`) o un identificador con puntos.
- Una línea `NOMBRE=valor` con nombre en mayúsculas (`.env`, `export`, salida de `env`) MUST censurar cualquier valor de 4 caracteres o más cuando cualquier palabra del nombre es sensible (`SECRET_KEY_BASE`); ahí un valor que contiene `password` o `secret` sí es un secreto. Una URL sin credenciales (`TOKEN_URL=https://…`) no lo es.
- En modo de fichero sensible (la lectura nombra un fichero que `classifySensitiveFile` marca: `.env*`, `credentials`, `secrets.json`) MUST censurar además las asignaciones sin comillas con clave en minúsculas (`aws_secret_access_key = …`, `password: …`) y cualquier valor opaco, sea cual sea su clave: todo lo que no es placeholder, URL sin credenciales, frase ni un valor simple de palabras de hasta 10 caracteres (`production`, `db.internal`, `eu-west-1`). La contraseña de una URL con usuario vacío (`redis://:clave@host`) también se censura.
- Un bloque PEM MUST censurarse también con los saltos escapados (`\n` literal), como la `private_key` de una cuenta de servicio en JSON. En cualquier otro contexto el valor además MUST parecer un secreto: 8 caracteres o más, sin espacios ni `:`, sin `-` inicial, con letra y con dígito o símbolo distinto de `-`, `_` y `.`. Una contraseña solo de letras en código queda sin censurar a cambio de no censurar etiquetas.
- MUST NOT ejecutarse con `DISABLE_SECRET_REDACTION=true`.
- Si el hook no puede ejecutarse, el launcher MUST censurar en proceso con la implementación Node y, si también falla, MUST sustituir cada string de la respuesta por un aviso de salida retenida (ADR 0008).
- Las implementaciones Go y Node MUST producir la misma salida para el corpus `internal/testdata/secret-redaction/cases.json` y los fixtures `internal/testdata/parity/post-tool-use-*`.

Hosts: Claude Code (`updatedToolOutput`) y OpenCode 2.x (`execute.after`, reasignando `event.result`) reescriben la salida; Codex la sustituye por el motivo de `decision: "block"`. VS Code, GitHub Copilot, Cursor y Antigravity no pueden reescribirla y no reciben el evento: conservan el `ask` de lectura.

#### Scenario: Lectura de un .env censurada
- GIVEN un `.env` con `DB_HOST=localhost` y `DB_PASSWORD=s3cr3t-Pass`
- WHEN el agente lo lee con `Read` en Claude Code
- THEN el modelo recibe `DB_HOST=localhost` y `DB_PASSWORD=[REDACTED:assigned-secret]`
- AND el fichero en disco no cambia

#### Scenario: Etiqueta que no es un secreto
- GIVEN un fichero con `"password": "Contraseña"` y `max_tokens: 4096`
- WHEN el hook procesa la salida
- THEN no escribe nada y el host entrega la salida original

#### Scenario: Fallo de la censura sin fuga
- GIVEN el binario del hook no responde a tiempo
- WHEN el launcher recibe una respuesta con un token de GitHub
- THEN entrega la respuesta censurada por la implementación Node, sin el token

---

### Requirement: El marcador de censura no sobrescribe secretos reales {#REQ-agent-shield-security-003}
En `PreToolUse`, una escritura (`content`, `new_string`/`newString`, `old_string`/`oldString`, `text` u otra clave de contenido, sobre `file_path`/`filePath`/`path`) o una orden de shell que contiene `[REDACTED:<tipo>]` y nombra un fichero que guarda secretos que la censura ocultaría MUST recibir `deny`, en cualquier modo de permisos, con un motivo que pide editar solo las líneas sin secretos. Un fichero sin secretos puede contener el marcador.

#### Scenario: Reescritura de un .env con el marcador
- GIVEN un `.env` con `DB_PASSWORD=s3cr3t-Pass`
- WHEN el agente lo reescribe con `Write` incluyendo `DB_PASSWORD=[REDACTED:assigned-secret]`
- THEN el hook devuelve `deny`, también en `bypassPermissions`, y el secreto sigue en disco
