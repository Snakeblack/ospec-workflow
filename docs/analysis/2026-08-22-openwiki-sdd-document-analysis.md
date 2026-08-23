# Análisis: calidad del OpenWiki generado por `sdd-document`

**Fecha:** 2026-08-22
**Objeto de análisis:** las 15 páginas de `openwiki/` generadas por la fase `sdd-document`, con el fin de proponer mejoras al contrato de dicho generador (`skills/sdd-document/SKILL.md`).
**Método:** lectura completa del quickstart + auditoría página a página delegada (estructura, sustancia vs. relleno, verificación factual contra el repo, enlaces, frescura, legibilidad).

---

## 1. Estado actual

| Hecho | Valor |
| --- | --- |
| Páginas generadas | 15 (quickstart + 14 dominios), ~1.427 líneas |
| Última generación | 2026-07-18 (`update`, gitHead `2dc830a`, v2.30.0) |
| Drift desde entonces | **129 commits, 1.632 archivos cambiados** (toda la era K2.1–K5: Authority Store/CAS, permits, budgets, review-lineage) |
| Idioma / scope | `es`, Opción D (OpenWiki + Starlight vía `scripts/sync-openwiki.mjs`) |

## 2. Lo que está bien (conservar)

- **Precisión simbólica alta**: ~40 identificadores verificados (funciones, rutas, constantes) existen en el código; los errores factuales son puntuales, no sistémicos.
- **Evidencia git real**: 12/12 hashes de commit citados en source maps resuelven con asunto coincidente. Esto supera con creces a la documentación escrita a mano típica.
- **Cumplimiento estructural**: casi todas las páginas siguen las 8 secciones del contrato; el quickstart está bien organizado (resumen → capacidades → índice anotado → mapa → notas para agentes).
- **Páginas excelentes**: `workspace-federation/multi-repo.md`, `orchestration/routing.md`, `testing-quality/verification.md`, `hooks-runtime/lifecycle.md` — profundidad real, verificable, útil para un recién llegado técnico.

## 3. Hallazgos (por severidad)

### H1 — Obsolescencia sistémica: toda la era kernel (K2.1–K5) está ausente
Cero menciones a `authority-store`, `compareAndSwap`, CAS, `OperationPermit`/`OperationReceipt` o budgets de ejecución en todo el wiki, pese a existir specs normativas (`openspec/specs/authority-store/spec.md`, `operation-permits/spec.md`) e implementación (`scripts/lib/authority-store/`, `execution-budgets.js`). La víctima más grave es `state-management/persistence.md`, que presenta un modelo mental de propiedad del estado hoy incorrecto.

**Causa raíz en el generador:** el modo *update* solo toca páginas cuyos archivos fuente cambiaron dentro de la ventana diff. **Nunca re-ejecuta el descubrimiento de dominios**, así que un dominio nuevo (el kernel runtime) jamás obtiene página ni obliga a revisar las existentes.

### H2 — Violaciones de la regla "un concepto, una página canónica" (tres clústeres)
1. **Tríplice del generador**: `generator/multi-target-generator.md`, `architecture/overview.md` e `installation/target-installation.md` describen todos cómo se construyen targets, con detalle solapado pero divergente y sin enlaces entre sí.
2. **Registro de skills duplicado**: `agents-skills/agents-and-skills.md` vs. `orchestration/routing.md` §"Registro de skills".
3. **Pipeline 4R duplicado**: `contract-lint/validation-rules.md` vs. `testing-quality/verification.md`.

**Causa raíz:** la regla existe en el contrato pero no hay mecanismo de cumplimiento: ni mapa de canonicidad en `_plan.md`, ni verificación posterior de solapes.

### H3 — Errores factuales concretos
| Página | Error | Realidad |
| --- | --- | --- |
| `security/guardrails.md:48` | límite acumulado "220.000 tokens" | **150.000** (`pre-tool-use.js:381`, `pretooluse.go:424`) |
| `installation/target-installation.md:8` | `npm run install:copilot` | no existe en `package.json` (solo `install:global:copilot`) |
| `hooks-runtime/lifecycle.md:17` | `SessionStart` sin timeout | `hooks/hooks.json:7` fija `timeout: 5` |
| `contract-lint/validation-rules.md:16` | "≥400 líneas ⇒ Strict Full 4R" | el 400 es presupuesto de carga de PR; la escalación 4R es por señal/clasificación (`review-dimensions.js:15`) |
| `architecture/overview.md:3` | "cinco herramientas" | son **siete** (cursor añadido 25/07, antigravity 14/08) |

**Causa raíz:** no existe paso de verificación factual: el contrato dice "deriva del repo, nunca inventes", pero nada obliga a contrastar cada número/identificador citado con grep antes de escribir.

### M4 — Targets nuevos ausentes en todo el wiki
Cursor y Antigravity (post-freeze) no aparecen en ninguna página. Consecuencia directa de H1.

### M5 — Cross-linking escaso
Solo 4 de 14 páginas contienen algún enlace relativo entre páginas del wiki. Pares obvios sin enlace: `go-implementation.md` ↔ `lifecycle.md`; `agents-and-skills.md` ↔ `routing.md`; `agent-rules.md` → `validation-rules.md`. La regla de enlaces cruzados existe pero no se comprueba.

### M6 — Página stub
`rules-system/agent-rules.md`: ~20 líneas sustantivas, viola la regla anti-thin (<30 líneas sustantivas). Se creó igual. La regla tampoco tiene mecanismo de enforcement.

### L7 — Cobertura de diagramas baja
3 de 14 páginas tienen Mermaid. `persistence.md` y `go-implementation.md` describen flujos que piden diagrama. Un label Mermaid con `*` sin comillas (`verification.md:33`) puede romper el render.

### L8 — Metadatos de `.last-update.json` incompletos
`sections` lista 8 entradas cuando hay 16 archivos; `filesSkipped: 3` sin justificación. Dificulta futuras ventanas de update.

## 4. Veredicto sobre el generador

El contrato de `sdd-document` produce **buena materia prima** (precisión de símbolos, evidencia git, estructura) pero tiene cuatro carencias estructurales:

1. **Sin re-descubrimiento de dominios en modo update** → el wiki diverge del repo conforme crece (H1/M4).
2. **Reglas sin mecanismo de enforcement** (canonicidad, anti-thin, cross-links, diagramas) → dependen del criterio del modelo que ejecuta (H2/M5/M6/L7).
3. **Sin verificación factual obligatoria** → números e identificadores pueden publicarse sin contraste (H3).
4. **Sin control de calidad post-generación** → la ruta cierra como `success` sin chequeo independiente de contenido (a diferencia del sandbox, que sí lo tiene).

## 5. Propuestas de mejora al skill `sdd-document`

### P1 — Re-descubrimiento de dominios en update mode (ataca H1, M4)
En modo update, tras calcular la ventana diff: si aparecen directorios/módulos fuente nuevos que no mapean a ninguna página existente, el agente DEBE proponer páginas nuevas (o fusiones) antes de editar, registrándolo en `_plan.md`. Criterio sugerido: cualquier nuevo subdirectorio bajo `scripts/lib/` o spec nueva bajo `openspec/specs/` dispara evaluación de cobertura.

### P2 — Mapa de canonicidad en `_plan.md` (ataca H2)
El plan debe incluir una tabla `concepto → página canónica`. Antes de escribir, verificar que ningún concepto aparezca como contenido principal en dos páginas; si ocurre, elegir canónica y convertir la otra en resumen + enlace.

### P3 — Paso de verificación factual obligatorio (ataca H3)
Nuevo paso entre redacción y cleanup: para cada afirmación cuantitativa o identificador de código citado en la página, ejecutar grep/read de contraste y anotar el resultado. Prohibido publicar cifras "de memoria". Los source maps ya hacen esto con hashes; extenderlo al cuerpo del texto.

### P4 — Checklist de salida verificable (ataca M5, M6, L7)
Sustituir reglas declarativas por checks medibles en Step 6.5 (cleanup):
- Cada página ≥30 líneas sustantivas (ya definido); si no → fusionar antes de cerrar.
- Grafo de enlaces: cada página con ≥1 enlace saliente y ≥1 entrante (o justificación en envelope).
- ≥1 diagrama Mermaid por página de flujo/arquitectura, o justificación explícita.
- Bloques Mermaid validados sintácticamente (labels con caracteres especiales entrecomillados).

### P5 — Chequeo de frescura de hechos volátiles (ataca H3/M4 residual)
Marcar como "hechos volátiles" los contadores que cambian con frecuencia (nº de targets, nº de tests, versiones, umbrales numéricos). En cada update, re-verificarlos aunque su archivo fuente no haya cambiado en la ventana — porque el cambio pudo venir de un archivo fuera del mapeo página→fuente.

### P6 — Metadatos completos en `.last-update.json` (ataca L8)
`sections` debe listar todas las páginas existentes; `filesSkipped` debe listar cuáles y por qué.

### P7 — QA post-generación independiente
Igual que el sandbox tiene verificación orchestrator-owned, añadir una pasada de contenido (readability + fact-spot-check) delegada a un revisor distinto del generador antes de cerrar la ruta como `success`.

## 6. Remediación del wiki actual (independiente del skill)

Aunque el skill mejore, el wiki vivo necesita una pasada correctiva:
1. Corregir los 5 errores factuales de H3.
2. Añadir página de dominio kernel/runtime (Authority Store, CAS, permits, budgets) y actualizar `state-management/persistence.md`.
3. Reflejar los 7 targets (cursor, antigravity) en architecture/generator/installation.
4. Resolver los tres clústeres de duplicación eligiendo página canónica.
5. Añadir los cross-links faltantes y fusionar/rellenar `rules-system/agent-rules.md`.

---

*Evidencia detallada página a página disponible en el informe de auditoría de esta sesión; cada afirmación de este documento cita archivo:línea verificable.*
