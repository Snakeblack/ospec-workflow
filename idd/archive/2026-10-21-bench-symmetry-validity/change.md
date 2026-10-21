# bench-symmetry-validity

## Intent and acceptance

El banco compara brazos asimétricos y no acredita su validez: Engram solo en gentle-ai (#340), digest de plugin no reproducible en agy, calidad declarada sin exigir y encuadre de docs sesgado (#341)

Acceptance: Cada brazo (idd, sdd, gentle-ai) en claude y agy arranca con el MCP de Engram y su record guarda engram_mcp_bytes, plugin_commit, tokens por turno y el modo de cierre de cada categoría de open-facts; el checkpoint rechaza records sin Engram en los dos brazos y falla si los márgenes declaran calidad sin resultado; dos HOME distintos del mismo commit dan el mismo plugin_digest en agy; README y docs del banco no presentan p≈0,49 como victoria, declaran la asimetría de Engram y la autoría real de receta-spa

## Plan

1. Calidad en el checkpoint (OSP-026): `evaluateQuality` pasa a `scripts/evals/quality/criterion.js`, `checkpoint.js` lo aplica y `bench.js checkpoint` lee `results/<base>__<cand>/quality.json` (`--quality-dir`).
2. Digest reproducible en agy: `hashFiles` lee el HOME como `~` y deja fuera los binarios; el record guarda `repo_commit`.
3. Engram en todos los brazos (OSP-025): `hosts/engram.js` (`setupEngram`, `claudeEngramDigest`), `buildOspecHome` con `engram`, hosts de Claude y agy con `engram`, `bench.js` lo prepara para `idd` y `sdd`.
4. Record schema 3: `repo_commit`, `host.engram_mcp_bytes` obligatorio, `tokens` por turno del agente y `open_facts` (`iddOpenFacts` en `arms.js`), con la tabla en el informe.
5. Docs: README del banco y de quality, spec `bench`, README/README.es, `docs/benchs/`, `docs/comparacion-arneses.md`, roadmap; test de encuadre en `docs-lint.test.js`.

## Decisions

- Engram de los brazos ospec: `engram setup <agent>` completo (MCP y protocolo; en Claude, el plugin `engram@engram` con hooks), no solo el MCP (usuario, 2026-10-21). El binario es el del HOME de gentle-ai del host (o `--engram-bin`), para que sea el mismo; sin él, `run` se niega con el comando para instalarlo.
- En Claude, `engram setup` corre en la copia de la configuración del agente (ahora también para `sdd`), y la persona conserva la suya. El plugin de Engram sale del marketplace de GitHub y su versión flota, así que `plugin_version` añade `(engram X)` y `plugin_digest` combina el plugin de ospec con el de Engram y sus servidores MCP.
- El commit va en `repo_commit` del record, no en `host`: identifica el checkout del banco para cualquier brazo (también gentle-ai). No forma parte de la identidad de reanudación, porque el contenido ya lo fijan `plugin_digest` y `harness_digest`.
- Sin calidad declarada no hay veto; con calidad declarada y sin resultado, `quality-missing` (usuario, 2026-10-21); con resultado, su veredicto entra como razón `quality`.
- Un record sin `engram_mcp_bytes` en cualquier brazo es `not-comparable`. Los records de schema 1 y 2 se siguen leyendo, pero el par de E4.6 ya no se compara.
- Modelos por defecto en Claude: agente, persona y juez de calidad con `claude-haiku-5-5` (usuario, 2026-10-21). agy no ofrece Haiku y conserva los suyos.
- `receta-spa`: se corrigen los docs públicos (misma sesión, independencia no demostrada); el escenario reservado de verdad lo escribe otra sesión antes de #342 (usuario, 2026-10-21).
- La corrida (repetir `idd-4` con Engram y recoger la calidad del par) queda fuera de este cambio: #340 y #341 siguen abiertos hasta entonces.
- `buildOspecHome` real regenera `dist/antigravity` del repo, y `model-tier-contract.test.js` digiere `dist/` en paralelo. Los tests nuevos de agy simulan el instalador, y solo el test existente hace builds reales (dos, en dos HOME distintos), así que la carrera no crece.

## Evidence

<!-- ospec:evidence:start -->
- ev-1: repro-run-pair for repro-test (2026-10-21T10:57:13.130Z)
- ev-2: migration-test for migration-compat-and-test (2026-10-21T11:03:11.894Z)
- ev-3: check-run for checks-pass (2026-10-21T11:04:13.488Z)
- ev-4: living-doc-current for living-doc (2026-10-21T11:04:19.730Z)
<!-- ospec:evidence:end -->
