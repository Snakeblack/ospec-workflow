# Comparativa del harness, el uso y el producto frente a gentle-ai

**Fecha:** 2026-11-16 · **Base auditada:** ospec-workflow v2.178.1 (`1ee55219`) · **Referencia externa:** gentle-ai `main` (`3ccb9458`, 2026-11-15), release v4.5.0.

Este informe compara el harness, cómo se usa y el producto que lo rodea. Es de solo lectura: no se ejecutó ninguno de los dos harness y no cuenta ningún resultado de banco antiguo. Las notas son juicio técnico sobre código y contratos, no medidas. Amplía la [auditoría del 2026-10-25](2026-10-25-auditoria-harness-frente-a-gentle-ai.md), que dejó fuera el producto, y alimenta el [roadmap](../roadmaps/harness-evolution.md) con los ítems E1.75 a E1.91 y los ajustes a E1.59, E4.13 y E5.9.

## Resumen

1. **ospec está mejor pensado y gentle-ai, mejor montado.** En ospec el CLI es dueño del estado y un cambio solo se da por hecho con evidencia que el CLI ha visto. gentle-ai se usa con menos fricción, delega mejor, revisa con más rigor cuando el riesgo es alto y tiene mucho más producto alrededor.
2. **La diferencia más grande a favor de ospec es foundation:** ADRs con `- Check:` que bloquean el cierre, mapa de conocimiento y recuperación brownfield. gentle-ai no tiene capa de arquitectura.
3. **La más grande en contra es la delegación y la economía de contexto dentro de IDD.** IDD no dice nada de delegación, no tiene verificador independiente del pedido y solo revisa con la lente trust.
4. **gentle-ai ya no tiene SDD.** Lo retiró en v4.0.0. Su flujo es ODD (Organic Driven Development), con el estado en un markdown que escribe el modelo, y RDD (Receipt-Driven Development), una review nativa en Go activa por defecto.
5. **El plan cierra esas brechas haciendo que lo calcule y lo compruebe el CLI, no el prompt.** El nivel de riesgo, la pregunta obligatoria, el verificador y la superficie de edición salen del CLI; los mods de Claude son una capa opcional encima.

## 1. Método y límites

- **gentle-ai, leído directamente:** el orquestador de Claude, `_shared/odd-orchestrator-sections.md`, el bloque de routing renderizado, `_shared/review-ledger-contract.md`, `_shared/verify-method.md`, los agentes de review y el refutador, `internal/reviewtransaction/risk.go`, los hooks y la línea base de bytes instalados.
- **ospec:** `skills/idd` y sus referencias, `skills/foundation`, el catálogo IDD, `ospec --help`, la contraprueba de `scripts/lib/idd-check.js`, los hooks en Go, los revisores y el roadmap.
- **Producto:** dos exploradores de solo lectura recorrieron instaladores, TUI, soporte multi-agente, CI y documentación. Sus afirmaciones de más peso se comprobaron a mano: telemetría opt-out, Windows sin binario, RDD activo por defecto, el `model.go` de 4.984 líneas, nueve frente a seis gates y las licencias de las skills.
- **Revisión de las propuestas:** cada una se contrastó con el código (`idd-facts.js`, `idd-review.js`, `idd-signals.js`, `idd-check.js`), el spec de IDD, la issue #390, el inventario de cableado del kernel, el presupuesto de bytes de la skill y el roadmap.
- **Mods:** la skill plugin-authoring, las declaraciones de tipos de Claude Code 2.1.325, el mod que viene en el binario y la documentación oficial. El aviso «EARLY ACCESS», `afkTimeoutMs` y `agentId` se comprobaron en los tipos.
- **Fuera:** `bench/`, `docs/benchs` y cualquier resultado de banco.
- **Sesgo:** el análisis se hizo desde el repositorio de ospec. Cada nota cita evidencia de los dos lados, y donde ospec pierde se dice sin rebajarlo.
- **Comprobado otra vez sobre v2.178.2,** al llevarlo al roadmap: la regla de la pregunta obligatoria vive en `scripts/lib/idd-facts.js:35` y `:235`, `NO_RED_TEST_KINDS` en `idd-signals.js:110` y `PRODUCT_FREE_SKIP` en `idd-check.js:27`; `skills/idd/SKILL.md` ocupa 10.601 B de sus 12 KiB.

## 2. Puntuación

Escala de 1 a 100: 90–100 referencia, 75–89 sólido, 60–74 correcto con huecos, 40–59 débil y menos de 40 ausente o problemático. No es comparable con la escala de 0 a 10 del 2026-10-25.

| Bloque | ospec | gentle-ai | Lectura |
| --- | :-: | :-: | --- |
| A. Harness técnico (14 criterios) | **77,9** | 64,7 | ospec gana por un núcleo determinista y por foundation. Sin foundation sigue por delante: 77 frente a 69 |
| B. Uso del harness (7) | 72,3 | **76,6** | gentle-ai gana por proporcionalidad y autonomía; ospec, por claridad y recuperación ante errores |
| C. Producto (10) | 68,8 | **78,8** | gentle-ai gana en instalador, TUI, releases y backups; ospec, en diagnóstico y privacidad |

### A. Harness técnico

| Criterio | ospec | gentle-ai | Clave |
| --- | :-: | :-: | --- |
| Motor de estado | 90 | 60 | `state.yaml` del CLI, protegido por hook; el estado de ODD es un markdown que escribe el modelo, con un espejo no atómico |
| Definición de «hecho» | 92 | 58 | Solo evidencia que observa el CLI, y `close` se niega; gentle-ai lo pide en prosa |
| Clasificación de riesgo | 76 | 82 | gentle-ai clasifica por contenido e ignora el volumen (`risk.go`); ospec deriva 9 señales, sin señal de runtime (E1.59) |
| TDD y calidad de los tests | 90 | 68 | Rojo y verde registrados y contraprueba en la base; en gentle-ai son reglas en prosa |
| Revisión con reviewers | 66 | 84 | RDD congela el candidato, revisa sin herramientas con 0, 1 o 4 lentes, refuta y corrige una vez; IDD solo tiene la lente trust |
| Verificación independiente | 58 | 82 | `verify-method.md` deriva las pruebas del pedido; IDD no tiene verificador |
| Gates y autorización humana | 86 | 76 | 9 gates tipados y `user-unverified` con valla de turno; en gentle-ai cuándo preguntar lo decide el modelo |
| Delegación y economía de contexto | 42 | 86 | Presupuestos numéricos, escritor por paralelismo y superficies de edición; IDD lo deja todo al host |
| Contexto fijo por sesión | 86 | 38 | Router de 3,5 KB más la lista de skills frente a un `CLAUDE.md` de 80.020 B |
| Persistencia y reanudación | 86 | 74 | Estado atómico del CLI; gentle-ai tiene S# literales y un Log, pero los mantiene el modelo |
| Arquitectura (foundation) | 88 | 10 | Mapa de conocimiento, rondas con recomendación, brownfield y fitness de ADR; gentle-ai no tiene nada parecido |
| Guardas en ejecución (hooks) | 80 | 58 | Atribución, ficheros del CLI y secretos; gentle-ai usa hooks para recordar la review |
| Entrega | 82 | 78 | Muy parejos |
| Coherencia y simplicidad | 68 | 52 | ospec: un eje claro, pero mucha superficie y docs que se contradicen; RDD: unas 37k líneas de Go |

### B. Uso del harness

| Criterio | ospec | gentle-ai | Clave |
| --- | :-: | :-: | --- |
| Fricción en un cambio pequeño | 52 | 86 | Un cambio pequeño y entendido va inline en gentle-ai; en ospec cada feature obliga a una pregunta |
| Autonomía y continuidad | 66 | 86 | gentle-ai no pide permiso en cada transición autorizada; ospec para en cada gate |
| Saber qué pasa y qué falta | 84 | 70 | `ospec next` y `status` siempre dicen el siguiente paso |
| Calidad de las preguntas | 82 | 78 | Las dos preguntan bien |
| Curva de aprendizaje | 60 | 74 | Handbook solo en español y cifras que no cuadran (nueve gates en el README, seis en el quickstart) |
| Control del usuario sobre el rigor | 80 | 80 | Empate |
| Recuperación ante errores | 82 | 62 | Cada rechazo de ospec trae su `how`; muchas paradas de RDD acaban en el mantenedor |

### C. Producto

| Criterio | ospec | gentle-ai | Clave |
| --- | :-: | :-: | --- |
| Instalación y distribución | 66 | 80 | Binario por brew o curl; ospec es cómodo en Claude y pesado fuera (clonar, npm y Go) |
| TUI | 45 | 82 | Unas 55 pantallas frente a una capa fina que necesita `go run` desde el repo |
| Soporte multi-agente | 72 | 86 | 18 agentes con paridad desigual frente a 7 con validador por destino |
| Actualización, backup y rollback | 60 | 84 | Snapshot antes de escribir y autoactualización; ospec deshace una instalación fallida, sin desinstalar |
| Diagnóstico | 82 | 74 | El doctor de ospec mira más a fondo el harness |
| Respeto a la config del usuario | 84 | 88 | Los dos tienen cuidado |
| Releases y cadena de suministro | 45 | 80 | Checksums firmados con minisign frente a un force-push sin firma (E1.28, E1.89) |
| Documentación | 64 | 62 | Parecidas, por motivos distintos |
| Ingeniería: tests y CI | 80 | 86 | ospec, sin linter ni typecheck en unas 75k líneas de JavaScript de `scripts/`, sin contar tests |
| Privacidad y valores por defecto | 90 | 66 | ospec no hace llamadas de red; gentle-ai trae telemetría opt-out y RDD activo por defecto |

## 3. Dónde vive la autoridad

ospec desconfía del modelo durante todo el cambio y pone la autoridad en su CLI. gentle-ai confía en el modelo mientras implementa y desconfía muchísimo de él en la review, que pone en un binario de Go.

| Decisión | ospec · IDD | gentle-ai · ODD + RDD |
| --- | --- | --- |
| Estado del cambio | CLI: `state.yaml` atómico, protegido por hook | Modelo: markdown más espejo en Engram, no atómico |
| Siguiente paso | CLI: `ospec next` | Modelo: protocolo en el prompt |
| Cuánto rigor merece | CLI: señales del plan y del diff | Modelo (tamaño) y binario (nivel de review) |
| TDD rojo-verde | CLI: ejecuciones registradas y contraprueba | Modelo: «observe RED» |
| Revisión independiente | CLI: linaje acotado, solo lente trust | Binario: transacción congelada, 0/1/4 lentes |
| Verificación del pedido | No existe en IDD | Modelo: verificador en riesgo alto |
| Cierre | CLI: `close` se niega si falta evidencia | Modelo: informe de cierre |
| Arquitectura | CLI: foundation y fitness de ADR | No existe |

## 4. Revisión de las propuestas

La primera versión hizo trece propuestas (R1 a R13). Contrastadas con el código, seis se mantienen (dos con ajustes), dos se corrigen, una se rediseña, dos se fusionan con ítems que ya estaban en el roadmap y dos se sustituyen en Claude por mods. El fallo más serio estaba en R2: quitaba una regla que existe por un motivo.

| Id | Propuesta | Veredicto | Ítem | Por qué |
| --- | --- | --- | --- | --- |
| R1 | Nivel de riesgo explícito | Válida, con ajuste | E1.79 | Ya existe en parte: `NO_RED_TEST_KINDS`, `PRODUCT_FREE_SKIP` y la regla de que la ceremonia solo sube (E1.44, E1.53). R1 lo unifica en un solo campo |
| R2 | Pregunta obligatoria según el riesgo | Corregida | E1.75 | La pregunta obligatoria viene de #390: una feature de una librería publicada lo resolvió todo con citas y dejó escapar un cambio del formato por defecto. Se condiciona a las señales de riesgo, como proponía la propia #390 |
| R3 | Verificador del pedido en riesgo alto | Válida, más barata | E1.83 | Puede reutilizar `verify-lineage.js` de SDD, como trust-review reutiliza `review-lineage.js` |
| R4 | Brecha del revisor | Corregida | E1.52 → E1.59 → E1.60 | E1.63 ya hace no bloqueantes los avisos con una corrección opcional (#498). Queda el orden del roadmap, con las lentes según el nivel en E1.59 |
| R5 | Delegación comprobada | Fusionada | E4.13 | `allowed-paths-validator.js` es del kernel de SDD, no de IDD, y E4.13 ya está en el roadmap, detrás de E4.4 |
| R6 | Código compartido | Rediseñada | E1.84 | Un grafo de llamadas por lenguaje es caro y frágil. Pasa a ser un test de preservación, el inverso de la contraprueba |
| R7 | Gates con la UI de preguntas | Sustituida en Claude | E1.82 (M2) | Los mods leen la respuesta de AskUserQuestion y saben si se resolvió sola. En los demás hosts sigue el gate en texto |
| R8 | Línea de estado | Sustituida en Claude | E1.81 (M1) | `$.ui.status` sale con un prefijo ⚠ y la banda encaja mejor. Los demás hosts no tienen status line |
| R9 | Log literal en `change.md` | Válida | E1.77 | `change.md` no guarda la petición literal ni las respuestas a los gates; solo están en `state.yaml`. Prepara E3.7 |
| R10 | Instalador de un binario | Fusionada | E5.9 | Ya está en el roadmap como `installer-tui-and-skill-profiles` (#348) |
| R11 | Releases firmadas | Válida | E1.89 | Ítem propio detrás de E1.28, que espera a E1.30 |
| R12 | Docs y licencias | Válida | E1.78 | Nueve gates en el README y seis en el quickstart; 27 skills Apache-2.0 frente a 24 MIT AND Commons-Clause |
| R13 | Typecheck del JavaScript | Válida | E1.88 | El kernel sin cablear ya se retiró, así que no hay código muerto que arrastrar |

## 5. Mods de Claude

Los mods amplían Claude Code desde dentro: un módulo JS/TS declarado en `modules` del `hooks.json` de un plugin, que corre dentro de Claude Code y lo hace todo a través de `$`. Para ospec son una capa opcional, solo en Claude, y nunca un requisito: se pueden apagar, la API está en early access y el CLI sigue siendo la autoridad.

**Lo que interesa a ospec:**

- Ver cada llamada a herramienta, también las de subagentes (`agentId`), y denegarla, reescribirla o leer su resultado.
- Leer la respuesta a AskUserQuestion y saber si se resolvió sola por inactividad (`afkTimeoutMs`); abrir el mismo diálogo con `$.ui.ask`.
- Saber qué subagente se lanza (`agent.spawn`) y reescribir su encargo.
- Leer el contexto usado de verdad (`$.session.usage`, `turn.step`).
- Banda sobre el prompt, panel lateral, avisos y comandos.

**Límites:**

- Sin sandbox: corren como el usuario.
- 10 s por hook; un hook que falla se salta (falla abierto) salvo que tenga `.catch`.
- Con un login Team o Enterprise, o con ajustes gestionados, el guard `sec-default` les quita los hooks `classic.*` (como Stop) y la capacidad de aprobar. Por eso E1.51 sigue en el hook Stop del plugin.
- Se apagan con `--safe-mode`, `--bare`, `disableAllHooks` o `allowManagedModsOnly`, y tres caídas los descargan durante la sesión.

**Propuestas:** M0 plugin compañero `ospec-workflow-mod` (E1.80), M1 banda y avisos (E1.81), M2 procedencia `user-dialog` de las respuestas a los gates (E1.82), M3 superficie de edición por subagente (E1.85), M4 freno de contexto con el uso real (E1.86) y M5 encargos enriquecidos (E1.87). M6, herramientas nativas `ospec_*`, queda aparcada: la ganancia es modesta y el coste fijo (una segunda ruta de código, tokens de esquema y un tope de 10 minutos por ejecución).

**Por comprobar en vivo antes de construir** (alcance de E1.80): si una Claude anterior a 2.1.287 ignora `modules` o falla al cargar el plugin; si unas `answers` escritas por el modelo se saltan el diálogo; si `$.ui.ask` puede resolverse solo por inactividad; si el guard está activo en el plan del usuario; si `agentId` es fiable con agentes en segundo plano; y cómo se comportan las ejecuciones de más de 10 minutos con `$.process.spawn`.

## 6. Orden

El orden por olas del análisis se convirtió en el orden ▶ del roadmap con la decisión del usuario del 2026-11-16. Ola 0: R2, R9 y R12, sin dependencias. Ola 1: R1, la cola de la review general, M0 y M1. Ola 2: E1.52, E1.59, E1.60 y M2. Ola 3: R3, R6 y E3.7. Ola 4: R5 dentro de E4.13, M3, M4 y M5. R13, R11 y R10 forman una pista de producto aparte, y las mediciones (E4.18, E4.4) van al final. El detalle está en [Estado y orden](../roadmaps/harness-evolution.md#orden-recomendado-de-trabajo).

## 7. Qué conservar y qué no copiar

**Conservar:**

- **El CLI es dueño del estado.** Es la razón de que ospec gane en el núcleo; ninguna propuesta devuelve el estado al modelo.
- **«Hecho» = evidencia observada.** gentle-ai no tiene equivalente fuera de la review.
- **La contraprueba en la base.** Es lo que más distancia saca en TDD.
- **foundation y la fitness de ADR.**
- **Los gates tipados con valla de turno** y la diferencia entre `user` y `user-unverified`.
- **El contexto fijo pequeño y sin telemetría:** unos 6 KB frente a unos 80 KB, y ninguna llamada de red.

**No copiar:**

- **Un prompt fijo de 80 KB:** unos 20k tokens en cada sesión. El ratchet de E4.3 ya lo impide.
- **El consentimiento, el acuse y la «quema» de RDD:** unas 37k líneas para algo cuyo valor está en la congelación, el refutador y una sola corrección.
- **El estado escrito por el modelo.** El S# literal sí merece la pena (E1.77); el modelo de estado, no.
- **Telemetría y review activas por defecto.**
- **Reglas de reviewer genéricas:** `review-judgment.md`, con contraevidencia obligatoria, es mejor.
- **Una TUI monolítica:** un `model.go` de 4.984 líneas con 166 ramas. Si se hace E5.9, por pantallas pequeñas sobre el protocolo JSON que ya existe.
