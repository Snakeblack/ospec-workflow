# Hooks Codex: shells y homes gestionados

Fecha: 2026-10-07. Continuación del diagnóstico de la issue #264. Los recorridos se derivaron de la petición de que ospec-workflow funcione con Codex directo y con un host como Orca; no se utilizó un plan externo.

## Causa y solución

El generador anteponía `set OSPEC_TARGET=codex&& set OSPEC_CODEX_WRAPPER=1&&` al comando Windows. En Windows PowerShell 5.1, `&&` es un error de sintaxis. En PowerShell 7, `set` no fija variables de entorno: SessionStart buscaba skills dentro del runtime, que deliberadamente no las contiene, y PreToolUse devolvía `allow` sin `updatedInput`. Codex 0.160.1 rechaza ese resultado.

El [contrato de hooks de Codex](https://developers.openai.com/codex/hooks) y su [parser de resultados en 0.160.1](https://github.com/openai/codex/blob/rust-v0.160.1/codex-rs/hooks/src/engine/output_parser.rs) documentan y verifican esa restricción de `allow`.

El punto de entrada `scripts/hooks/ospec-codex-hook.js` fija ambos marcadores en su propio proceso y llama al launcher compartido. Este conserva la selección del binario nativo y la adaptación del resultado. Los comandos generados solo necesitan Node y la ruta entre comillas, sin asignaciones del shell.

El setup global también ignoraba `CODEX_HOME`, y los productores SessionStart Node y Go solo reconocían el runtime de `~/.codex`. Ahora setup respeta un home activo absoluto; ambos productores reconocen ese runtime y el global heredado, conservando las skills en `~/.agents/skills`. La reinstalación sustituye los comandos de OSpec y conserva los de terceros.

El home real de Orca comparte `AGENTS.md` mediante un enlace al archivo global. Setup admite exclusivamente ese destino regular bajo `~/.codex`, conserva el enlace y escribe el bloque router en la ruta global validada. Un enlace a otro archivo o un destino global también enlazado sigue rechazado. No se necesita detectar el nombre del host ni relajar las guardas de rutas.

Las comparaciones usan la identidad física de los directorios: macOS puede exponer un mismo runtime mediante `/var/...` y `/private/var/...`. Node y Go resuelven ambas rutas antes de reconocer la instalación; el destino global de instrucciones se compara y escribe por su ruta real, después de validar la raíz.

## Recorridos y pruebas

| Garantía | Evidencia ejecutable |
|---|---|
| El comando generado e instalado arranca sin marcadores de entorno heredados | `scripts/configure/codex-hook-shell.test.js`: shells reales, ruta con espacios, SessionStart y PreToolUse |
| Una llamada segura conserva la aprobación normal y una llamada prohibida sigue bloqueada | Misma prueba: JSON vacío y decisión `deny`; el comando prohibido solo se entrega como datos al hook, nunca se ejecuta |
| La reinstalación migra comandos antiguos y no duplica grupos propios | Misma prueba: dos instalaciones y comparación de bytes, conservación de hooks de Orca y usuario |
| El setup actualiza un CODEX_HOME aislado sin tocar los hooks del home por defecto | Misma prueba: setup completo con home gestionado y comparación del archivo anterior |
| El runtime aislado descubre las skills compartidas | Misma prueba de ejecución instalada y regresiones de `scripts/hooks/session-start.test.js` e `internal/hooks/sessionstart_test.go` |
| Un home puede compartir las instrucciones globales sin autorizar destinos arbitrarios | Misma prueba: enlace conservado, texto del usuario intacto, reinstalación idempotente y rechazo de enlaces ajenos o encadenados |

## RED

`node --test scripts/configure/codex-hook-shell.test.js`: cmd pasó; Windows PowerShell y PowerShell 7 fallaron por la sintaxis y la raíz de skills equivocada. También fallaron la eliminación de asignaciones shell-dependent y el respeto de CODEX_HOME. La prueba adicional del home aislado falló con `No SKILL.md files found`.

`node --test --test-name-pattern='custom home' scripts/hooks/session-start.test.js` y `go test ./internal/hooks -run '^TestSessionStart_CustomCodexHome$' -count=1`: fallo por la búsqueda de skills dentro del runtime gestionado. La fixture Go se completó después con su ancla de identidad de instalación, que el registro externo exige.

El pre-commit rechazó el checkpoint RED porque ejecuta las pruebas staged y exige éxito. No se desactivó ninguna guarda; este informe conserva la evidencia.

El setup en el home real de Orca reprodujo otro RED por su enlace `AGENTS.md`; la prueba `managed home preserves` falló con la misma protección de rutas. Tras el rechazo se reconciliaron los archivos: hooks y config seguían idénticos a sus backups y no se habían creado los directorios de agents o runtime. La corrección añade un destino explícito permitido para las instrucciones compartidas.

La primera [CI de macOS de la PR #265](https://github.com/Snakeblack/ospec-workflow/actions/runs/37609858696/job/112754215760) reprodujo la diferencia entre rutas lexicales y físicas: fallaban el arranque instalado y el enlace válido de instrucciones. Se añadieron alias de directorios a las pruebas existentes; en Windows, las junctions reprodujeron dos RED Node y un RED Go por comparación lexical. La corrección resuelve ambos extremos a su ruta real y conserva las pruebas de rechazo de destinos ajenos. La publicación exige una nueva CI verde del commit corregido.

## GREEN y límites

La validación final local completó:

- `node scripts/check.js`: 3.248/3.248 pruebas y generación/validación de los siete targets, sin errores.
- Selección con cobertura: 255/255 pruebas, sin skips, incluyendo cmd, Windows PowerShell 5.1, PowerShell 7 y Git Bash. Cobertura de líneas de installer, SessionStart y transformador: 91,93 % (ramas 86,12 %, funciones 94,17 %). V8 no incluye en ese porcentaje el wrapper ejecutado en procesos hijos; sus resultados se comprueban por ejecución real.
- `go test ./internal/hooks -count=1`: suite completa del productor nativo aprobada.
- `git diff --check`: aprobado.

El setup estándar terminó en `C:/Users/sn4ke/.codex` y en `C:/Users/sn4ke/AppData/Roaming/orca/codex-runtime-home/home`, usando su `CODEX_HOME`. Los hooks y configs originales se copiaron antes a `AppData/Local/ospec-workflow/backups/codex-hooks-20261007-122224`. En ambos homes, la comparación con esas copias confirma que todos los handlers ajenos se conservan y hay exactamente un handler OSpec por cada uno de sus cinco eventos. El enlace de instrucciones de Orca se conserva.

Se ejecutaron 24 llamadas con los comandos instalados: SessionStart, PreToolUse seguro y PreToolUse prohibido, en los cuatro shells y ambos homes, sin marcadores de target heredados. Todas pasaron; las seguras devuelven `{}` y las prohibidas conservan `deny`. El payload prohibido nunca se ejecutó como comando.

La matriz CI existente ejecuta `node scripts/check.js` en Ubuntu, Windows y macOS. Las pruebas de shell usan sh y Bash en POSIX, y cmd, Windows PowerShell y los shells adicionales disponibles en Windows. No se presenta una ejecución local Windows como evidencia de CI o de un nuevo arranque automático del host.

El arranque automático requiere reiniciar o reanudar Codex para cargar las definiciones. No se alteraron hashes de confianza del host. El texto de Engram que solicita ToolSearch es un mensaje independiente del plugin, no la causa de estos fallos de comandos OSpec.

## Aislamiento de pruebas (2026-10-09)

El aviso `Hook failed - hook exited with code 1` se reprodujo por otra causa: los tests heredaban el `CODEX_HOME` real pese a inyectar un `homedir` temporal. Los fixtures unitarios y de convergencia reemplazaron el runtime y dejaron grupos `node test.js`; el hook configurado terminaba con `MODULE_NOT_FOUND`. El smoke global también escribía agentes en el perfil real.

Las tres suites inyectan ahora `env: {}` en las instalaciones globales simuladas. Las pruebas de homes activos conservan su entorno explícito; el contrato del instalador en producción sigue respetando `CODEX_HOME`.

`scripts/configure/install-codex-env-isolation.test.js` ejecuta las tres suites con un home heredado centinela y compara la huella de sus rutas y bytes antes y después. El proceso hijo elimina `NODE_TEST_CONTEXT` y comprueba el contador de pruebas para no aceptar una ejecución vacía. La reproducción y el cierre están en `idd/archive/2026-10-09-codex-test-home-isolation/`.
