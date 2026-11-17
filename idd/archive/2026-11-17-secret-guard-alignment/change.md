# secret-guard-alignment

## Intent and acceptance

El escáner de secretos del commit y la censura de salida no ven lo mismo: el pre-commit deja pasar secretos que la censura reconoce (camelCase, asignaciones sin comillas, URL, Bearer) y bloquea código corriente con un campo key; una clave privada se lee con un comando de shell fuera de la lista de lectores

Acceptance: Un corpus compartido por Node y Go fija qué ve cada guard; el pre-commit rechaza cada caso que la censura censura; los falsos positivos del campo key pasan; tac o python3 -c sobre una clave privada dan deny; el handbook describe el límite de los guards

## Plan

<!-- ospec:plan:start -->
- Files: `docs/harness-go-js-parity.md`, `docs/harness-runtime.md`, `docs/roadmaps/harness-evolution.md`, `handbook/proteccion/guardrails.md`, `internal/hooks/posttooluse.go`, `internal/hooks/posttooluse_test.go`, `internal/hooks/pretooluse.go`, `internal/hooks/pretooluse_test.go`, `internal/hooks/secretguards_corpus_test.go`, `internal/hooks/secretredact.go`, `internal/hooks/secretredact_test.go`, `internal/hooks/secretscan.go`, `internal/hooks/secretscan_test.go`, `internal/hooks/shellfileaccess.go`, `internal/hooks/shellfileaccess_test.go`, `internal/testdata/secret-guards/cases.json`, `internal/testdata/secret-redaction/cases.json`, `openspec/specs/agent-shield-security/spec.md`, `scripts/hooks/lib/secret-guards.corpus.test.js`, `scripts/hooks/lib/secret-redact.js`, `scripts/hooks/lib/secret-redact.test.js`, `scripts/hooks/lib/secret-scan.js`, `scripts/hooks/lib/secret-scan.test.js`, `scripts/hooks/lib/shell-file-access.js`, `scripts/hooks/lib/shell-file-access.test.js`, `scripts/hooks/lib/staged-validator.js`, `scripts/hooks/lib/staged-validator.test.js`, `scripts/hooks/post-tool-use.js`, `scripts/hooks/post-tool-use.test.js`, `scripts/hooks/pre-commit-hook.js`, `scripts/hooks/pre-commit-hook.test.js`, `scripts/hooks/pre-tool-use.js`, `scripts/hooks/pre-tool-use.test.js`
- Work units: 5
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El escáner conserva su forma (nombre sin comillas pegado a dos puntos o igual y valor entre comillas de 6 o más caracteres) y gana una segunda expresión para el camelCase; la palabra clave decide la regla del valor: key, token, private_key y pass a secas exigen forma de secreto, y password, passwd, secret, contraseña y un pass con prefijo siguen con cualquier valor de 6 o más caracteres.
- La forma de secreto es una sola definición para los dos guards (isStrictSecret: 8 o más caracteres, sin espacios ni dos puntos, con letra y con dígito o símbolo, y que no sea referencia ni placeholder); vive con el escáner y la censura la importa.
- El pre-commit decide línea a línea sobre lo que el commit añade: bloquea si el escáner la marca o si la censura (modo normal) censura algo, da fichero, número de línea y tipo, nunca el valor, y salta las líneas que llevan el marcador ospec:allow-secret, avisando de cuántas saltó.
- La censura trata env(NOMBRE) como referencia, reconoce contraseña y contrasena, acepta account como calificador de key, censura un key sin calificador solo cuando el valor es un token opaco (16 o más caracteres alfanuméricos seguidos, con letra y dígito) y censura los pares nombre=valor de una cadena de conexión: con regla laxa si el par va entre puntos y coma y la línea tiene otra clave de conexión, y con forma de secreto en el resto.
- Un fichero que el clasificador deniega por nombre se deniega como palabra de cualquier comando de shell (también con expansión en el directorio, con comodín en el nombre y tras un igual), salvo en los comandos que lo usan sin imprimirlo: ssh, sftp, ssh-add, ssh-keygen, chmod, chown, ls, stat, test, [, rm, touch, echo, printf y find; las palabras con espacios no cuentan, para no denegar mensajes ni comandos anidados entre comillas.
- El código en línea de un shell (sh, bash, zsh, dash, ksh con -c) se analiza como otro comando, y el de un intérprete (python, node, deno, bun, ruby, perl, php con -c, -e, --eval, -p o -r) se parte en trozos con forma de ruta que se clasifican por nombre; los cuerpos de heredoc siguen siendo datos.
- La lista de lectores gana sort, nl, tac, rev, cut, rg, uniq, strings, hexdump, diff, jq, yq y bat; source y los intérpretes quedan fuera y el handbook lo dice. PostToolUse activa el modo de fichero sensible también cuando el comando de shell lee uno por nombre.
- Un corpus nuevo, internal/testdata/secret-guards/cases.json, fija para Node y Go qué ve el escáner, qué censura la censura y qué decide el shell; usa las mismas plantillas que el corpus de la censura para no guardar valores con forma de secreto.
- Precisa la decisión 1: el escáner no usa dos expresiones. Captura el nombre entero, con un tope de 80 caracteres para que una tira larga de base64 no cueste tiempo cuadrático en V8, y lo clasifica por su última palabra, partida por separadores y por camelCase, con la misma función que usa la censura. Un key con calificador, token, apikey, pwd, credential y un pass a secas exigen forma de secreto; un key a secas exige un token opaco; un key con un prefijo que no califica (storage_key, sortKey, cache_key) no es sensible.
- Precisa la decisión 4: el token opaco vale solo para el key a secas. Con cualquier key sin calificador, la medición sobre los repositorios del usuario censuraba los cache_key que guardan un hash. A cambio, jwt, hmac, security y subscription se suman a account como calificadores de key.
- Medido sobre los ficheros versionados de nueve repositorios del usuario: las líneas que bloquearían un commit bajan de 209 a 62, y la censura nueva solo añade una línea censurada, que es un test de censura; deja de censurar las referencias env(NOMBRE) de config.toml.
- Para encontrar el comando se saltan las asignaciones previas, los envoltorios (sudo, doas, env, command, exec, nohup, time, nice), las palabras clave del shell y las opciones que van entre ellos; vale para los lectores y para los ficheros denegados por nombre. La guarda de atribución sigue leyendo solo operandos literales.
- El clasificador de Go reconoce .git/config también en una ruta relativa, como ya hacía el de Node; la diferencia era anterior y el corpus compartido la destapó.
- La señal persistent-data sale de un writeFile que staged-validator.js ya tenía (el módulo temporal de la validación de sintaxis). El cambio no toca datos persistentes, y la obligación se satisface con los tests de ese fichero.
- Una contraseña solo de letras en un JSON con la clave entre comillas sigue sin censurarse en la salida, también en un appsettings: distinguirla de una etiqueta exige saber qué fichero es de configuración, y esa lista de nombres queda para una decisión aparte del usuario.
- Tras la revisión de confianza: la forma de secreto admite dos puntos cuando el valor lleva un tramo opaco (16 o más caracteres alfanuméricos seguidos, con letra y dígito), y un valor con puntos que lleva un tramo opaco deja de contar como nombre de propiedad. Así el token de un bot y un token de tres segmentos bajo un nombre sensible vuelven a bloquear el commit y se censuran en la salida.
- Precisa las decisiones sobre key: hay una clase más, unqualified, para un key con un prefijo desconocido (azure_openai_key, root_cause_key). El escáner lo marca con un token opaco, porque el falso positivo de un hash se resuelve con el marcador; la censura no lo toca, porque la medición mostró que ocultaba los root_cause_key de los ficheros de revisión. Los prefijos cache, sort, partition, primary, foreign, idempotency, dedupe, hash, object, row, public, publishable, anon y site no son sensibles en ninguno de los dos.
- Tras la revisión de confianza: el comando de una sustitución (dólar con paréntesis o acentos graves, fuera de comillas simples) se analiza como otra línea de comando, para los lectores y para los ficheros denegados, de modo que echo o printf con una sustitución que lee una clave se deniegan aunque estén en la lista de excepciones. El código en línea de un intérprete pasa a contar como lectura: pide confirmación con un fichero sensible y activa su modo de censura; la opción se reconoce por patrón (-pe, -lane, --print), no por una lista cerrada.
- Tras la segunda revisión de confianza: para el commit, la censura cuenta el key con prefijo desconocido y token opaco como el key a secas, en todas sus formas (clave entre comillas, NOMBRE=valor y NOMBRE: valor), con una opción que solo usa el pre-commit; la censura de salida no cambia. cause se suma a los prefijos que no son sensibles, porque root_cause_key es un hash de los artefactos de review de ospec. Sobre los repositorios medidos, la regla no añade ningún bloqueo: siguen 209 a 62.
- Tras la segunda revisión de confianza: el análisis de sustituciones sigue las reglas de comillas del tokenizador. No cuenta nada dentro de comillas simples, de la forma dólar con comilla simple, de un comentario o del cuerpo de un heredoc con el delimitador entre comillas; en el cuerpo de cualquier otro heredoc las comillas son texto y la sustitución cuenta. Así un apóstrofo anterior ya no oculta una sustitución que lee una clave.
- Antes de la tercera revisión: una palabra de un comando puede no ser un fichero. El primer operando de grep, rg, sed, awk, jq y yq es un patrón y deja de contar como lectura; del código en línea de un intérprete solo cuentan sus cadenas entre comillas y los operandos que le siguen, no sus identificadores; y fuera de los operandos de un lector, un nombre que solo parece una clave por empezar por id_ cuenta si es uno de los nombres de OpenSSH, acaba en .key o .pem, está bajo un directorio .ssh o existe como fichero, y un credentials sin directorio, si existe. Sin esto, rg id_token, una rama feature/id_x o un diccionario con la clave id_token en python -c se denegaban.
- Precisa la decisión sobre los ficheros denegados por nombre: la denegación como argumento de cualquier comando vale solo para una clave SSH (bajo un directorio .ssh, con un nombre de OpenSSH y su directorio, o con prefijo id_ y que existe como fichero). Una batería de comandos habituales mostró que, aplicada a todos los ficheros denegados, daba un deny duro a usos que no imprimen nada: curl con una clave TLS, openssl req, kubectl con --key, npm publish con --userconfig, un filtro de jq o un jsonpath que acaba en key, y una presentación con extensión key. Esos ficheros se siguen denegando por las vías que los leen: lectores, redirección de entrada, sustituciones, shells anidados, envoltorios y cadenas del código de un intérprete. Queda como límite documentado un comando que no es lector e imprime una clave que no es SSH.
- Tras la tercera revisión de confianza: el primer operando de grep, rg, sed, awk, jq y yq deja de ser el patrón cuando una opción ya lo dio (-e, -f, --regexp, --expression, --file, --from-file, pegada a su valor o en un grupo como -ne), y un patrón vacío entre comillas cuenta como palabra, de modo que el fichero que le sigue se lee. Para encontrar el comando detrás de un envoltorio se salta también el valor de sus opciones (sudo y doas -u, nice -n, env -u, exec -a, time -o). Las cadenas del código de un intérprete incluyen los literales de plantilla entre acentos graves. La vía de la clave SSH como palabra de cualquier comando ya no excluye el patrón de grep o rg: es la red de la vía de los lectores, y a cambio buscar la ruta de una clave (rg con .ssh/id_rsa) se deniega; buscar el nombre a secas, no.
- Tras la validación de la corrección: en jq y yq solo -f y --from-file dan el filtro, porque su -e fija el código de salida y no lleva valor; antes, un fichero detrás de ese -e se saltaba como su valor. timeout pasa a ser un envoltorio, con su duración como operando previo al comando y sus opciones -s y -k; sudo y doas saltan también el valor de -T, -R y -a; y la cadena de env -S o --split-string se analiza como el comando que es. El tokenizador conserva un acento grave escapado como carácter, de modo que un literal de plantilla dentro de un código entre comillas dobles cuenta como cadena y un mensaje de commit con acentos graves escapados se lee como se escribió.
- Tras la cuarta revisión de confianza: un lector se reconoce dentro de un subshell entre paréntesis y sus operandos cuentan sin el paréntesis; el comando de una sustitución de proceso se analiza como el de una sustitución de comando, y sus palabras dejan de ser operandos del comando exterior. Un comodín bajo un directorio .ssh se deniega si casa con un nombre de OpenSSH. Un nombre id_ cuenta como clave solo si existe como fichero regular, no como directorio. ssh-copy-id, ansible y ansible-playbook se suman a los comandos que usan una clave sin imprimirla. Un nombre en minúsculas con un valor sin comillas (YAML, INI) fuera de un fichero sensible por nombre queda como límite documentado: en código esa forma es una expresión o un tipo, y cerrarlo pide la lista de ficheros de configuración que ya estaba pendiente de decisión del usuario.
- Tras la quinta revisión de confianza (aprobada, sin hallazgos bloqueantes) y con el trato acotado que eligió el usuario: una palabra de agrupación suelta (un paréntesis o una llave) no nombra el comando, así que el lector se reconoce en un subshell con blancos y en un grupo entre llaves; el escaneo de contenido de un fichero leído por shell resuelve la tilde inicial contra el directorio del usuario; y Node calcula la extensión como Go, desde el último punto, de modo que un fichero llamado .key se deniega en los dos. Quedan documentados como límite, y en el punto E1.95 del roadmap, la clave bajo .ssh con un nombre que no es id_ ni .key y el directorio id_ que se deniega como operando de un lector.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-17T03:04:51.094Z)
- ev-2: check-run for checks-pass (2026-11-17T03:15:08.304Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-17T03:15:48.291Z)
- ev-4: frozen-review for trust-review (2026-11-17T03:33:45.446Z, subagent-stop)
- ev-5: check-run for checks-pass (2026-11-17T03:41:15.736Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-17T03:41:15.736Z)
- ev-7: migration-test for migration-compat-and-test (2026-11-17T03:41:28.300Z)
- ev-8: frozen-review for trust-review (2026-11-17T03:55:25.827Z, subagent-stop)
- ev-9: check-run for checks-pass (2026-11-17T03:59:49.168Z)
- ev-10: adr-impact-declaration for adr-impact-declaration (2026-11-17T03:59:49.168Z)
- ev-11: migration-test for migration-compat-and-test (2026-11-17T03:59:59.591Z)
- ev-12: check-run for checks-pass (2026-11-17T04:07:53.358Z)
- ev-13: adr-impact-declaration for adr-impact-declaration (2026-11-17T04:07:53.358Z)
- ev-14: check-run for checks-pass (2026-11-17T04:13:33.785Z)
- ev-15: adr-impact-declaration for adr-impact-declaration (2026-11-17T04:13:33.785Z)
- ev-16: migration-test for migration-compat-and-test (2026-11-17T04:13:35.131Z)
- ev-17: frozen-review for trust-review (2026-11-17T04:25:08.564Z, subagent-stop)
- ev-18: check-run for checks-pass (2026-11-17T06:30:01.036Z)
- ev-19: adr-impact-declaration for adr-impact-declaration (2026-11-17T06:30:01.036Z)
- ev-20: migration-test for migration-compat-and-test (2026-11-17T06:30:22.038Z)
- ev-21: frozen-review for trust-review (2026-11-17T06:38:47.737Z, subagent-stop)
- ev-22: check-run for checks-pass (2026-11-17T06:44:08.544Z)
- ev-23: adr-impact-declaration for adr-impact-declaration (2026-11-17T06:44:08.544Z)
- ev-24: migration-test for migration-compat-and-test (2026-11-17T06:44:28.680Z)
- ev-25: check-run for checks-pass (2026-11-17T07:19:47.505Z)
- ev-26: adr-impact-declaration for adr-impact-declaration (2026-11-17T07:19:47.505Z)
- ev-27: migration-test for migration-compat-and-test (2026-11-17T07:20:01.824Z)
- ev-28: frozen-review for trust-review (2026-11-17T07:48:02.476Z, subagent-stop)
- ev-29: frozen-review for trust-review (2026-11-17T07:55:24.594Z, subagent-stop)
- ev-30: check-run for checks-pass (2026-11-17T07:57:04.019Z)
- ev-31: adr-impact-declaration for adr-impact-declaration (2026-11-17T07:57:04.019Z)
- ev-32: migration-test for migration-compat-and-test (2026-11-17T07:57:14.707Z)
- ev-33: living-doc-current for living-doc (2026-11-17T07:57:14.925Z)
<!-- ospec:evidence:end -->
