# ADR-004: Registro Privado de Workspaces y Blindaje de Symlinks en Jerarquías No Instanciadas

- Status: proposed
- Change: k6a-contract-runtime-integration-remediation
- Date: 2026-08-23

## Context
`disposeWorkspace` procesaba rutas arbitrarias proporcionadas por callers externos, creando un vector de borrado fuera del sandbox. Además, symlinks en rutas ancestros no instanciadas podían eludir la validación.

## Decision
Indexar todos los workspaces activos en un registro privado en memoria (`Map`) impidiendo el borrado de rutas no registradas en `disposeWorkspace`, y recorrer recursivamente los ancestros de cada ruta en `allowed-paths-validator.js` para detectar symlink escapes.

## Alternatives
- Validar únicamente strings con regex: Rechazado porque no detecta enlaces simbólicos existentes en niveles intermedios de carpetas.
- Aceptar rutas de disco libres en `disposeWorkspace`: Rechazado por riesgo de borrado destructivo accidental o malicioso.

## Consequences
Blindaje total del ciclo de vida del workspace y contención fail-closed; la instancia de runtime mantiene estado local de workspaces activos. Reversibilidad alta.
