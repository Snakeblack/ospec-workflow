# E1.19 — Contexto de revisión IDD

La build por defecto usa el contrato de despacho de `review-judgment.md`. Los cuatro especialistas conservan sus campos de hallazgo, severidades, autoridad de solo lectura y límites del linaje. Con `withSdd`, el generador incorpora la referencia existente al protocolo SDD completo; los reducers y el payload del validador no cambian.

## Reproducción y tamaño

`node --test scripts/lib/agent-embed.test.js` falla con la referencia SDD original y pasa después en los siete targets. Comprueba ambas builds, referencias embebidas resueltas, contratos conservados y ausencia de la inicialización/persistencia SDD en los revisores por defecto. La regresión vive en la suite existente del generador para conservar el inventario congelado de K1. Los techos de `scripts/fixtures/context-baseline.json` se han reducido.

Bytes de contexto del `review-trust`, normalizados a LF y medidos con `measureSource`:

| Target | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| Claude | 36.865 | 13.844 | 62,45 % |
| VS Code | 36.895 | 13.874 | 62,40 % |
| Copilot | 36.881 | 13.860 | 62,42 % |
| OpenCode | 36.893 | 13.874 | 62,39 % |
| Codex | 36.985 | 13.963 | 62,25 % |
| Cursor | 36.840 | 13.819 | 62,49 % |
| Antigravity | 36.879 | 13.858 | 62,42 % |

Estos tamaños no demuestran ahorro de coste ni mayor fiabilidad del modelo.

## Consumidores y contratos de resultado

Ensayo del 2026-10-09 en cuatro repositorios temporales sin `openspec/` ni árbol de skills: dos usan el agente generado por defecto y dos el generado con SDD. El contrato de acceso exige un usuario string no vacío igual al propietario; siete aserciones independientes cubren propietario, otro usuario, null, undefined, vacío, número y objeto.

| Build | Caso | Resultado |
| --- | --- | --- |
| Por defecto | Refactor correcto | `findings: []`; review, check y close aprobados |
| Por defecto | Falta comparación de propietario | Un CRITICAL congelado; corrección de una línea, validación dirigida, check y close aprobados |
| Con SDD | Refactor correcto | Envelope v1 válido y `findings: []`; review, check y close aprobados |
| Con SDD | Falta comparación de propietario | Envelope v1 válido y un CRITICAL; misma corrección acotada y cierre aprobado |

Los ejecutores dedicados leyeron las instrucciones completas de los agentes generados y el alcance congelado. Cada descubrimiento se ejecutó una vez; cada caso adverso usó un único validador `review-correction`. No escribieron el código ni ejecutaron tests. El proceso padre comprobó el caso adverso (exit 1), aplicó `return user === owner` y comprobó las siete aserciones (exit 0). El CLI registró los resultados y archivó los cuatro consumidores sin editar su `state.yaml`.

El JSON IDD se registró directamente. En SDD se extrajo el contenido del fence `json:result-envelope`, validado con `validateEnvelope`, sin alterar hallazgos. El validador devuelve `{validation: ...}` y `ospec review validate` recibe el objeto interior: también se extrajo sin modificar outcomes. El primer envío de ese wrapper fue rechazado antes de mutar; se reconciliaron estado `validating` y revisión 5 antes de enviar el objeto interior. No se relanzó descubrimiento ni se reinició presupuesto.

El intento de ejecución nativa en Claude Code 2.1.289 falló antes de herramientas/inferencia por OAuth caducado (0 tokens, coste 0). Los ensayos posteriores prueban instrucciones generadas, envelopes y ciclo CLI mediante los ejecutores de este harness; no prueban la carga nativa ni el evento Agent/SubagentStop de ese host. Esa comprobación requiere reautenticación. No se copiaron credenciales.

Evidencia local: `%TEMP%/ospec-E1.19-review-context/`, con builds, consumidores, requests, resultados originales, extracción para CLI, assertions, estados archivados y transcript del intento nativo. La disponibilidad de estos temporales no es permanente; la regresión de generación está versionada en el test citado.
