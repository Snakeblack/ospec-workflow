# E4.1 `bench-scenarios`: línea base del modo SDD

Fecha: 2026-10-06 · Record: [`scripts/evals/bench/records/sdd-baseline-2.json`](../../scripts/evals/bench/records/sdd-baseline-2.json) · Plugin: ospec-workflow v2.105.1 (`fb9eb2c43d8c`) · Harness: `b96cf8ec829d` · Corpus: `dde01d7028a9`.
Host: Claude Code 2.1.289 en modo headless (`claude -p`), modelo `claude-sonnet-5-5`, persona `claude-sonnet-5-5`, una repetición. Topes: 30 turnos de agente, 6 de setup y $25 por escenario.

La tabla se regenera sin llamar a un modelo con `node scripts/evals/bench/bench.js report --record sdd-baseline-2`. Este informe es la línea base que el brazo IDD tendrá que superar en E1.6 con los márgenes `bench-margins-1`.

## 1. Resultado

| Escenario | Estado | Tokens | Coste | Duración | Turnos | Preguntas (decisivas) | Intervenciones | Checks | Escapados |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| cli-local | complete | 6.136 k | $3,62 | 10,0 min | 3 | 2 (0) | 2 | 8/8 | ninguno |
| saas-small | complete | 8.547 k | $4,32 | 15,8 min | 2 | 1 (0) | 1 | 7/7 | ninguno |
| regulated | complete | 12.373 k | $7,31 | 16,5 min | 3 | 2 (1) | 2 | 7/7 | ninguno |
| brownfield | complete | 19.104 k | $12,51 | 22,9 min | 6 | 5 (2) | 5 | 7/7 | ninguno |
| public-library | complete | 10.413 k | $5,19 | 18,5 min | 3 | 2 (1) | 2 | 7/7 | ninguno |
| bugfix | complete | 6.566 k | $4,05 | 9,8 min | 3 | 2 (2) | 2 | 7/7 | ninguno |
| **Total** | 6/6 | **63.138 k** | **$37,00** | 93,4 min | | 14 (6) | 14 | 43/43 | **0** |

Los tokens suman entrada, salida, lecturas y escrituras de caché de todos los modelos de la corrida, subagentes incluidos. El setup del proyecto (`sdd-init`, $1,60 en total) y la persona ($0,32) no cuentan. El coste es el que informa el host; la corrida se pagó con cuota de suscripción.

**Lo que fija para E1.6:**

- **Defectos escapados: 0.** El margen «Δ escapados ≤ 0» exige que IDD tampoco escape ninguno.
- **Tokens: 63,1 M.** IDD puede gastar como mucho el 90 %, unos **56,8 M**, en los mismos seis escenarios.
- **Vetos fijos:** ninguna corrida IDD puede quedar incompleta, y ningún check que SDD pasa (aquí, los 43) puede fallar en IDD.

## 2. Qué se observa

### 2.1 El modo SDD acierta, y casi siempre sin necesitar los hechos ocultos

Los 43 checks ocultos pasan. De los 25 hechos ocultos, la persona reveló 11: ninguno en `cli-local` ni en `saas-small`, 1 de 4 en `regulated`, 4 de 5 en `brownfield`, 2 de 3 en `public-library` y 4 de 4 en `bugfix`. Los demás los dedujo bien el agente a partir del código o de defaults razonables. Los hechos se revelan corrigiendo la síntesis inicial (`brownfield`, `public-library`, `bugfix`) o respondiendo a preguntas de verify (`regulated`, `bugfix`).

### 2.2 Dónde se detiene el modo SDD

Las 14 intervenciones se reparten así:

| Motivo de la pausa | Escenarios | Pausas |
| --- | --- | ---: |
| Confirmar la síntesis de la intención (gate `intent-briefing`) | los 6, más una síntesis corregida en `brownfield` y `public-library` | 8 |
| Ruta no declarada: `validate-phase` rechaza `lite`, pide `freeform` | cli-local | 1 |
| Modo de ejecución (`interactive` + `ask-on-risk`) tras `no_matching_eligible_route` | brownfield | 1 |
| Verify bloqueado por supuestos sin confirmar | regulated, brownfield, bugfix | 3 |
| Aceptar los avisos de verify antes de archivar | brownfield | 1 |

Solo 6 de las 14 preguntas cambiaron una decisión. Las 8 restantes piden permiso para seguir o confirman algo que el usuario ya había aprobado. IDD prevé tres gates (intención ambigua, ADR enmendado o contradicho, operación irreversible), y, a juicio de este análisis, ninguna de las seis peticiones activaría el de intención ambigua: todas traen un resultado esperado comprobable. Las correcciones de la síntesis sí aportaron hechos (§2.1), así que IDD tendrá que obtenerlos de otra forma o asumir el riesgo de escaparlos.

### 2.3 Coste

- **El 91 % de los tokens son lecturas de caché** (89,8 %–92,5 % según el escenario). El contexto se relee en cada turno de cada subagente; el modo SDD lanza entre 7 y 10 subagentes por cambio.
- **`brownfield` es el más caro** ($12,51, 19,1 M tokens): seis turnos, clasificación `normal` con propuesta, specs, diseño, dos ADRs y verify con 8 supuestos.
- **Varianza:** el primer escenario de la corrida descartada `sdd-baseline-1` (`cli-local`, misma versión del producto, persona Haiku) costó $9,49 y 16,8 M tokens, frente a $3,62 y 6,1 M aquí: 2,7 veces más. No son comparables (cambió la persona), pero indican que una sola repetición puede tener más ruido que el margen del 10 % en tokens. Antes de ejecutar el brazo IDD conviene decidir si el checkpoint usa más de una repetición por escenario.

## 3. Hallazgos de producto (modo SDD)

1. **`sdd-init` no escribe `routing:` y `validate-phase` no admite su ausencia.** Sin tabla de rutas en `openspec/config.yaml`, `scripts/validate-phase.js` rechaza toda ruta salvo `freeform` («la ruta 'lite' no está declarada con fases»), mientras el protocolo del orquestador dice que, sin `routing:`, se aplican las reglas por defecto. En `cli-local` el agente tuvo que pedir permiso al usuario para seguir en `freeform`, sin validación de transiciones. En `brownfield` el despachador devolvió `no_matching_eligible_route` y degradó a un flujo interactivo. Es una pregunta que provoca el producto, no el escenario.
2. **Verify se bloquea esperando confirmar supuestos** en la mitad de los escenarios, incluso con todos los tests en verde y sin hallazgos críticos. Es la mayor fuente de preguntas no decisivas después de la síntesis.
3. **El archivo funcionó en los seis escenarios** (`outcome: success`). En la corrida descartada había fallado dos veces en `cli-local`; con v2.105.1 no se reprodujo.

## 4. Incidencias de la corrida y del banco

- **Interrupciones.** Un apagado del equipo cortó `regulated`, que se repitió desde cero. Al agotarse la cuota de sesión de la suscripción, `public-library` quedó `incomplete (host-error)` y `bugfix` `setup-incomplete`; se repitieron tras la renovación. El record guarda solo la última corrida de cada escenario, y la identidad (host, plugin, harness y corpus) no cambió entre reanudaciones.
- **Follow-ups del banco**, sin aplicar para no cambiar la huella del harness a mitad de la línea base:
  - El límite de sesión del host («You've hit your session limit») debería abortar toda la corrida en vez de registrar `host-error` y pasar al siguiente escenario, que también se pierde.
  - Una corrida `setup-incomplete` se juzga contra la semilla y el informe le cuenta los checks fallidos como defectos escapados (5 en el intento fallido de `bugfix`). El checkpoint ya veta las corridas incompletas, pero el informe debería mostrarlas como no juzgadas.
