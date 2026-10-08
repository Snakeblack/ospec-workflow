# Permisos, evidencia y contexto: análisis OSP del 2026-10-08

**Estado examinado:** v2.117.3, commit `d22a1e00a720c159443326dd5fd68a1c0fc307d3`. Análisis previo a correcciones: no demuestra capacidades reparadas. La prioridad vigente y los criterios de cierre están únicamente en el [roadmap](../roadmaps/harness-evolution.md#orden-recomendado-de-trabajo), E1.16–E1.20. El usuario pidió abordarlos en la siguiente sesión.

## OSP-017: permiso afirmativo sin objeción

`scripts/hooks/pre-tool-use.js:438`, `:440` y `:489` y `internal/hooks/pretooluse.go:477`, `:488` devuelven allow para herramientas o comandos sin objeción. El adaptador Codex ya lo convierte en `{}`. La documentación oficial distingue allow —que omite la petición de permiso salvo las excepciones del host— de salida vacía; las reglas explícitas deny/ask del usuario siguen aplicándose. [PreToolUse decision control](https://code.claude.com/docs/en/hooks#pretooluse-decision-control).

**Paso 0 real:** Claude Code 2.1.289, `claude-sonnet-5-5`, effort low, Windows, repos temporales distintos y build por defecto 2.117.3 sin SDD, con binario Go del checkout. Ambos brazos usaron `--permission-mode default`, `--tools Write`, sin `--allowedTools`, una sola llamada Write, misma autenticación y permisos vacíos. Preferencias aisladas con `--setting-sources ""` y `--settings`; MCP vacío y estricto. Solo el segundo añadió `--plugin-dir`. [Opciones del CLI](https://code.claude.com/docs/en/cli-reference).

| Brazo | Evidencia observable | Tiempo | Coste reportado |
| --- | --- | --- | --- |
| Sin ospec | Write denegado en permission_denials; archivo ausente | 8.395 s | 0.006492 USD |
| Con ospec | Write ejecutado; archivo comprobado contiene `OSP-017` y salto de línea; sin denegaciones | 6.475 s | 0.0065956 USD |

Ambos procesos terminaron 0: la creación real y el registro de denegación son la evidencia, no el exit del modelo. El defecto queda confirmado para este caso. Una repetición no prueba todos los tools ni targets. La reparación recomendada elimina la decisión neutral, conserva las explícitas y repite este ensayo antes de aceptar. Copilot, VS Code y la preservación de Cursor necesitan verificarse en el cambio.

## OSP-001/002/003: secretos y launcher

- Evaluación de stdin en JS y Go, con `.env` sintética: Read pide ask en default, pasa a allow más aviso en bypass, y Bash con `cat .env` pasa allow. Los comandos evaluados no se ejecutaron y no se leyeron secretos reales. El clasificador actual opera sobre rutas de herramientas de archivo, no operandos del shell.
- La degradación de ASK, incluido AgentShield, es explícita en la spec de hooks, sección 3.4.1, y en `applyPermissionMode`. Cambiarla es una decisión de política pendiente; los adaptadores Codex y Cursor no ofrecen ASK nativo equivalente. Priorizar la reparación no autoriza sustituir esa política por DENY.
- `ospec-hooks-launch.js:420` usa spawnSync sin timeout. Un hijo controlado respondió después de 6.089 s; el host declara 5 s. Un ejecutable inválido produjo `continue: true`, exit 0, en 53 ms. Se demuestra ausencia de deadline propio y continuación ante error de arranque, no el resultado final de todos los fallos o de un timeout real del host.
- Las ocho reglas DENY y diez ASK del JS coinciden con las 18 de `internal/rules/rules.json`, normalizando regex, flags, acción y motivo. Una prueba de igualdad previene deriva futura. No hay divergencia actual que reparar.
- No se recibieron los tres ejemplos exactos de evasión: ninguna regex concreta queda justificada por este análisis. Clasificar toda palabra puede producir falsos positivos y no cubre expansión o intérpretes; evitar un parser general de shell sin necesidad probada.

## OSP-018: frescura de configuración y estado

El hook permite Write sobre `idd/probe/state.yaml` y un Bash que lo escribiría. Son evaluaciones de política: no se ejecutó la escritura de estado. La hipótesis de protección solo por una frase es incompleta: `idd-store` valida lecturas, `idd-contract.validateState` comprueba esquema y referencias de evidencia, y `requireFreshChecks` compara la huella al cerrar. No repetir toda la suite en close es reutilización deliberada de evidencia.

**Contraejemplo real, sin manipular estado:**

1. Consumidor temporal con README e `idd/config.yaml` versionados. CLI instalado abre intención documental, declara señales y ejecuta check tras editar README. Comando configurado `node -e "process.exit(0)"`: exit 0 y ready.
2. Se cambia solo el comando smoke de configuración a `node -e "process.exit(7)"`.
3. Ejecución independiente del nuevo comando: exit 7. `readTreeFingerprint` antes y después es idéntico.
4. CLI close acepta y archiva como closed a `2026-10-08T13:04:26.192Z`, utilizando la evidencia anterior.

`idd-workspace.js:75`, `:175` y `:197` excluyen todo `idd/` de diff, huella y snapshot, incluida configuración verificadora. REQ-idd-014 también especifica esa exclusión: el hueco afecta al contrato y a su implementación. Incluir configuración en la identidad o vincularla explícitamente a la evidencia aborda el caso probado. Un guard de estado es complementario y no lo cubre. No se ha demostrado una falsificación manual válida de state.yaml.

## OSP-019: contexto del revisor IDD

La build por defecto contiene `agents/review-trust.md` con 36.865 bytes: 23.517 bytes de `sdd-phase-common`, el 63,79 %. Esa sección referencia `agents/sdd-orchestrator.agent.md`, ausente sin SDD. Sobrecarga y referencia inaplicable confirmadas.

El supuesto conflicto fatal de formatos no está demostrado: `review-lineage.js:490` exige un objeto con array findings, pero admite otros campos. `review-judgment.md:45` contempla el contrato de despacho además del envelope SDD.

**Ciclo IDD real en consumidor sin openspec:** intención y señales, candidato congelado mediante review start, siete aserciones independientes de comportamiento. Claude ejecutó el agente generado con `--agent ospec-workflow:review-trust`, herramientas Read/Glob/Grep y contrato explícito de findings. Leyó README y código, sin escribir, ejecutar tests o delegar. Coste 0.0766558 USD y 6.918 s.

El resultado incluyó prosa y una línea JSON literal `{"findings":[]}`. Un parser de JSON puro falló; se extrajo esa línea sin cambiar hallazgos. Review record la aceptó, check fue ready y close archivó a `2026-10-08T12:56:21.773Z`. Se declara esa extracción: no demuestra respuesta estrictamente JSON ni automatización sin intervención. Tampoco prueba el evento nativo Agent/SubagentStop, una corrección ni un caso adverso con hallazgos.

No se encontraron trust-review en los archives IDD versionados; eso no excluye uso en otros consumidores. E0.0 registra una prueba real antigua de carga del agente, distinta del ciclo IDD. Simplificar referencias es una opción si conserva ambos modos y reduce contexto; no sustituir reducers, estados o garantías por un fallo no reproducido.

## OSP-020: documentación de instalación

Las guías `docs/plugin-installation.md` y `.es.md` describen en la tabla Claude el argumento nombrado anterior a E1.8 y emisión incondicional del orquestador; las entradas Codex global/local repiten la expectativa de skill SDD. Otros apartados ya lo explican bien. `target-transform.js:879–887` conserva la entrada única completa mediante `$ARGUMENTS` y la build por defecto no lleva SDD. Bastan correcciones de las entradas existentes, contrastadas con builds por defecto y `--with-sdd`.

## Evidencia conservada y límites para retomar

Las ejecuciones y sus transcripciones permanecen fuera del proyecto en `%TEMP%/ospec-osp-audit-20261008-EAD1sY/` de la máquina auditada:

| Archivos | Función |
| --- | --- |
| `step0.cjs`, `step0-retry-results.json`, carpetas retry-* | Par válido OSP-017; el script recibe checkout y perfil autenticado |
| `hook-probes.cjs`, `hook-results.json` | JS/Go, launcher, igualdad de tablas y tamaño del revisor |
| `config-freshness-probe.cjs`, `config-freshness-results.json` | Contraejemplo determinista de configuración mediante CLI real |
| `trust-start.json`, `trust-transcript.jsonl`, `trust-result.json`, `trust-results.json` | Revisión real y evidencia de registro/cierre |
| `informe.md` | Informe completo del análisis previo |

Los temporales no son una garantía permanente de disponibilidad: esta nota conserva método y resultados; las implementaciones deben convertir los contraejemplos pertinentes en pruebas reproducibles versionadas. `trust-probe.cjs` conserva el parser estricto que falló; el JSON literal se registró después, sin un segundo despacho de descubrimiento.

**Incidencia de autenticación:** el primer ensayo copió OAuth del perfil del banco a perfiles temporales. Un brazo funcionó y otro falló antes de las herramientas; comparación descartada. El intento posterior con el perfil original también falló con `OAuth session expired and could not be refreshed`. La rotación por copia es una causa probable, no demostrada leyendo tokens. Las copias se eliminaron. La repetición válida compartió almacenamiento de autenticación global y aisló settings/MCP por flags. No volver a copiar OAuth; comprobar/reautenticar el perfil dedicado antes del banco. No hay un banco nuevo en verde.

Coste total reportado de ensayos de modelo: aproximadamente 0.09885 USD, incluyendo el brazo descartado. Son muestras exploratorias; no prueban ahorro general, variabilidad ni menor tasa de defectos. La suite 3368/3368 y CI verdes corresponden a v2.117.3, sin estos arreglos. El hook de la sesión rechazó texto peligroso de un fixture no ejecutado; se omitió ese caso y no se desactivó la protección.
