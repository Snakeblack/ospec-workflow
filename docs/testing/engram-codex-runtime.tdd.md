# Issue #264: compatibilidad y registro de Engram en Codex

Fecha: 2026-10-07. [Issue #264](https://github.com/Snakeblack/ospec-workflow/issues/264).
Los recorridos se derivaron durante el diagnóstico, sin un plan externo.

## Causa y alcance

El ejecutable instalado era Engram 3.0.0, compilado desde `15a2f788` con cambios locales. El plugin Codex 0.1.5 invoca `engram hook codex-register` desde `_helpers.sh`. El ejecutable devolvía código 1 y `usage: engram hook claude-pre-tool-use|codex-pre-tool-use|codex-user-prompt-submit`; el helper ocultaba stderr y emitía el aviso de identidad ausente. `codex-resolve` también devolvía código 1. MCP seguía permitiendo lecturas.

El detector de ospec-workflow solo comprobaba presencia de plugin/MCP. Ahora comprueba por capacidad las tres operaciones del ciclo de sesión con entrada `{}`, sin ID ni directorio. Upstream rechaza esa entrada antes de acceder a HTTP; por tanto la sonda no registra ni termina sesiones. El timeout es de como máximo tres segundos por operación. Un error, timeout o salida inesperada es `unknown`; el rechazo con ayuda de CLI es `unsupported`. Ninguno se presenta como integración operativa ni provoca ejecutar setup con el binario incompatible.

Se mantiene la composición con el setup upstream y el comportamiento opcional/fail-open. No se añaden hooks ni servidores Engram a los artefactos generados. Incluso con soporte de comandos, el instalador exige comprobar el registro desde `SessionStart`: no acredita por sí solo el servidor, los hooks del host ni el guardado real.

## Recorridos y evidencia TDD

| Garantía | Prueba o comando | Evidencia |
|---|---|---|
| Plugin y MCP presentes no ocultan un binario incompatible | `scripts/configure/engram-setup.test.js`, `unsupported lifecycle` | RED inicial: `undefined` frente a `unsupported`; GREEN tras corrección |
| Cada operación se comprueba sin identidad y con plazo limitado | `probes every lifecycle operation` | RED inicial: capacidad ausente; GREEN con entrada `{}`, shell desactivado y timeout ≤ 3000 ms |
| Errores, timeout, soporte parcial y salida inesperada no dan falso éxito | `lifecycle errors`, `accepting registration alone`, `unexpected lifecycle output` | GREEN |
| Configuración incompatible o desconocida omite setup y ofrece recuperación para el home activo | `incompatible or unknown lifecycle` | RED inicial: `already configured`; GREEN con diagnóstico y cero acciones de instalación |
| Se identifica la operación fallida sin imprimir stderr arbitrario | `identifies the failed hook` | RED: faltaba `engram hook codex-resolve: unknown (exit 2)`; GREEN tras añadir resultados por operación |
| El soporte de comandos no demuestra registro de sesión | `available lifecycle and installed pieces` | RED inicial: `already configured`; GREEN con verificación startup/resume pendiente |
| Los siete generadores conservan el addendum sin registrar MCP/hooks de Engram | `scripts/configure/engram-scope.test.js` | GREEN |

RED: `node --test --test-name-pattern='(lifecycle|run codex)' scripts/configure/engram-setup.test.js`: seis pruebas ejecutadas, seis fallos por el comportamiento ausente. El hook pre-commit rechazó el checkpoint RED porque ejecuta las pruebas staged y exige éxito; no se desactivó ninguna guarda. La evidencia se conserva aquí para el commit GREEN.

GREEN: `node --experimental-test-coverage --test --test-coverage-include='scripts/configure/engram-setup.js' scripts/configure/engram-setup.test.js scripts/configure/engram-scope.test.js scripts/docs-lint.test.js`: 55 pruebas, 55 correctas. Cobertura del módulo modificado: 96,05 % líneas, 86,35 % ramas y 97,92 % funciones.

## Reparación local y hooks reales

Se descargó el archivo oficial Windows amd64 de [Engram 3.2.1](https://github.com/Gentleman-Programming/engram/releases/tag/v3.2.1) y se comprobó SHA256 contra `checksums.txt`. Se conservaron el ejecutable anterior, las configuraciones global y de Orca y un backup consistente de SQLite con `integrity_check: ok`, en `%LOCALAPPDATA%/engram/backups/issue-264-20261007/`. Se reemplazó el ejecutable en la misma ruta y se reinició solo el servidor HTTP, sin terminar los procesos MCP de otras sesiones. Se ejecutó el setup oficial en ambos homes; ninguno usa sustitución del prompt principal.

Se reprodujeron los hooks instalados de Windows usando la identidad y directorio originales del host, contrastados con `session_meta`. El registro se realizó exclusivamente desde el hook upstream; no se invocó `mem_session_start` ni se eligió otro ID.

| Hook instalado | Código | Tiempo | Resultado |
|---|---:|---:|---|
| SessionStart/startup, wrapper PowerShell → Git Bash | 0 | 1742 ms | Identidad de la sesión del host confirmada, stderr vacío |
| SessionStart/resume, mismo wrapper | 0 | 1496 ms | Misma identidad confirmada, stderr vacío |
| UserPromptSubmit, wrapper PowerShell nativo | 0 | 626 ms | JSON válido dentro del plazo de 2 s, stderr vacío |
| SessionStart/compact, wrapper PowerShell → Git Bash | 0 | 1301 ms | Misma identidad confirmada, stderr vacío |

Tras la confirmación, `mem_save` guardó el diagnóstico con ese ID registrado y devolvió éxito. Esto prueba el guardado MCP en esta sesión tras reparar el hook.

## Límites pendientes

El diagnóstico posterior reprodujo los avisos de OSpec al ejecutar comandos generados para cmd desde PowerShell. La corrección del lanzador, del home activo y la verificación de ambos homes se recogen en [Hooks Codex: shells y homes gestionados](codex-hook-shell.tdd.md), incluidos en la versión 2.108.1.

Los tiempos anteriores pertenecen a la reproducción directa de los hooks con datos originales del host, no a un nuevo arranque automático de Orca. La reanudación probada conserva una sesión activa; no se terminó esa sesión para forzar una continuación de una sesión cerrada. Los procesos MCP ya abiertos conservan el binario antiguo hasta que su host los reinicie.

Los hooks de Engram probados no reprodujeron el aviso recurrente. El fallo oculto de `codex-register` explica la identidad ausente; el informe posterior reproduce los fallos de los comandos OSpec instalados. La issue debe seguir abierta hasta verificar el arranque/reanudación automáticos en Orca y capturar el hook concreto si reaparece el aviso. El diagnóstico global de sincronización de `engram doctor` es independiente de esta evidencia.
