# content-security-signal

## Intent and acceptance

security-boundary también deriva del contenido del diff: un sink de seguridad (CWE) en una línea añadida a código de producto deriva la señal y su trust-review aunque ninguna ruta case con los patrones de seguridad (E1.50); la PR lleva además las filas nuevas del roadmap E1.59, E1.60, E4.18 y el ítem de adopción en SDD, el nuevo orden del bloque C y la corrección de E1.52

Acceptance: Un diff que añade a código de producto fuera de las rutas de seguridad un sink del catálogo (eval, SQL concatenado, exec con comando compuesto, TLS sin verificar, deserialización insegura...) deriva security-boundary con source diff y trust-review pendiente; el mismo sink en un comentario, en un test o en documentación no la deriva; un corpus por stack lo prueba y la tasa de falsos positivos sobre los diffs de idd/archive/ queda publicada en el roadmap

## Plan

<!-- ospec:plan:start -->
- Files: `docs/roadmaps/harness-evolution.md`, `handbook/idd/flujo-idd.md`, `openspec/specs/idd/spec.md`, `scripts/lib/idd-contract.js`, `scripts/lib/idd-record.js`, `scripts/lib/idd-record.test.js`, `scripts/lib/idd-signals.js`, `scripts/lib/idd-signals.test.js`, `scripts/lib/idd-sinks.js`, `scripts/lib/idd-sinks.test.js`, `scripts/lib/k1-scope-guard.test.js`, `scripts/ospec.js`, `scripts/ospec.test.js`
- Work units: 2
<!-- ospec:plan:end -->

## Decisions

<!-- ospec:decisions:start -->
- El catálogo de sinks vive en scripts/lib/idd-sinks.js, adaptado del de gentle-ai (internal/reviewtransaction/risk_dangerous_sink.go, MIT) con su aviso de copyright en la cabecera, más SQL concatenado y exec/execSync de Node con comando compuesto; cada expresión se filtra por la extensión del fichero
- Un sink cuenta en una línea añadida a código de producto fuera de impact.exclude, build scripts incluidos; tests, documentación, manifiestos y las líneas de un test en línea de Rust no cuentan, y el contenido previo del fichero tampoco
- Se salta solo la línea que es entera un comentario según el lenguaje del fichero; el resto de la línea se compara entera, sin codePortion, para no cortar en el // de una URL
- security-boundary por contenido se suma a ANSWER_RETRACTABLE_SIGNALS: solo la respuesta del usuario atada a los hits la retira, nunca una razón del agente
- reviewedPathsChanged suma a las rutas vigiladas los ficheros cuyas líneas añadidas tienen un sink, así un sink añadido tras aprobar deja la review desfasada
- Una ruta planeada o de seguridad, o --security, nombra la señal antes que un sink: el contenido se deriva después de las rutas, así una señal planeada conserva source declaration
- La etiqueta del sink de eval es "code evaluation (CWE-94)": con "eval (CWE-94)" el propio catálogo derivaba la señal, porque la cadena casa con el patrón de eval
- Una plantilla etiquetada (sql`...${id}`) no es SQL compuesto porque enlaza sus valores; el SQL exige palabras clave en mayúsculas para que una frase como "Select a file from the list" no case, y cada literal se cierra con la comilla que lo abrió
<!-- ospec:decisions:end -->

## Evidence

<!-- ospec:evidence:start -->
- ev-1: check-run for checks-pass (2026-11-06T17:37:55.305Z)
- ev-2: contract-spec-and-test for contract-spec-and-test (2026-11-06T17:37:55.305Z)
- ev-3: migration-test for migration-compat-and-test (2026-11-06T17:38:12.860Z)
- ev-4: check-run for checks-pass (2026-11-06T17:40:11.889Z)
- ev-5: contract-spec-and-test for contract-spec-and-test (2026-11-06T17:40:11.889Z)
- ev-6: adr-impact-declaration for adr-impact-declaration (2026-11-06T17:40:11.889Z)
- ev-7: living-doc-current for living-doc (2026-11-06T17:40:12.044Z)
<!-- ospec:evidence:end -->
