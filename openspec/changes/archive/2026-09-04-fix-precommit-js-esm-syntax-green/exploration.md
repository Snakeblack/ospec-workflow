# Exploration: fix-precommit-js-esm-syntax-green

## Exploration: Sintaxis ESM falsamente verde en fast pre-commit hook (.js/.cjs)

### Current State

`scripts/hooks/lib/staged-validator.js` valida staged files:

- `.js`/`.cjs` (líneas 181-192): `new vm.Script(content, { filename: file })`. Si falla y el
  mensaje contiene `"Cannot use import statement outside a module"` o
  `"Unexpected token 'export'"`, hace `continue` (líneas 185-190) — falso verde: un `.js`
  con `import` válido + otro error sintáctico real en el mismo archivo pasa sin reporte.
  Igual para `.cjs`, donde `import`/`export` es ilegítimo por semántica CommonJS explícita.
- `.mjs` (líneas 193-195): delega a `checkMjsSyntax` (líneas 123-155) — materializa el blob
  en un temporal `<os.tmpdir()>/ospec-mjs-*/staged-check.mjs`, ejecuta
  `node --check` (`process.execPath`, `shell: false`), extrae la línea con `SyntaxError`
  del stderr como diagnóstico, retorna `{ file, error, type: "mjs-syntax" }` y limpia el
  directorio temporal en `finally` (best-effort, no enmascara el resultado).

### Affected Areas

- `scripts/hooks/lib/staged-validator.js` — bloque `if (ext === ".js" || ext === ".cjs")`
  líneas 181-192 es el único punto a modificar. `checkMjsSyntax` (123-155) ya existe.
- `scripts/hooks/lib/staged-validator.test.js` — tests de sintaxis staged; patrón existente
  con `deps.getStagedContent` y `deps.spawnSync` mockeados (líneas 427-472).
- `scripts/hooks/lib/staged-validator.integration.test.js` — tests de integración con repo
  Git efímero (`setupEphemeralRepo`); candidatos para los 2 tests de regresión end-to-end.

### Mecanismo .mjs reutilizable

**Sí.** `checkMjsSyntax(repoRoot, file, content, deps)` es exactamente lo necesario:
recibe contenido (no lee del working tree), escribe temporal `.mjs`, corre `node --check`,
devuelve `null` o `{ file, error, type }` y hace cleanup en `finally`. Está exportada de
facto vía su uso interno; sólo hay que llamarla desde la rama `.js`/`.cjs` cuando el error
de `vm.Script` sea únicamente de modo ESM. Sugerencia quirúrgica (sin firma nueva pública):

```js
if (ext === ".js" || ext === ".cjs") {
  try {
    new vm.Script(content, { filename: file });
  } catch (err) {
    const isEsmModeError =
      err.message.includes("Cannot use import statement outside a module") ||
      err.message.includes("Unexpected token 'export'");
    if (isEsmModeError && ext === ".js") {
      // .js: el contenido puede ser ESM legítimo; validar como módulo real.
      const esmError = checkMjsSyntax(repoRoot, file, content, deps);
      if (esmError) errors.push(esmError);
      continue;
    }
    errors.push({ file, error: err.message, type: "js-syntax" });
  }
}
```

Efecto colateral deseado para `.cjs`: al no entrar en la exención, `import`/`export` en
`.cjs` cae al `errors.push` con `type: "js-syntax"` — cumple requisito 2 sin código extra.
Ojo con el mensaje en `.cjs` con `import`: "Cannot use import statement outside a module"
es exactamente el error correcto y descriptivo para CommonJS.

Detalle menor: `checkMjsSyntax` retorna `type: "mjs-syntax"` aunque el archivo sea `.js`;
para `.js` ESM es aceptable (indica el camino de validación), o se puede remapear a
`"js-esm-syntax"` si se prefiere claridad en el mensaje del hook (decisión de diseño menor,
no contractual).

### Patrón de tests existente

- Unit (`staged-validator.test.js`): se pasa un array de rutas fake (`["module.js"]`),
  `deps.getStagedContent: () => <contenido>` y `deps.spawnSync: (cmd, args) => ({status, stderr})`
  con asserts sobre `cmd === process.execPath`, `args[0] === "--check"` y extensión del temporal
  (ver líneas 438-472 para `.mjs` válido/roto). Réplica directa para:
  1. `.js` ESM roto: `"import x from 'x';\nconst broken = ;"` con `spawnSync` mock que
     retorna `status: 1` + stderr con `SyntaxError` → expect `errors.length === 1`.
     Test adicional: assert de que `node --check` FUE invocado (hoy no se invocaría).
  2. `.cjs` con `import`: `["module.cjs"]`, `spawnSync` que falla si es llamado → expect
     1 error `type: "js-syntax"` con mensaje sobre import statement.
- Integración (`staged-validator.integration.test.js`): patrón `setupEphemeralRepo` +
  `git add` + hook real; opcional pero valioso para el escenario end-to-end.

### Requisito de contrato OpenSpec

`openspec/specs/git-precommit-hook/spec.md`, Requirement "Validación de consistencia de
OpenSpec" (REQ-git-precommit-hook-001), línea 27:

> "la validación sintáctica de archivos JavaScript (`.js`, `.mjs`, `.cjs`) y JSON (`.json`) MUST leer los blobs directamente desde el índice de Git mediante `git show :<path>` …, sin leer del árbol de trabajo"

y línea 28: "Si cualquier archivo preparado en el índice de Git contiene errores de sintaxis …, el commit MUST cancelarse con código de salida diferente de cero y un mensaje de error descriptivo."

El falso verde actual viola el espíritu de la línea 28 (errores de sintaxis reales en `.js`
ESM no cancelan el commit). La exención `.cjs` también contradice la semántica de la línea 26
que nombra `.cjs` como JavaScript a validar. El fix alinea el código con el spec vigente;
no requiere delta de spec (el escenario `.mjs` vía `node --check` ya está normado en las
líneas 55-60 y el fix generaliza ese mecanismo a `.js` con contenido ESM).

### Riesgos

1. **`.js` con ESM legítimo en el repo**: `scripts/lib/target-profiles/opencode-plugin.js`
   y `scripts/configure/__fixtures__/golden/opencode/.opencode/plugins/ospec.js` usan
   `import`/`export` reales en `.js`. Hoy pasan por el `continue`; tras el fix pasarán por
   `node --check` temporal (son ESM válido → OK). Costo: ~1 spawn de Node extra por archivo
   `.js` ESM staged. Aceptable; no rompe commits existentes.
2. **Falsos positivos**: un `.js` CJS que falle sólo por ESM-mode-error pero que NO esté
   package-scoped como módulo (p.ej. repo sin `"type": "module"`) se validará como ESM.
   Trade-off conocido: no hay forma estática barata de distinguir; validar como ESM es
   menos malo que el falso verde actual. Riesgo residual: error sintáctico dentro de un
   `.js` CJS precedido de `import` podría reportarse como error ESM en vez de CJS — sigue
   siendo error reportado, no falso verde.
3. **Rendimiento**: `node --check` es un spawn por archivo ESM; en commits con varios
   `.js` ESM el hook se ralentiza (~100-300 ms por archivo en Windows). Mitigable
   agregando los archivos en un único paso futuro (fuera de alcance aquí).
4. **Windows**: `checkMjsSyntax` ya corre en Windows hoy para `.mjs` (mkdtemp en os.tmpdir,
   `shell: false`, rutas absolutas) — el fallback `.js` reutiliza el mismo código, riesgo
   bajo.
5. **Casos borde**: BOM (`node --check` lo tolera), shebang en ESM (Node ≥22 lo soporta),
   archivo vacío (`vm.Script("")` no lanza; ni llega al fallback). Sin acción requerida.

### Recommendation

Fix quirúrgico en `scripts/hooks/lib/staged-validator.js` líneas 181-192 con el patrón
descrito arriba: exención ESM sólo para `.js`, delegando a `checkMjsSyntax` (reutilización
directa, sin extraer nueva función ni cambiar firmas públicas); `.cjs` pierde la exención y
reporta con `type: "js-syntax"`. Tests unitarios de regresión con el patrón mock existente
(`getStagedContent` + `spawnSync`) y, opcionalmente, uno de integración efímero. El cambio
queda dentro del presupuesto de 400 líneas con holgura.

### Ready for Proposal

Sí (el intent-briefing ya está accepted en state.yaml; siguiente fase: sdd-spec/tasks según
ruta bugfix).
