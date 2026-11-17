# secret-guard-file-kinds

## Intent and acceptance

Los guards de secretos dejan tres límites documentados por E1.92: no ven una contraseña sin comillas o solo de letras en un fichero de configuración, no deniegan por nombre una clave privada bajo .ssh que no se llama id_* ni *.key, y deniegan un directorio cuyo nombre empieza por id_ como si fuera una clave

Acceptance: El corpus compartido fija los tres casos en Node y Go: en un fichero de configuración la censura de salida y el pre-commit ven password: valor sin comillas y una contraseña solo de letras; un lector sobre una clave bajo .ssh con otro nombre da deny, y config, known_hosts y *.pub no; rg TODO id_service/ y una herramienta de lectura sobre un directorio id_* no se deniegan; el handbook retira esos límites

## Plan

<!-- ospec:plan:start -->
- Files: `docs/harness-go-js-parity.md`, `docs/harness-runtime.md`, `docs/roadmaps/harness-evolution.md`, `handbook/proteccion/guardrails.md`, `internal/hooks/posttooluse.go`, `internal/hooks/posttooluse_test.go`, `internal/hooks/pretooluse.go`, `internal/hooks/pretooluse_test.go`, `internal/hooks/secretguards_corpus_test.go`, `internal/hooks/secretredact.go`, `internal/hooks/secretredact_test.go`, `internal/hooks/secretscan.go`, `internal/hooks/secretscan_test.go`, `internal/hooks/shellfileaccess.go`, `internal/hooks/shellfileaccess_test.go`, `internal/testdata/secret-guards/cases.json`, `openspec/specs/agent-shield-security/spec.md`, `scripts/hooks/lib/secret-guards.corpus.test.js`, `scripts/hooks/lib/secret-redact.js`, `scripts/hooks/lib/secret-redact.test.js`, `scripts/hooks/lib/secret-scan.js`, `scripts/hooks/lib/secret-scan.test.js`, `scripts/hooks/lib/shell-file-access.js`, `scripts/hooks/lib/shell-file-access.test.js`, `scripts/hooks/post-tool-use.js`, `scripts/hooks/post-tool-use.test.js`, `scripts/hooks/pre-commit-hook.js`, `scripts/hooks/pre-commit-hook.test.js`, `scripts/hooks/pre-tool-use.js`, `scripts/hooks/pre-tool-use.test.js`
- Work units: 3
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- Fichero de configuración (respuesta del usuario): por extensión .yml, .yaml, .ini, .properties, .toml, .conf y .cfg, y por nombre appsettings*.json, local.settings.json, config.json, config.<entorno>.json y settings.json. El modo vale para la censura de salida y el pre-commit; el escáner que pide confirmación de lectura no cambia.
- En un fichero de configuración solo se censura el valor bajo un nombre sensible. Un nombre de contraseña (password, passwd, passphrase, contraseña, un pass con prefijo) acepta un valor de 4 caracteres o más sin blancos que no sea referencia ni placeholder; un token, una clave y secret siguen pidiendo forma de secreto, porque la medición dio un falso positivo con el permiso id-token de un workflow y secret nombra también un objeto (existingSecret). La regla del valor opaco bajo cualquier clave sigue siendo solo del modo de fichero sensible.
- Las traducciones no son ficheros de configuración: lo que hay bajo un directorio locale, locales, i18n, l10n, lang, langs, translation o translations, y un bundle de Java con sufijo de idioma. Medido sobre los ficheros de configuración de /usr/share, /etc y node_modules, las traducciones daban 127 de las 144 detecciones nuevas; las 17 restantes son contraseñas de ejemplo y un token real, y en los ficheros versionados de 15 repositorios del usuario no hay ninguna.
- Bajo un directorio .ssh (respuesta del usuario) todo fichero es una clave privada salvo config, known_hosts, known_hosts.old, authorized_keys, authorized_keys2, environment, rc, allowed_signers, revoked_keys y los *.pub. Un comodín o una expansión en el nombre se deniega salvo *.pub, lo que sustituye a la comparación del comodín con los nombres de OpenSSH; y el propio directorio se deniega cuando lo lee un lector o una herramienta de lectura, porque la regla no valdría si se pudiera leer entero. mkdir, rmdir y cd se suman a los comandos que nombran sin leer.
- Un directorio no es una clave por su nombre: el clasificador recibe si la ruta es un directorio (acaba en barra o existe como tal) y deja de aplicar la regla de id_* y *.key; bajo .ssh un directorio sí cuenta. Un nombre id_* que no existe se sigue denegando.
- Tras la revisión de confianza: la exención de confirmación de una lectura solo cuenta el modo del fichero (sensible o de configuración) cuando lo nombra una de las claves de las que PostToolUse toma el modo (file_path, filePath, path, notebook_path); un fichero nombrado de otra forma, como el glob o el include de una búsqueda, se comprueba en modo normal, que es como se censurará su salida. Corrige también el mismo desajuste que ya existía con el modo de fichero sensible.
- Tras la revisión de confianza: en un fichero de configuración o sensible, el valor sin comillas de un nombre sensible llega hasta el primer blanco, de modo que almohadilla, punto y coma y coma son parte de él y un comentario solo empieza tras un blanco; un valor con una comilla dentro se descarta, porque la medición dio un falso positivo con texto dentro de una cadena. Un valor cifrado por sops (ENC[) cuenta como referencia. Una contraseña de un fichero de configuración cuenta aunque contenga password o secret, como en un .env: medido, añade una sola detección, que es una contraseña de ejemplo.
- Tras la revisión de confianza: si la orden cambia de directorio (un cd, pushd o popd que es un comando, --chdir, env -C o sudo -D), la exención de directorio deja de consultar el disco del espacio de trabajo y solo vale la barra final, porque el operando se resuelve en otro directorio. La palabra cd como argumento de otro comando no la desactiva.
- Tras la segunda revisión de confianza (aprobada, con una sugerencia): el cambio de directorio se toma de los comandos que visita el recorrido de la línea de comandos, no de una expresión sobre el texto, así que un cd detrás de if, de una negación, de time o de command, en un shell anidado o en una sustitución también desactiva la exención de directorio, y la palabra cd como argumento de otro comando no. Queda como límite, que el validador anotó sin bloquear: un cd dentro del cuerpo de una función o de una rama de case no se reconoce, y con un directorio del espacio de trabajo que se llame como una clave la exención sigue valiendo.
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-11-17T10:42:08.819Z)
- ev-2: check-run for checks-pass (2026-11-17T10:51:36.265Z)
- ev-3: adr-impact-declaration for adr-impact-declaration (2026-11-17T10:51:36.265Z)
- ev-4: migration-test for migration-compat-and-test (2026-11-17T10:51:58.625Z)
- ev-5: frozen-review for trust-review (2026-11-17T11:11:09.095Z, subagent-stop)
- ev-6: frozen-review for trust-review (2026-11-17T11:27:58.260Z, subagent-stop)
- ev-7: check-run for checks-pass (2026-11-17T11:31:25.433Z)
- ev-8: adr-impact-declaration for adr-impact-declaration (2026-11-17T11:31:25.433Z)
- ev-9: migration-test for migration-compat-and-test (2026-11-17T11:31:46.341Z)
- ev-10: frozen-review for trust-review (2026-11-17T11:46:04.832Z, subagent-stop)
- ev-11: frozen-review for trust-review (2026-11-17T11:51:09.150Z, subagent-stop)
- ev-12: check-run for checks-pass (2026-11-17T11:52:54.034Z)
- ev-13: adr-impact-declaration for adr-impact-declaration (2026-11-17T11:52:54.034Z)
- ev-14: migration-test for migration-compat-and-test (2026-11-17T11:53:09.453Z)
- ev-15: living-doc-current for living-doc (2026-11-17T11:53:24.477Z)
<!-- ospec:evidence:end -->
