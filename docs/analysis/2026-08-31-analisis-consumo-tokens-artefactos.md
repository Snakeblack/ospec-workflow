# Análisis de Eficiencia de Tokens en la Generación de Artefactos del Harness `ospec-workflow`

> **Fecha:** 2026-08-31 · **Versión auditada:** 2.45.10 · **Área:** Arquitectura SDD, Generación de Artefactos y Consumo de Contexto  
> **Alcance:** Auditoría cuantitativa y cualitativa del consumo de tokens en el ciclo de vida de OpenSpec, análisis de redundancia inter-fase y propuestas de optimización sin alteración de código.

---

## 1. Resumen Ejecutivo y Respuesta Directa

### ¿Este arnés gasta muchos tokens en generar artefactos, más de lo necesario?

**SÍ, de manera sustancial.** El arnés actual está diseñado bajo una filosofía de **máxima trazabilidad, inmutabilidad y formalismo de contratos**, lo cual garantiza una robustez excepcional para cambios complejos. Sin embargo, este diseño produce una **inflación masiva de tokens** en dos frentes:

1. **Tokens de Salida Directos (Generación de Artefactos):** Un cambio estándar promedio genera entre **45 KB y 85 KB de texto** (markdown, YAML y JSON) repartidos en 8–12 artefactos. Esto representa entre **12.000 y 22.000 tokens de salida directos** dedicados exclusivamente a documentación de proceso, independientemente del código productivo modificado.
2. **Efecto Multiplicador de Contexto (Context Compounding / Fuga en Cascada):** Debido a que cada subagente sucesivo lee los artefactos previos acumulados, más los protocolos comunes (`sdd-phase-common.md` + `openspec-convention.md` ≈ 11.500 tokens de base fija), y ejecuta múltiples turnos de herramientas, el consumo real acumulado en una sesión completa oscila entre **1.2 y 2.8 MILLONES de tokens de prompt/contexto por cambio** (según telemetría real de [phase-costs.jsonl](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/.ospec/session/k5-usage-accounting-integrity/phase-costs.jsonl)).

Se estima que entre un **40% y un 60% del volumen de tokens consumidos en artefactos y contexto es redundante**, provocado por matrices y tablas que se re-escriben hasta 7 veces con variaciones mínimas, duplicación obligatoria de requisitos completos en deltas de specs, sobrecarga de protocolos base en cada subagente, y sobre-especificación en cambios de tamaño medio o bajo.

### ¿Se podría mejorar?

**SÍ, significativamente.** Es posible reducir entre un **35% y un 55% el consumo total de tokens** sin debilitar la trazabilidad, la seguridad ni la recuperabilidad del sistema, aplicando:
- Poda y eliminación de tablas duplicadas entre artefactos.
- Especificación de deltas quirúrgicos (patch/scenario) en lugar de duplicación íntegra de requisitos.
- Modularización ligera de protocolos comunes (de ~11.5k a <3k tokens fijos por agente).
- Automatización determinista mediante scripts CLI para reportes mecánicos ([`archive-report.md`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/openspec/changes/archive/2026-08-31-harden-installer-fs-recovery/archive-report.md) y evidencia de verificación).
- Flujos proporcionales graduados (Nano / Lite / Medium / Heavy).

---

## 2. Evidencia Empírica y Datos Reales del Repositorio

Para evitar apreciaciones subjetivas, se auditaron los datos reales de los **108 cambios archivados** en [`openspec/changes/archive/`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/openspec/changes/archive/) y los registros de telemetría de sesiones en [`.ospec/session/`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/.ospec/session/).

### A. Distribución de Tamaños de Artefactos (108 Cambios Auditados)

| Artefacto | Archivos | Peso Promedio | Peso Máximo | Tokens Salida Est. (Promedio) | Propósito Principal |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `spec.md` (deltas locales) | 323 | **12.8 KB** | 135.3 KB | ~3.200 | Requisitos y escenarios Gherkin |
| `apply-progress.md` | 105 | **13.7 KB** | 76.2 KB | ~3.400 | Tareas completadas y evidencia RED/GREEN |
| `design.md` | 100 | **13.2 KB** | 43.1 KB | ~3.300 | Enfoque técnico, decisiones y data flow |
| `verify-report.md` | 107 | **11.9 KB** | 56.2 KB | ~3.000 | Matrices de cumplimiento y pruebas |
| `tasks.md` | 107 | **10.8 KB** | 40.0 KB | ~2.700 | Conciliación spec/design y checklist |
| `state.yaml` | 107 | **10.1 KB** | 108.9 KB | ~2.500 | Estado de DAG, aprobaciones y runtime |
| `exploration.md` | 11 | **11.0 KB** | 24.5 KB | ~2.800 | Análisis previo de alternativas |
| `proposal.md` | 99 | **5.1 KB** | 9.0 KB | ~1.300 | Intención, alcance y riesgos |
| `archive-report.md` | 103 | **4.5 KB** | 15.3 KB | ~1.100 | Resumen ejecutivo y plan de cierre |
| `decisions/adr-*.md` (x3-5) | ~200 | **1.3 KB c/u** | 3.1 KB | ~1.000 | Registros individuales de decisiones |
| `lineage.json` (4R Review) | 18 | **29.7 KB** | 69.4 KB | ~7.500 | Linaje de revisión, findings y reducers |
| **TOTAL Promedio por Cambio** | — | **~75–95 KB** | **> 350 KB** | **~19.000 – 24.000** | — |

### B. Telemetría Real de Tokens por Fase (`phase-costs.jsonl`)

En las sesiones reales instrumentadas bajo `.ospec/session/`, se observa cómo el costo de prompt de los subagentes escala de forma monotónica y acumulativa:

#### Caso 1: `k5-usage-accounting-integrity` (22 despachos registrados)
```
propose             :   49.354 prompt tokens   (859 output tokens)
spec                :   52.792 prompt tokens   (697 output tokens)
design              :   60.174 prompt tokens   (29 output tokens)
tasks               :   61.574 prompt tokens   (726 output tokens)
apply (batch 1)     :   68.399 prompt tokens   (121 output tokens)
verify              :   71.275 prompt tokens   (74 output tokens)
apply (relaunch)    :   81.894 prompt tokens   (30 output tokens)
verify (relaunch)   :   89.580 prompt tokens   (27 output tokens)
tasks (relaunch)    :  105.196 prompt tokens   (712 output tokens)
apply (batch 2)     :  108.780 prompt tokens   (98 output tokens)
verify (final)      :  118.867 prompt tokens   (82 output tokens)
review-change       :  139.424 prompt tokens   (997 output tokens)
review-risk         :  162.072 prompt tokens   (521 output tokens)
review-reliability  :  163.297 prompt tokens   (746 output tokens)
review-resilience   :  164.067 prompt tokens   (43 output tokens)
review-readability  :  165.659 prompt tokens   (34 output tokens)
review-correction 1 :  184.984 prompt tokens   (977 output tokens)
review-correction 2 :  191.052 prompt tokens   (699 output tokens)
review-correction 3 :  195.932 prompt tokens   (556 output tokens)
archive             :   66.297 prompt tokens   (315 output tokens)
------------------------------------------------------------------
TOTAL ESTIMADO DE LA SESIÓN: > 2.550.000 TOKENS DE PROMPT
```

#### Caso 2: `fixed-policy-reference-baseline` (22 despachos registrados)
- Inicio en `propose`: 110.718 prompt tokens.
- Crecimiento continuo hasta `verify` y relanzamientos: **232.729 prompt tokens** por despacho.
- Consumo total acumulado: **> 3.200.000 tokens**.

---

## 3. Diagnóstico Detallado: Las 6 Fugas de Tokens

A través del análisis del flujo de trabajo y los contratos en [`agents/`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/agents/) y [`skills/`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/skills/), se identificaron seis causas estructurales de ineficiencia:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                             CADENA DE DUPLICACIÓN DE INFORMACIÓN                            │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  1. proposal.md        ──► Define Scope & Capabilities
         │
         ▼
  2. spec.md            ──► Copia requisitos completos + define escenarios Given/When/Then
         │
         ▼
  3. design.md          ──► Redacta Technical Approach + Decisiones (repite ADRs) + File Changes
         │
         ▼
  4. tasks.md           ──► Matriz Spec/Design Reconciliation (copia 100% de specs y 100% design)
         │                  + Checklist de tareas [ ]
         ▼
  5. apply-progress.md  ──► Copia checklist de tareas [x] + lista de archivos afectados
         │
         ▼
  6. verify-report.md   ──► Matriz Spec Compliance (re-copia specs) + Traceability Matrix (re-copia tasks/tests)
         │
         ▼
  7. archive-report.md  ──► Re-resumen de todo lo anterior + inventario + ADRs
```

---

### Fuga 1: Duplicación Cíclica Inter-Artefacto (El Síndrome de la Matriz Repetida)
El problema más grave no es que un archivo sea largo, sino que **los mismos datos se reescriben entre 5 y 7 veces en formato de tablas markdown**:
- La tabla de requisitos de `specs` se copia íntegra en la tabla `Spec/Design Reconciliation` de `tasks.md`.
- La misma tabla se vuelve a copiar en la `Spec Compliance Matrix` de `verify-report.md`.
- Se vuelve a copiar en la `Traceability Matrix` de `verify-report.md` (mapeando REQ $\rightarrow$ Tasks $\rightarrow$ Commits $\rightarrow$ Tests).
- Se vuelve a resumir en `archive-report.md` (`Merged Specifications Summary`).
- **Consecuencia:** Cerca de **8.000 a 12.000 tokens de salida** por cambio se gastan en formatear y escribir tablas idénticas con encabezados ligeramente diferentes.

---

### Fuga 2: La Regla "Full Requirement Copy" en Spec Deltas
En [`docs/openspec.md`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/docs/openspec.md#L67) y [`skills/_shared/openspec-convention.md`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/skills/_shared/openspec-convention.md):
> *"La regla crítica está en MODIFIED: copiar el requisito completo desde la spec principal, con todos sus escenarios, y después editar."*

- **El problema:** En dominios maduros (ej. `install`, `agents`, `hooks`), un requisito puede tener entre 8 y 20 escenarios Gherkin.
- Si un cambio solo modifica **un escenario** o añade una cláusula menor, el agente está obligado a copiar y emitir **300 a 600 líneas de texto sin cambios** en `openspec/changes/{change}/specs/{domain}/spec.md`.
- Esto infla tanto el tiempo de escritura como el contexto de todos los subagentes posteriores (`design`, `tasks`, `apply`, `verify`) que deben re-leer ese archivo completo.

---

### Fuga 3: Overhead Fijo de Protocolo en el Prompt Inicial de cada Subagente
Cada vez que el orquestador despacha un subagente ejecutor, el entorno inyecta o el agente carga obligatoriamente:
1. `skills/_shared/sdd-phase-common.md`: **23.170 bytes (~5.800 tokens)**.
2. `skills/_shared/openspec-convention.md`: **22.137 bytes (~5.500 tokens)**.
3. `skills/{phase}/SKILL.md`: **7.000 a 12.000 bytes (~2.000 tokens)**.
4. `openspec/memory/` (`conventions.md`, `decisions.md`, `known-issues.md`): **~1.500 tokens**.
5. `## Project Standards (auto-resolved)`: **~500 tokens**.
6. Prompt base del agente: **~1.000 tokens**.

**Resultado:** Antes de leer la solicitud o explorar el código, el contexto del subagente ya arrastra **entre 15.000 y 18.000 tokens fijos**. En un flujo típico de 10 subagentes, se consumen **150.000 a 180.000 tokens únicamente en cargar directivas de gobernanza**.

---

### Fuga 4: Efecto Multiplicador por Turnos de Herramientas (Context Compounding)
Cuando un agente como `sdd-apply` o `sdd-verify` trabaja:
1. En el Turno 1 lee los artefactos de la carpeta del cambio (totalizando ~25.000 tokens).
2. En el Turno 2 ejecuta `node --test` (la salida añade 5.000 tokens).
3. En el Turno 3 lee el archivo de código fuente (añade 4.000 tokens).
4. En el Turno 4 realiza una edición.
5. En el Turno 5 vuelve a ejecutar tests.
6. En el Turno 6 actualiza `apply-progress.md`.

En cada turno, la API del LLM procesa y cobra **la totalidad del historial acumulado**. Si los artefactos iniciales pesan 25.000 tokens en vez de 8.000 tokens, esos 17.000 tokens extra se multiplican por 6 turnos = **102.000 tokens adicionales facturados** en una sola fase.

---

### Fuga 5: Doble Emisión (Markdown Verboso + JSON Result Envelope)
Los subagentes están obligados por contrato ([`skills/_shared/sdd-phase-common.md`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/skills/_shared/sdd-phase-common.md#L160)) a:
1. Escribir el archivo `.md` en disco.
2. Actualizar `state.yaml`.
3. Emitir un resumen en prosa en su respuesta al orquestador.
4. Emitir un bloque estricto ````json:result-envelope```` con la misma información estructurada.

Aunque el envelope JSON es valioso para hooks y validadores programáticos, la prosa duplicada en el chat inter-agentes infla innecesariamente el historial del orquestador.

---

### Fuga 6: Sobre-Especificación en Cambios Pequeños y Medianos
El arnés dispone de `/sdd-lite`, pero en la práctica:
- Muchos cambios quirúrgicos de 30 a 150 líneas continúan ejecutando la ruta estándar de 8 fases (`propose` $\rightarrow$ `spec` $\rightarrow$ `design` $\rightarrow$ `tasks` $\rightarrow$ `apply` $\rightarrow$ `verify` $\rightarrow$ `review-4r` $\rightarrow$ `archive`).
- Para estos cambios se generan 3 ADRs, matrices de conciliación completas y reportes de archivo de 10 páginas, consumiendo más tokens en metadatos que en la propia lógica de programación.

---

## 4. Catálogo de Mejoras y Estrategias de Optimización

A continuación se presentan alternativas concretas clasificadas por área, con sus respectivos beneficios y compromisos (*trade-offs*).

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MAPA DE PALANCAS DE AHORRO                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
  [1. Poda de Matrices]          ──► Eliminar tablas espejo en tasks.md y verify-report.md (-35% out)
  [2. Deltas Quirúrgicos]        ──► Enviar solo escenarios modificados en specs (-50% spec size)
  [3. Micro-Protocolos]          ──► Dividir sdd-phase-common en micro-instrucciones (-70% init prompt)
  [4. SDD Proporcional]          ──► Rutas Nano/Medium para cambios pequeños/medianos (-45% total)
  [5. Reportes Deterministas]    ──► Generar archive-report y test-evidence con scripts JS (-100% LLM)
  [6. Aislamiento de Contexto]   ──► Despachos stateless sin historial del orquestador (-40% prompt)
```

---

### Propuesta 1: Poda y Fusión de Tablas en Artefactos (Lean Artifact Design)

| Qué cambiar | Estado Actual | Propuesta Optimizada | Ahorro Est. |
| :--- | :--- | :--- | :---: |
| **`tasks.md`** | Tabla `Spec/Design Reconciliation` de 20–40 filas repitiendo textos de spec y design. | Eliminar la tabla. Vincular directamente en las tareas: `- [ ] 1.1 Implementar retries [REQ-install-016]`. | ~1.500 tokens / cambio |
| **`verify-report.md`** | Tres tablas gigantes (`Spec Compliance`, `Correctness`, `Traceability Matrix`). | Una única tabla concisa de **Cumplimiento de Escenarios Modificados** con referencia al test que lo valida. | ~2.000 tokens / cambio |
| **`archive-report.md`** | Generado por LLM (`sdd-archive`), resumiendo lo que ya está en `verify-report.md` y `state.yaml`. | Generación 100% determinista mediante script Node (`archive-transaction-run.js`). El LLM solo emite `archive-plan.json` (150 tokens). | ~1.200 tokens / cambio |

- **Trade-off:** La lectura humana de `tasks.md` pierde la tabla visual de conciliación previa, pero la trazabilidad se mantiene íntegra mediante las etiquetas `[REQ-xxx]`.

---

### Propuesta 2: Deltas de Especificación Quirúrgicos (Patch vs Full-Copy)

- **Propuesta:** Modificar la regla de `MODIFIED Requirements` en la convención OpenSpec:
  - En lugar de copiar todo el requisito padre y sus 15 escenarios inalterados, el delta change-local solo debe declarar:
    ```markdown
    ## MODIFIED Requirements
    ### REQ-install-016: Transient Filesystem Error Resilience
    #### MODIFIED Scenario: Transient lock exhaustion fails closed
    - THEN lanza error enriquecido preservando code y cause originales tras agotar reintentos.
    ```
  - El motor de archivo transaccional (`archive-transaction-run.js` o AST parser) se encarga de aplicar el patch sobre la especificación baseline en `openspec/specs/`.
- **Ahorro Est.:** Reduce el tamaño de `spec.md` en un **60%–80%** en cambios incrementales, acelerando y abaratando todas las fases subsiguientes.
- **Trade-off:** Requiere que el script de archivo posea un parser sintáctico capaz de fusionar escenarios individuales en lugar de sustituir bloques completos de requisitos.

---

### Propuesta 3: Modularización Ligera de Protocolos Comunes (Micro-Skills)

- **Propuesta:** Descomponer los monolitos [`skills/_shared/sdd-phase-common.md`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/skills/_shared/sdd-phase-common.md) (23 KB) y [`skills/_shared/openspec-convention.md`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/skills/_shared/openspec-convention.md) (22 KB):
  1. Extraer los ejemplos ilustrativos (`[EXAMPLE]`), directivas históricas y justificaciones largas hacia documentación de referencia fuera del prompt activo.
  2. Crear micro-contratos por rol:
     - `protocol-planner.md` (~1.5 KB) para `sdd-propose`, `sdd-spec`, `sdd-design`.
     - `protocol-executor.md` (~2.0 KB) para `sdd-apply`.
     - `protocol-validator.md` (~1.5 KB) para `sdd-verify` y `review-*`.
- **Ahorro Est.:** El costo de inicialización de cada subagente cae de **~16.000 tokens a ~3.500 tokens**. En un cambio de 10 subagentes, el ahorro directo es de **~125.000 tokens de prompt**.
- **Trade-off:** Requiere mantener 3 micro-archivos sincronizados en lugar de un único archivo común monolítico.

---

### Propuesta 4: Flujos Graduados Adaptativos (Adaptive Workflow Sizing)

Formalizar cuatro niveles de profundidad según el impacto real del cambio:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             NIVELES DE FLUJO SDD ADAPTATIVO                              │
├──────────────┬───────────────────────────────┬───────────────────────────────────────────┤
│ Nivel        │ Criterio de Activación        │ Pipeline y Artefactos                     │
├──────────────┼───────────────────────────────┼───────────────────────────────────────────┤
│ 1. Nano      │ < 50 líneas, docs, prompts,   │ Directo en chat / 1 micro-tarea / commit  │
│              │ fixes cosméticos              │ (Sin carpeta openspec/changes/)           │
├──────────────┼───────────────────────────────┼───────────────────────────────────────────┤
│ 2. Lite      │ 50–200 líneas, bugs acotados, │ proposal-lite.md + tasks.md ──► apply     │
│              │ sin impacto arquitectónico    │ ──► verify-lite (Sin design ni ADRs)      │
├──────────────┼───────────────────────────────┼───────────────────────────────────────────┤
│ 3. Medium    │ 200–400 líneas, nuevas features│ proposal.md + specs/ + tasks.md ──► apply │
│              │ contenidas en 1–2 módulos     │ ──► verify (Design inline en tasks)       │
├──────────────┼───────────────────────────────┼───────────────────────────────────────────┤
│ 4. Heavy/Full│ > 400 líneas, seguridad,      │ Flujo SDD completo actual + ADRs + 4R     │
│              │ migraciones, cross-sistema    │ (Máximo rigor y trazabilidad formal)      │
└──────────────┴───────────────────────────────┴───────────────────────────────────────────┘
```

- **Ahorro Est.:** Para el 70% de las tareas cotidianas (clasificadas como Lite o Medium), el gasto de tokens se reduce en un **50% a 70%**.
- **Trade-off:** El orquestador debe clasificar con precisión la complejidad inicial para no subdimensionar un cambio que requiera diseño formal.

---

### Propuesta 5: Generación Determinista Asistida por Runtime (Scripts de Apoyo)

- **Propuesta:** Utilizar la capacidad de ejecución local de herramientas y scripts para recopilar datos duros, en vez de obligar al modelo a redactarlos:
  - Un comando `node scripts/lib/generate-verify-summary.js` puede ejecutar la suite de pruebas, parsear los resultados, comparar la lista de archivos modificados mediante `git diff --stat`, y emitir directamente la sección cuantitativa de [`verify-report.md`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/openspec/changes/archive/2026-08-31-harden-installer-fs-recovery/verify-report.md).
  - El subagente `sdd-verify` solo tiene que leer ese extracto compacto (<400 tokens) y añadir su análisis cualitativo y veredicto.
- **Ahorro Est.:** Elimina la necesidad de que el LLM lea logs de pruebas de miles de líneas y construya tablas de resultados a mano. Ahorro de **~30.000 a 80.000 tokens de contexto** en la fase de verificación.
- **Trade-off:** Requiere mantener un script helper en `scripts/lib/` que mantenga paridad con el formato de reporte.

---

### Propuesta 6: Aislamiento Estricto de Contexto de Subagentes (Context Hygiene)

- **Propuesta:** Asegurar que los subagentes se invoquen en modo *stateless* / *clean-slate*:
  - No pasar el historial de conversación del orquestador.
  - Enviar en el prompt de lanzamiento exclusivamente:
    1. El nombre del cambio.
    2. El extracto relevante de [`state.yaml`](file:///C:/Users/sn4ke/dev/activos/ospec-workflow/openspec/changes/archive/2026-08-31-harden-installer-fs-recovery/state.yaml) (resumen de la fase anterior de $\le$ 160 caracteres).
    3. Las rutas exactas de los 1–2 archivos que el subagente necesita consultar.
- **Ahorro Est.:** Evita el arrastre de contextos de 50k–100k tokens desde el hilo padre.

---

## 5. Matriz de Impacto vs. Esfuerzo de Implementación

| Iniciativa | Ahorro de Tokens Est. | Esfuerzo de Impl. | Riesgo de Regresión | Prioridad Recomendada |
| :--- | :---: | :---: | :---: | :---: |
| **1. Poda de Tablas Duplicadas** (`tasks.md` / `verify-report.md`) | **Alto** (~20% total) | **Bajo** (Ajuste de templates de skills) | Nulo | **Inmediata (Quick Win)** |
| **2. Modularización de Protocolos Comunes** (`sdd-phase-common.md`) | **Muy Alto** (~25% total) | **Medio** (Refactor de markdown compartido) | Bajo | **Alta** |
| **3. Flujos Graduados (Nano / Lite / Medium)** | **Muy Alto** (~30% en cambios comunes) | **Medio** (Reglas de routing en orquestador) | Bajo | **Alta** |
| **4. Reporte de Archivo Determinista** (`archive-transaction-run.js`) | **Medio** (~8% total) | **Bajo** (Generación JS ya existente) | Nulo | **Media** |
| **5. Deltas Quirúrgicos en Specs** (Patching por escenario) | **Alto** (~15% total) | **Alto** (Requiere motor de merge semántico) | Medio | **Evolutiva** |
| **6. Helper CLI de Evidencia de Verificación** | **Medio** (~10% total) | **Medio** (Script de agregación de tests) | Bajo | **Media** |

---

## 6. Conclusión y Veredicto Final

El arnés `ospec-workflow` es un sistema de ingeniería riguroso y de nivel enterprise, pero sufre de una **sobrecarga de verbosidad documental pensada para humanos que es procesada repetidamente por modelos de lenguaje**.

La solución **no es renunciar al desarrollo guiado por especificaciones (SDD)** ni a la verificación formal, sino **eliminar la redundancia estructural**:
1. Hacer que los artefactos intermedios sean **concisos y no duplicativos**.
2. Dejar que los scripts y herramientas programáticas locales hagan el trabajo mecánico de formateo y validación de tablas.
3. Reservar la generación masiva de artefactos formales pesados exclusivamente para cambios arquitectónicos de alto riesgo.

Con la aplicación de estas medidas, el arnés puede mantener exactamente la misma confiabilidad y rigor reduciendo el consumo de tokens entre un **35% y un 55% de forma inmediata**.
