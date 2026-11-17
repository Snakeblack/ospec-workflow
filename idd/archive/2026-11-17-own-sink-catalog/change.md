# own-sink-catalog

## Intent and acceptance

Catálogo propio de sinks de seguridad en scripts/lib/idd-sinks.js, derivado de las debilidades que security-boundary quiere ver y de las API de cada lenguaje, en lugar de la adaptación del de gentle-ai (E1.100)

Acceptance: scripts/lib/idd-sinks.js no adapta el catálogo de gentle-ai ni lleva su aviso MIT; cada línea que el catálogo anterior detectaba sigue derivando security-boundary con la misma etiqueta (el corpus actual de idd-sinks.test.js pasa sin cambios y una comparación contra el catálogo anterior no encuentra pérdidas); la spec de IDD y el handbook dejan de decir que está adaptado; node scripts/check.js pasa

## Request and answers

<!-- ospec:log:start -->
Request (2026-11-17T22:44:44.410Z):

> continua

Answer 1 — open-facts, user, 2026-11-17T22:50:12.509Z:

> todas las recomendadas
<!-- ospec:log:end -->

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-sinks.js`, `scripts/lib/idd-sinks.test.js`
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El catálogo se ordena por debilidad: cada una declara su etiqueta y sus reglas por lenguaje (tabla LANGUAGES), y sinkOf recorre las reglas de la extensión en el orden de las debilidades; las etiquetas y el orden de las once debilidades de E1.50 se conservan porque forman parte de la clave de las retiradas respondidas
- La comprobación de host SSH desactivada (ssh.InsecureIgnoreHostKey, AutoAddPolicy, StrictHostKeyChecking=no) lleva su propia etiqueta con CWE-322, porque una clave de host no es un certificado TLS, y va la última para no quitarle la etiqueta a una línea que otra debilidad ya nombraba
- chmod cuenta con cualquier modo octal que deje escribir a otros (último dígito 2, 3, 6 o 7) porque la umask no lo filtra; mkdir, open y WriteFile pasan por la umask, así que las llamadas nuevas de creación solo cuentan con 777 y las ya detectadas conservan 0777, 0o777 y 0666; el modo tiene que ser un argumento propio, no un número dentro de una ruta ni la máscara de mode & 0o777
- createHash solo cuenta en JS y MessageDigest solo en JVM: son API de esos lenguajes; la regla genérica de md5 o sha1 sobre una credencial sigue en los ocho lenguajes de backend
- vm cuenta en sus llamadas runIn*Context, que ejecutan código; new vm.Script y compileFunction solo compilan y no cuentan (el validador del pre-commit compila para comprobar la sintaxis); spawn y execFile cuentan con shell: true solo cuando el comando no es una constante, porque spawn('npm', [...], { shell: true }) es la forma habitual en Windows
- Las expresiones que tenían forma propia en el catálogo de gentle-ai se reescriben, casi siempre ampliándolas (curl -sSk, checkServerTrusted con throws, el verify de un HostnameVerifier anónimo, subprocess con shell=True y cualquier comando que no sea una lista ni una constante, CORS sin exigir punto y coma); quedan seis que solo nombran una API de la única forma natural
- La prueba de que no se pierde nada es el corpus: el anterior sigue sin cambios y KNOWN añade un caso por cada alternativa que ya se detectaba y no tenía uno; la comparación contra el catálogo de main y el barrido de repositorios se hicieron fuera del repositorio
- Las formas nuevas de comando compuesto de PHP y Ruby solo cuentan en una llamada a función, no en un método: el exec de PDO, SQLite3 o pg ejecuta SQL y conserva la etiqueta de SQL compuesto; una línea que pasa un literal SQL directamente a exec o system de PHP y Ruby, a exec de Python o a Runtime.exec informa del comando o del código que esa función ejecuta
<!-- ospec:decisions:end -->

### Medidas

- Contra el catálogo de `main`, sobre las 289 líneas del corpus de `idd-sinks.test.js` y 53 sondas, más 2023 variantes de espaciado: ninguna línea que se detectaba deja de detectarse, y ninguna cambia de etiqueta.
- Excepción aceptada: el SQL compuesto que llega a algo que lo ejecuta como comando de shell o como código (`exec` o `system` de PHP y Ruby, `%x[...]` de Ruby, `exec` de Python, `Runtime.exec`) informa ahora de ese comando o ese código. En 68 sondas de SQL dentro de llamadas `exec` y `query`, solo cambian esas 12; los métodos `exec` de base de datos conservan la etiqueta de SQL compuesto.
- Falsos positivos: el código de producto de 16 repositorios locales (unas 700 000 líneas) da los mismos hits que con el catálogo anterior, salvo cinco `exec(compile(...))` de Python que sí evalúan código. En este repositorio, los mismos 5 hits.
- Texto del original: quedan 6 de sus 53 expresiones, todas el nombre de una API escrito de la única forma natural; ninguna línea de 30 caracteres o más coincide.
- Revisión de confianza (Opus): un CRITICAL (la regla `%x` de Ruby perdía líneas con `|`) y dos avisos (los métodos `exec` de base de datos cambiaban de etiqueta; `curl -kL` no se detectaba), corregidos los tres; el validador dio la corrección por buena, sin regresión.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-17T23:06:23.665Z)
- ev-2: adr-impact-declaration for adr-impact-declaration (2026-11-17T23:06:23.665Z)
- ev-3: frozen-review for trust-review (2026-11-17T23:18:23.940Z, subagent-stop)
- ev-4: check-run for checks-pass (2026-11-17T23:20:32.626Z)
- ev-5: adr-impact-declaration for adr-impact-declaration (2026-11-17T23:20:32.626Z)
- ev-6: check-run for checks-pass (2026-11-17T23:22:30.720Z)
- ev-7: adr-impact-declaration for adr-impact-declaration (2026-11-17T23:22:30.720Z)
- ev-8: check-run for checks-pass (2026-11-17T23:24:37.535Z)
- ev-9: adr-impact-declaration for adr-impact-declaration (2026-11-17T23:24:37.535Z)
- ev-10: living-doc-current for living-doc (2026-11-17T23:24:37.944Z)
<!-- ospec:evidence:end -->
