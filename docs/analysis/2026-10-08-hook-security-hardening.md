# Seguridad de hooks: E1.17 y mejoras pendientes

Estado examinado: rama `fix/hook-boundary-reliability`, base v2.117.8. Evaluaciones de política con archivos sintéticos; no equivalen a un banco de agentes ni a una exfiltración real. La revisión de dependencias, los permisos del sistema y los siete hosts en ejecución real quedan fuera de esta inspección.

## Correcciones de E1.17

- JS y Go reutilizan AgentShield para operandos literales de lectores comunes y `< archivo`. Distinguen comillas, comentarios, valores de opciones y redirecciones de salida. Una denegación de comando o archivo gana frente al aviso por secretos.
- El launcher limita su hijo directo a 4000 ms y descarta stdout parcial ante arranque fallido, señal, salida no cero o respuesta PreToolUse inválida. Los fallos producen ASK o un aviso según el host y el modo; no se describen como bloqueo en Codex/Cursor.
- Se conserva la política de bypass por respuesta explícita del usuario: los ASK se convierten en allow con aviso; los DENY siguen siendo DENY.
- El timeout utiliza SIGKILL: [Node documenta](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options) que un hijo que maneja SIGTERM puede prolongar la espera de `spawnSync`. La prueba real de un hijo de 8 s devolvió ETIMEDOUT alrededor de 4,1 s en Windows. No garantiza contención de nietos ni del árbol de procesos completo.
- Una prueba compara las 18 reglas JS con el JSON embebido por Go, incluyendo patrón, flags, acción y motivo. La paridad protege contra deriva; no demuestra que las regex detecten cualquier comando peligroso.

## Puntos de mejora comprobados

Reproducción: `node docs/analysis/probes/hook-security-boundary.cjs`. El probe solo evalúa entradas del hook, limpia sus archivos y desactiva Token Advisor para aislar AgentShield; no desactiva AgentShield. `null` significa ausencia de decisión.

| Prioridad | Entrada y resultado observado | Mejora y tradeoff |
| --- | --- | --- |
| 1 | `Read alias.txt`, enlace a `.env`, devuelve `null`; la lectura directa devuelve ASK. El contenido sintético no coincide con tokens. | Clasificar también la ruta canónica del enlace en JS/Go. Mantener original y destino para no perder la regla del nombre original. Mejora accesos por enlace; no resuelve hardlinks, carreras ni alias de shell. |
| 2 | Un PEM sintético con cabecera de clave privada en `notes.txt` devuelve `null`. | Reconocer cabeceras de clave privada con casos positivos/negativos. La acción para contenido detectado debe acordarse: un ejemplo documental puede producir un falso positivo. |
| 3 | Un token conocido sintético en `small.txt` produce ASK; el mismo al principio de `large.txt` (>1 MiB) devuelve `null`. El límite es parte del contrato actual. | Escanear una muestra acotada o declarar explícitamente que no se inspeccionó. Una muestra deja huecos; leer todo aumenta coste y tiempo del hook. |
| 4 | Una lectura dentro de `node -e` y `cat "$FILE"` devuelven `null`. El lector literal y la redirección sí producen ASK tras E1.17. | Añadir casos concretos de wrappers solo cuando haya demanda y reproducción. El aislamiento y los permisos del host deben cubrir código e intérpretes; un parser de shell propio no ofrece contención completa. |

Estos puntos quedan documentados como follow-ups; no son política nueva aprobada ni trabajo terminado. El orden del roadmap vigente se conserva.

## Límites de la garantía

AgentShield es una capa heurística de avisos y denegaciones. En bypass, Codex y Cursor, un aviso de secretos permite continuar por política aceptada. `DISABLE_AGENT_SHIELD` sigue siendo un interruptor explícito. Los hooks no constituyen una frontera de aislamiento del sistema: los permisos de archivos, la gestión externa de credenciales y las restricciones del host deben asumir ese papel.

La comparación con un `.env` inexistente no sirve para demostrar el comportamiento antiguo de Read: `extractPaths` solo considera archivos existentes. El probe crea los fixtures antes de evaluar. El enlace simbólico se pudo crear en esta máquina; donde el sistema lo prohíba, el probe informa `skipped` y esa reproducción queda pendiente.

## Validación del cambio

Reproducciones rojo→verde JS y Go registradas por IDD. Pruebas de lectores literales, referencias inocuas, precedencia DENY, bypass, adapters, errores de proceso y timeout real. El resultado de la revisión congelada, los checks completos y el cierre se conserva en el estado IDD, no se presume por esta nota.

## Seguimiento de seguridad del repositorio

Durante la preparación de v2.117.9, la API de GitHub para la protección clásica de `main` devolvió `404 Branch not protected` y la consulta de reglas efectivas `repos/Snakeblack/ospec-workflow/rules/branches/main` devolvió `[]`. El flujo exige CI y PR, pero GitHub no impone esas restricciones en `main`. Como mejora pendiente, configurar reglas que exijan PR y checks obligatorios, limitando el push directo y los bypass. Aumenta la protección ante cambios accidentales o una cuenta comprometida; puede bloquear mantenimiento urgente y requiere acordar quién conserva permisos de excepción. No se cambió la configuración remota.
