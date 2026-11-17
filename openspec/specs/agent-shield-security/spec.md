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
- Archivos bloqueados estrictamente (`deny`): claves privadas SSH (`id_rsa`, `id_ecdsa`, `id_ed25519`, etc.), todo fichero bajo un directorio `.ssh` que no sea de los públicos, archivos `.git/config` y archivos `.npmrc`.
- Archivos consultados (`ask`): archivos `.env`, `.env.*`, `secrets.json`, `credentials` o cualquier archivo cuyo contenido contenga patrones que parezcan llaves de API (por ejemplo, `AIzaSy...` para Google Cloud o `sk-...` para OpenAI).
- Las lecturas por shell cuentan como lectura: `cat`, `head`, `tail`, `less`, `more`, `type`, `Get-Content`/`gc`, `grep`, `sed`, `awk`, `base64`, `xxd`, `od`, `tar`, `scp`, `cp`, `sort`, `nl`, `tac`, `rev`, `cut`, `rg`, `uniq`, `strings`, `hexdump`, `diff`, `jq`, `yq` y `bat`. Los valores de `scp -i` y `scp -o` no son rutas leídas (ssh lee la identidad sin exfiltrarla), ni lo es el primer operando de `grep`, `rg`, `sed`, `awk`, `jq` y `yq`, que es un patrón, un programa o un filtro. Ese primer operando sí es un fichero cuando una opción ya dio el patrón (`-e`, `-f`, `--regexp`, `--expression`, `--file` o `--from-file`, también pegada a su valor o en un grupo como `-ne`; en `jq` y `yq` solo `-f` y `--from-file`, porque su `-e` fija el código de salida y no lleva valor), y un patrón vacío (`grep '' fichero`) cuenta como patrón: `grep -e. .npmrc` y `sed '' ~/.ssh/id_rsa` leen el fichero. El lector MUST reconocerse también detrás de una asignación (`X=1 cat …`), de un envoltorio (`sudo`, `doas`, `env`, `command`, `exec`, `nohup`, `time`, `nice`, `timeout`), con sus opciones, el valor de las que lo llevan (`sudo -u root cat …`, `sudo -T 10 cat …`, `nice -n 10 cat …`, `env -u HOME cat …`) y la duración de `timeout` (`timeout 30 cat …`), en la cadena que `env -S` o `env --split-string=` parte en un comando, o detrás de una palabra clave del shell (`if`, `then`, `while`…), y dentro del comando que recibe un shell anidado (`sh`, `bash`, `zsh`, `dash` o `ksh` con `-c`, hasta dos niveles). Un operando con una expansión o un comodín (`$HOME/app/.env`, `.env*`) cuenta por su nombre. El lector MUST reconocerse también dentro de un subshell entre paréntesis (`(cat …)`, `( cat … )`, `(cd ~ && cat …)`) o de un grupo entre llaves (`{ cat …; }`), y sus operandos cuentan sin el paréntesis que los cierra. Un operando que empieza por `~/` MUST resolverse contra el directorio del usuario para el escaneo de contenido. El comando de una sustitución (`$(…)` o entre acentos graves) y el de una sustitución de proceso (`<(…)`, `>(…)`, fuera de comillas) MUST analizarse como otra línea de comando. La sustitución no corre, y no cuenta, dentro de comillas simples, de `$'…'`, de un comentario o del cuerpo de un heredoc con el delimitador entre comillas; en el cuerpo de cualquier otro heredoc sí corre, y las comillas de ese cuerpo son texto. Una comilla dentro de un comentario, de un heredoc o de `$'…'` MUST NOT ocultar una sustitución posterior. Del código en línea de un intérprete (`python`, `node`, `deno`, `bun`, `ruby`, `perl` o `php` tras `-c`, `-e`, `-p`, `-r`, sus combinaciones como `-pe`, `--eval` o `--print`) cuentan como ficheros leídos sus cadenas entre comillas simples, dobles o acentos graves (un literal de plantilla de JavaScript, también con los acentos graves escapados dentro de comillas dobles), partidas en trozos con forma de ruta, y los operandos que le siguen; un identificador del código no es un fichero.
- Un fichero que la clasificación deniega por nombre MUST denegarse por las vías de shell que lo leen: como operando de un lector, como destino de `<`, en el comando de una sustitución, en una sustitución de proceso, en un subshell entre paréntesis, en un shell anidado, detrás de un envoltorio o como cadena del código de un intérprete; también con una expansión en el directorio o con un comodín en el nombre (`id_*`). Bajo un directorio `.ssh`, un comodín o una expansión en el nombre MUST denegarse (`~/.ssh/*`, `~/.ssh/id*`, `~/.ssh/*.pem`, `~/.ssh/known_*`, `~/.ssh/$KEY`), porque puede nombrar una clave; `~/.ssh/*.pub` no.
- Una clave privada SSH MUST denegarse además cuando la nombra una palabra sin espacios de cualquier otro comando, también tras un `=` (`if=…`, `file=@…`): un fichero bajo un directorio `.ssh` que la clasificación deniega, un nombre de OpenSSH (`id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `id_ecdsa_sk`, `id_ed25519_sk`, `id_xmss`) con su directorio, o un nombre que empieza por `id_` y existe como fichero regular (un directorio `id_service/` no es una clave). Quedan fuera los comandos que la usan sin imprimirla (`ssh`, `sftp`, `ssh-add`, `ssh-keygen`, `ssh-copy-id`, `ansible`, `ansible-playbook`, `chmod`, `chown`, `ls`, `stat`, `test`, `[`, `rm`, `touch`, `echo`, `printf`, `find`, `mkdir`, `rmdir` y `cd`). El patrón de `grep`, `rg`, `sed`, `awk`, `jq` y `yq` no queda fuera, porque esta vía es la red de la anterior: buscar la ruta de una clave (`rg '.ssh/id_rsa' docs/`) se deniega, y buscar su nombre a secas (`rg id_rsa docs/`), no. Una palabra con espacios (un mensaje, un comando `ssh` entre comillas) no nombra un fichero, salvo el comando de una sustitución: `echo $(cat ~/.ssh/id_rsa)` se deniega aunque `echo` esté en la lista.
- Los demás ficheros denegados (`*.key`, `.npmrc`, `.git/config`) MUST NOT denegarse como argumento de un comando que no es lector: `curl --key client.key`, `openssl req -key server.key`, `kubectl create secret tls --key=tls.key` o `npm publish --userconfig ~/.npmrc` los usan sin imprimirlos, y `{.data.key}` o `slides.key` no son claves.
- Una cadena del código de un intérprete puede no ser un fichero (la clave de un diccionario, el nombre de una propiedad). Un nombre que solo parece una clave privada (`id_token`, `ssl.key`) MUST contar únicamente si es uno de los nombres de OpenSSH, empieza por `id_` y acaba en `.key` o `.pem`, está bajo un directorio `.ssh` o existe como fichero; y un `credentials` sin directorio, únicamente si existe. `rg id_token src/`, `git checkout feature/id_check` o `d['id_token']` en un `python -c` MUST NOT denegarse ni pedir aprobación.
- Bajo un directorio `.ssh`, a cualquier profundidad, todo fichero MUST contar como clave privada, se llame como se llame (`aws-prod.pem`, `deploy_key`, `github`, `id_rsa.bak`), salvo `config`, `known_hosts`, `known_hosts.old`, `authorized_keys`, `authorized_keys2`, `environment`, `rc`, `allowed_signers`, `revoked_keys` y los `*.pub`. El propio directorio `.ssh` MUST contar también cuando lo lee un lector o una herramienta de lectura (`grep -r … ~/.ssh`, `tar czf … ~/.ssh`), porque leerlo entero lee sus claves; como argumento de otro comando (`ls ~/.ssh`, `chmod 700 ~/.ssh`, `git -C ~/.ssh status`) MUST NOT denegarse. `cp` y `scp` son lectores y el reconocedor no distingue su destino: copiar a `.ssh` se deniega si el destino es el directorio (`cp deploy.pub ~/.ssh/`) y pasa si nombra un fichero público (`cp deploy.pub ~/.ssh/deploy.pub`).
- Fuera de `.ssh`, solo los nombres `id_*` y `*.key` (también un fichero llamado `.key`) cuentan como clave privada por nombre. Una clave con otro nombre (`certs/deploy.pem`) pide aprobación por su contenido, y esa confirmación solo vale para lo que se lee: el operando de un lector, el destino de `<`, el fichero que abre el código de un intérprete o una herramienta de lectura. Como argumento de otro comando no se ve.
- Un directorio MUST NOT contar como clave por su nombre (`id_service/`, `certs.key/`): una ruta que acaba en barra o que existe como directorio no se deniega como operando de un lector (`rg TODO id_service/`, `diff -r id_service src`) ni como ruta de una herramienta de lectura, y no activa el modo de fichero sensible de la censura. Un nombre `id_*` que no existe se sigue denegando, y bajo `.ssh` un directorio sí cuenta. Si la orden cambia de directorio (un `cd`, `pushd` o `popd` que es un comando, también detrás de un envoltorio o una palabra clave, en un shell anidado o en una sustitución; `--chdir`, `env -C` o `sudo -D`), el disco del espacio de trabajo no dice nada del operando y solo vale la barra final: `cd ~/.ssh && cat id_ed25519` se deniega aunque exista un directorio `id_ed25519/`.
- Límite: el reconocedor no interpreta el shell. Un cuerpo de heredoc, `source`, un script que lee el fichero, `xargs`, `find -exec`, una variable que guarda la ruta, un `eval`, un `cd` previo (`cd ~/.ssh && cat work`), un comando que no es lector e imprime una clave que no es SSH (`openssl rsa -in server.key -text`) o uno que no es lector y copia el directorio `.ssh` entero (`rsync -a ~/.ssh/ backup/`) no se ven; los guards frenan la fuga accidental, no a un proceso que quiera leer.
- Cuando el host censura la salida de las herramientas (REQ-agent-shield-security-002), el launcher recibe `--output-redaction` y `DISABLE_SECRET_REDACTION` no es `true`, una herramienta de lectura (`Read`, `Grep`, `Glob`, `LS`, `view_file` o sus equivalentes de OpenCode) MUST NOT pedir aprobación por un fichero cuyo contenido, una vez censurado (en modo de fichero sensible si su nombre está clasificado, o de fichero de configuración si lo es), ya no contiene nada que el escaneo de contenido señale fuera de los marcadores. El modo del fichero solo cuenta si lo nombra una de las claves de las que `PostToolUse` toma el modo (`file_path`, `filePath`, `path`, `notebook_path`); un fichero nombrado de otra forma, como el `glob` de una búsqueda, se comprueba en modo normal, que es como se censurará su salida. Si la censura no lo cubre, el fichero guarda un bloque de clave privada (una lectura parcial devolvería el cuerpo sin la cabecera), no se puede leer o supera 1 MB, el `ask` se mantiene. Una orden de shell, una escritura y cualquier otra herramienta (MCP incluidas) conservan el `ask`, porque su salida o su efecto no pasa por la censura. El `deny` no cambia.

#### Scenario: Lectura de clave privada SSH bloqueada
- GIVEN una llamada a la herramienta `view_file` para un archivo con ruta `/home/user/.ssh/id_rsa`
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN el Advisor de Seguridad MUST retornar una decisión de `deny` explicando que las llaves SSH no pueden ser leídas por el agente

#### Scenario: Clave privada nombrada por un comando que no es un lector
- GIVEN una orden de shell `tac ~/.ssh/id_ed25519`, `cat $HOME/.ssh/id_rsa`, `bash -lc "cat ~/.ssh/id_rsa"`, `echo $(cat ~/.ssh/id_rsa)` o `python3 -c` con un código que abre `id_rsa`
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN la decisión MUST ser `deny`, también en `bypassPermissions`

#### Scenario: Lector con el patrón en una opción, detrás de un envoltorio con valor o en un literal de plantilla
- GIVEN una orden de shell `grep -e. .npmrc`, `sed '' ~/.ssh/id_rsa`, `sudo -u root cat server.key`, `nice -n 10 cat .git/config` o un `node -e` cuyo código lee `` `${home}/.ssh/id_rsa` ``
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN la decisión MUST ser `deny`
- AND `jq . -e .npmrc`, `timeout 30 cat .npmrc`, `env -S 'cat .npmrc'`, `(cd ~ && cat .npmrc)`, `wc -l <(cat .npmrc)` y `cat ~/.ssh/*` MUST dar `deny`
- AND `grep '' .env`, `rg -eSECRET .env`, `sudo -u app cat .env`, `timeout -k 5 30 cat .env` y `(cat .env)` MUST contar `.env` entre los ficheros leídos
- AND `sudo -u root chmod 600 server.key`, `sudo -u root ls .npmrc`, `timeout 120 npm test`, `(cd sub && npm test)`, `( cd sub && npm test )`, `cat ~/.ssh/*.pub`, `ssh-copy-id -i ~/.ssh/id_ed25519 user@host` y, con un directorio `id_service/`, `go test ./id_service` MUST NOT denegarse

#### Scenario: Clave con otro nombre bajo un directorio .ssh
- GIVEN una orden de shell `cat ~/.ssh/aws-prod.pem`, `head -n 5 ~/.ssh/deploy_key`, `openssl rsa -in ~/.ssh/deploy_key -text`, `cat ~/.ssh/*.pem` o `grep -r BEGIN ~/.ssh`, o una herramienta de lectura sobre `~/.ssh/github`
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN la decisión MUST ser `deny`, también en `bypassPermissions`
- AND `cat ~/.ssh/config`, `grep github ~/.ssh/known_hosts`, `cat ~/.ssh/authorized_keys`, `cat ~/.ssh/work.pub`, `ssh -i ~/.ssh/work deploy@host uptime`, `ssh-add ~/.ssh/work`, `mkdir -p ~/.ssh/sockets` y `chmod 700 ~/.ssh` MUST NOT denegarse

#### Scenario: Directorio cuyo nombre empieza por id_
- GIVEN un directorio `id_service/` en el espacio de trabajo
- WHEN el agente ejecuta `rg TODO id_service/`, `rg TODO id_service` o `diff -r id_service src`, o usa una herramienta de lectura con esa ruta
- THEN el Advisor de Seguridad MUST NOT objetar
- AND si `id_deploy` existe como fichero, `cat id_deploy` MUST dar `deny`

#### Scenario: Palabra que solo parece una clave
- GIVEN una orden de shell `rg id_token src/`, `git checkout feature/id_check` o un `python3 -c` cuyo código usa `d['id_token']`
- AND ningún fichero con ese nombre en el espacio de trabajo
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN el Advisor de Seguridad MUST NOT objetar
- AND si existe un fichero `id_deploy` y la orden es `openssl rsa -in id_deploy -text`, la decisión MUST ser `deny`

#### Scenario: Uso de una clave sin imprimirla
- GIVEN una orden de shell `ssh -i ~/.ssh/id_ed25519 deploy@host uptime` o `chmod 600 ~/.ssh/id_rsa`
- WHEN el hook `PreToolUse` evalúa la llamada
- THEN el Advisor de Seguridad MUST NOT objetar por el nombre del fichero

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
- THEN el escaneo de seguridad de AgentShield se omite y no bloquea la confirmación del commit
- AND `DISABLE_AGENT_SHIELD` MUST NOT llegar a los tests que lanza `check.js --staged`, que comprueban el escudo con su propio entorno.

---

### Requirement: Escaneo preventivo de secretos en pre-commit sobre blobs del índice de Git {#REQ-agent-shield-security-001}
El sistema AgentShield en el hook pre-commit MUST inspeccionar preventivamente todos los archivos preparados en el índice de Git (`staged`) para impedir la confirmación de credenciales o archivos sensibles, aplicando un comportamiento fail-closed ante errores de lectura:
- MUST obtener la lista de archivos preparados mediante `git diff --cached --name-only --diff-filter=ACMR`.
- Para cada archivo en la lista, MUST clasificar la ruta mediante `classifySensitiveFile`. Si la acción requerida es `deny` (e.g. claves SSH privadas, `.git/config`, `.npmrc`) o `ask` (e.g. `.env`, `.env.*`, `secrets.json`, `credentials`), el hook pre-commit MUST cancelar de inmediato el commit con código de error 1 y emitir un mensaje indicando el archivo sensible detectado y las opciones de bypass.
- Para los archivos preparados que no coincidan como archivos sensibles por nombre y cuyo tamaño sea menor a 1 MB (`MAX_SCAN_SIZE_BYTES`), el sistema MUST leer el contenido del blob directamente desde el índice de Git invocando `getStagedContent` (`git show :<path>` con `shell: false`, codificación UTF-8 y ruta relativa a la raíz del repositorio), absteniéndose de leer del sistema de archivos de trabajo (`fs.readFileSync`).
- Si la lectura del contenido del blob staged a través de `getStagedContent` falla o arroja una excepción, el hook pre-commit MUST abortar de inmediato con código de salida 1 y mostrar un mensaje de error descriptivo (`"OSPEC-PRECOMMIT ERROR: No se pudo inspeccionar el contenido staged de <path>"`). Los fallos al inspeccionar blobs staged MUST NOT ser ignorados ni silenciados.
- El escaneo MUST evaluar solo lo que el commit añade (`getStagedAddedLines`): las líneas del blob staged que la versión de `HEAD:<path>` no tiene, contando repeticiones. Sin versión en `HEAD` (archivo nuevo, rama sin commits) o si no se puede leer, todo el blob cuenta como añadido. Un secreto ya versionado (un fixture de test) MUST NOT bloquear un commit que no lo añade. MUST NOT usar `git diff --cached`, que lee el árbol de trabajo cuando coincide con el índice y no falla con un blob staged ilegible.
- Lo añadido MUST evaluarse línea a línea, y el commit MUST cancelarse con código 1 si el escáner (`scanContentForSecrets`) marca la línea o si la censura de salida (REQ-agent-shield-security-002) censura algo en ella: en modo de fichero de configuración si la ruta del fichero en el índice es la de uno, y en modo normal en el resto. Para el commit, la censura MUST contar además el `key` con un prefijo desconocido y un token opaco como cuenta el `key` a secas, en todas sus formas: clave entre comillas (JSON), `NOMBRE=valor` y `NOMBRE: valor`. El mensaje MUST dar el fichero, el número de línea en el blob staged y el patrón o el tipo detectado, y MUST NOT incluir el valor.
- El escáner marca los tokens de proveedores conocidos (`KNOWN_TOKEN_PATTERNS`: OpenAI, OpenAI project, Anthropic, GitHub, Google, AWS, Slack, Stripe, npm, GitLab, Hugging Face, SendGrid, JWT), la cabecera de una clave privada y la asignación genérica: un nombre sin comillas pegado a `:` o `=` y un valor entre comillas de 6 caracteres o más en la misma línea. El nombre se clasifica por su última palabra (separada por `_`, `-`, `.` o por el cambio a mayúscula del camelCase):
  - `password`, `passwd`, `passphrase`, `secret`, `contraseña`, `contrasena`, una palabra que acaba en `password`, `passwd` o `secret`, y `pass` con prefijo (`db_pass`): cualquier valor.
  - `token`, `apikey`, `privatekey`, `pwd`, `credential(s)`, una palabra que acaba en `token` o `apikey`, `pass` a secas y `key` tras un calificador (`api`, `access`, `secret`, `private`, `auth`, `encryption`, `signing`, `master`, `client`, `account`, `jwt`, `hmac`, `security`, `subscription`): el valor MUST tener forma de secreto, la misma de la censura (8 caracteres o más, sin espacios, sin `-` inicial, con letra y con dígito o símbolo distinto de `-`, `_` y `.`, y que no sea referencia ni placeholder). Un `:` solo se admite si el valor lleva un tramo opaco (16 caracteres alfanuméricos seguidos o más, con letra y con dígito), como el token de un bot; un valor con puntos solo es el nombre de una propiedad si no lleva un tramo opaco.
  - `key` a secas o con un prefijo desconocido (`azure_openai_key`, `STORAGE_KEY`, `root_cause_key`): el valor MUST ser un token opaco, es decir, llevar un tramo opaco y no ser referencia ni placeholder. El commit acepta aquí el falso positivo de un hash, que el marcador resuelve; la censura de salida no censura el `key` con prefijo desconocido. Un `key` cuyo prefijo nombra un dato que no es secreto (`cache`, `sort`, `partition`, `primary`, `foreign`, `idempotency`, `dedupe`, `hash`, `object`, `row`, `public`, `publishable`, `anon`, `site`, `cause`) no es sensible.
- Una línea añadida que contiene el marcador `ospec:allow-secret` MUST NOT escanearse, y el hook MUST informar de cuántas líneas saltó en cada fichero. El marcador solo vale para su línea y solo lo respeta el pre-commit.
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

#### Scenario: Un secreto ya versionado no bloquea un commit que no lo añade
- GIVEN un archivo cuya versión en `HEAD` contiene una cabecera de clave privada
- AND el commit cambia otra línea del archivo
- WHEN se ejecuta el pre-commit
- THEN el escaneo no encuentra el secreto entre las líneas añadidas y permite el commit
- AND si el commit añade una línea con una clave de API, el commit es cancelado con código 1.

#### Scenario: Commit bloqueado por lo que la censura censura
- GIVEN un `Dockerfile` preparado en el índice que añade en su línea 2 una asignación sin comillas de un valor con forma de secreto a `DB_PASSWORD`
- WHEN se ejecuta el pre-commit
- THEN el commit es cancelado con código 1
- AND el mensaje da el fichero, `Línea: 2` y el tipo `assigned-secret`, sin el valor.

#### Scenario: Contraseña sin comillas en un fichero de configuración
- GIVEN un `config/database.yml` preparado en el índice que añade en su línea 3 `password:` seguido de un valor solo de letras sin comillas
- WHEN se ejecuta el pre-commit
- THEN el commit es cancelado con código 1
- AND el mensaje da el fichero, `Línea: 3` y el tipo `assigned-secret`, sin el valor
- AND la misma línea en `docs/setup.md`, una referencia (`password: ${DB_PASSWORD}`), `id-token: write`, `existingSecret: redis-auth` o una línea con `ospec:allow-secret` MUST NOT bloquear el commit.

#### Scenario: Código corriente con un campo key
- GIVEN un archivo preparado que añade un campo `key` con el nombre de una clave de almacenamiento, o una constante `STORAGE_KEY` con un identificador
- WHEN se ejecuta el pre-commit
- THEN el escaneo de secretos no bloquea el commit.

#### Scenario: Línea con el marcador de excepción
- GIVEN un archivo preparado cuya única línea con forma de secreto lleva `ospec:allow-secret`
- WHEN se ejecuta el pre-commit
- THEN el commit es permitido y el hook informa de una línea sin escanear en ese archivo
- AND si otra línea sin el marcador tiene forma de secreto, el commit es cancelado con código 1.

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
- MUST censurar solo lo que tiene forma inequívoca de secreto: los tokens de `KNOWN_TOKEN_PATTERNS` salvo la cabecera PEM suelta; el cuerpo de un bloque de clave privada PEM con al menos 40 caracteres seguidos de base64 (hasta el final del texto si falta el pie); la contraseña de una URL `esquema://usuario:contraseña@host`; el token de una cabecera `Authorization: Bearer|Basic|Token`; y el valor asignado a un nombre que termina en una palabra sensible (`password`, `passwd`, `passphrase`, `pass`, `pwd`, `secret`, `contraseña`, `contrasena`, `token`, `apikey`, `credential(s)`, o `key` tras `api`, `access`, `secret`, `private`, `auth`, `encryption`, `signing`, `master`, `client`, `account`, `jwt`, `hmac`, `security` o `subscription`).
- El valor de un `key` a secas (`"Key"` en un `appsettings.json`) MUST censurarse solo cuando es un token opaco: lleva 16 caracteres alfanuméricos seguidos o más, con letra y con dígito. Un `key` con un prefijo que no es calificador (`cache_key`, `root_cause_key`, `azure_openai_key`) MUST NOT censurarse: su valor suele ser un hash o un identificador que el modelo necesita leer.
- Un par `nombre=valor` sin espacios ni comillas cuyo nombre es sensible MUST censurarse hasta su separador (`;`, `,`, comillas o blanco): los de una cadena de conexión (`Password=…`, `Pwd=…`, `AccountKey=…`, `SharedAccessKey=…`) y las opciones separadas por comas. Si el par va pegado a un `;` y la línea tiene otra clave de conexión (`Server`, `Data Source`, `Host`, `Database`, `Initial Catalog`, `User Id`, `Uid`, `User`, `Username`, `AccountName`, `Endpoint`, `DefaultEndpointsProtocol`), basta un valor de 4 caracteres o más que no sea placeholder; en el resto el valor MUST parecer un secreto.
- Un valor asignado MUST NOT censurarse cuando es una referencia (`$X`, `${…}`, `$(…)`, `{{…}}`, `{…}`, `%X%`, `process.env`, `os.environ`, `getenv`, `secrets.`), `env(…)`, un placeholder (`<…>`, `changeme`, `your…`, `example`, `xxxx`, `...`, un carácter repetido o un valor que contiene `password`, `passwd`, `secret` o `token`), un número, una ruta o fichero de clave, un nombre de constante (`GITHUB_TOKEN`) o un identificador con puntos.
- Una línea `NOMBRE=valor` con nombre en mayúsculas (`.env`, `export`, salida de `env`) MUST censurar cualquier valor de 4 caracteres o más cuando cualquier palabra del nombre es sensible (`SECRET_KEY_BASE`); ahí un valor que contiene `password` o `secret` sí es un secreto. Una URL sin credenciales (`TOKEN_URL=https://…`) no lo es.
- En modo de fichero sensible (la herramienta de lectura nombra un fichero que `classifySensitiveFile` marca: `.env*`, `credentials`, `secrets.json`; o una orden de shell lo lee según las reglas de lectura por shell de `PreToolUse`: un lector, una sustitución de comando o el código de un intérprete) MUST censurar además las asignaciones sin comillas con clave en minúsculas (`aws_secret_access_key = …`, `password: …`), con el valor de un nombre sensible hasta el primer blanco como en un fichero de configuración, y cualquier valor opaco, sea cual sea su clave: todo lo que no es placeholder, URL sin credenciales, frase ni un valor simple de palabras de hasta 10 caracteres (`production`, `db.internal`, `eu-west-1`). La contraseña de una URL con usuario vacío (`redis://:clave@host`) también se censura.
- En modo de fichero de configuración (la herramienta de lectura nombra uno, o una orden de shell lo lee según las reglas de lectura por shell de `PreToolUse`) MUST censurar además, y solo eso: la asignación sin comillas con el nombre en minúsculas cuando el valor tiene la forma que pide el nombre (`api_key: …`, `client_secret = …`, `key:` con un token opaco), y una contraseña de 4 caracteres o más, sin blancos y que no sea referencia ni placeholder, aunque sea solo de letras o contenga `password` o `secret` (como en un `.env`, ahí nadie escribe ejemplos), con el nombre y el valor con o sin comillas (`password: valor`, `db_pass = valor`, `"Password": "valor"`). El valor sin comillas llega hasta el primer blanco: `#`, `;` y `,` son parte de él (`password: Xk9#mP2;qL`), y solo tras un blanco abren un comentario, que se conserva; un valor sin comillas con una comilla dentro no se ve, porque esa forma es el texto de una cadena. Un valor cifrado por sops (`ENC[…]`) es una referencia. El resto del fichero MUST NOT censurarse: la regla del valor opaco bajo cualquier clave es solo del modo de fichero sensible, que manda si el fichero es además sensible por nombre.
  - Es un fichero de configuración el de extensión `.yml`, `.yaml`, `.ini`, `.properties`, `.toml`, `.conf` o `.cfg`, y el JSON llamado `appsettings*.json`, `local.settings.json`, `config.json`, `config.<entorno>.json` o `settings.json`. El resto de los JSON MUST NOT contar, porque ahí viven las etiquetas (`"password": "Contraseña"`), ni una traducción: un fichero bajo un directorio `locale`, `locales`, `i18n`, `l10n`, `lang`, `langs`, `translation` o `translations`, o un bundle de Java con sufijo de idioma (`messages_es.properties`, `ValidationMessages_pt_BR.properties`).
  - Un nombre de contraseña es `password`, `passwd`, `passphrase`, `contraseña`, `contrasena`, una palabra que acaba en `password` o `passwd`, y `pass` con prefijo (`db_pass`). `secret` y las palabras que acaban en `secret` MUST seguir pidiendo forma de secreto, porque también nombran un objeto (`existingSecret: redis-auth`), igual que un token o una clave (`id-token: write`).
  - Límite: el modo depende de que la llamada nombre el fichero. Una búsqueda sobre un directorio (`grep -rn password config/`, o `Grep` sin un fichero concreto) se censura en modo normal.
- Un bloque PEM MUST censurarse también con los saltos escapados (`\n` literal), como la `private_key` de una cuenta de servicio en JSON. En cualquier otro contexto el valor además MUST parecer un secreto: 8 caracteres o más, sin espacios, sin `:` salvo que lleve un tramo opaco, sin `-` inicial, con letra y con dígito o símbolo distinto de `-`, `_` y `.`. Una contraseña solo de letras en código queda sin censurar a cambio de no censurar etiquetas. Límite: un nombre en minúsculas con un valor sin comillas (`password: valor`), fuera de un fichero sensible por nombre o de configuración, ni se censura en la salida ni bloquea el commit, porque en código esa forma es una expresión o un tipo (`token: Token<string>`).
- MUST NOT ejecutarse con `DISABLE_SECRET_REDACTION=true`.
- Si el hook no puede ejecutarse, el launcher MUST censurar en proceso con la implementación Node y, si también falla, MUST sustituir cada string de la respuesta por un aviso de salida retenida (ADR 0008).
- Las implementaciones Go y Node MUST producir la misma salida para el corpus `internal/testdata/secret-redaction/cases.json` y los fixtures `internal/testdata/parity/post-tool-use-*`, y MUST dar las mismas respuestas para el corpus `internal/testdata/secret-guards/cases.json`, que fija qué marca el escáner, qué censura la censura y qué decide el reconocedor de shell.

Hosts: Claude Code (`updatedToolOutput`) y OpenCode 2.x (`execute.after`, reasignando `event.result`) reescriben la salida; Codex la sustituye por el motivo de `decision: "block"`. VS Code, GitHub Copilot, Cursor y Antigravity no pueden reescribirla y no reciben el evento: conservan el `ask` de lectura.

#### Scenario: Lectura de un .env censurada
- GIVEN un `.env` con `DB_HOST=localhost` y `DB_PASSWORD=s3cr3t-Pass`
- WHEN el agente lo lee con `Read` en Claude Code
- THEN el modelo recibe `DB_HOST=localhost` y `DB_PASSWORD=[REDACTED:assigned-secret]`
- AND el fichero en disco no cambia

#### Scenario: Fichero de configuración legible con sus secretos censurados
- GIVEN un `appsettings.json` con un nivel de log, una cadena de conexión con `Password=` y una sección con un `Key` de 48 caracteres aleatorios
- WHEN el agente lo lee con `Read` o con `cat` en Claude Code
- THEN la lectura no se deniega
- AND el modelo recibe el nivel de log y el servidor de la cadena de conexión intactos, y el valor de `Password=` y el de `Key` censurados

#### Scenario: Fichero de configuración con una contraseña sin comillas
- GIVEN un `config/database.yml` con `host: db.internal`, una clave `build` con un valor aleatorio y `password:` seguido de un valor solo de letras sin comillas
- WHEN el agente lo lee con `Read` o con `cat` en Claude Code
- THEN el modelo recibe `host` y `build` intactos y `password: [REDACTED:assigned-secret]`
- AND el mismo contenido leído de `docs/database.md` o de `config/locales/es.yml` llega sin censurar
- AND un `appsettings.Development.json` con `"Password"` y un valor solo de letras llega con ese valor censurado

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
