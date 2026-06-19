# Tasks: Detección de Base Compartida Cross-Repo (C4)

- [x] **Fase 1: Pruebas Unitarias RED y Mocking**
  - [x] 1.1 Crear el fichero de pruebas `scripts/federated-general-baseline.test.js` e implementar tests RED para la extracción de dependencias de `package.json` y `go.mod`.
  - [x] 1.2 Implementar test RED que valide la clasificación de dependencias alineadas vs desalineadas (desviaciones).
  - [x] 1.3 Implementar test RED que valide la generación del reporte `docs/architecture/shared-baseline.md`.
- [x] **Fase 2: Implementación de la Capa Lógica y Agentes**
  - [x] 2.1 Crear el módulo `scripts/lib/workspace-general-baseline.js` con las funciones de extracción y análisis de dependencias de miembros.
  - [x] 2.2 Implementar en `scripts/lib/workspace-general-baseline.js` el formateo de tablas markdown para la síntesis de `shared-baseline.md`.
  - [x] 2.3 Modificar `skills/sdd-workspace/SKILL.md` para incluir el contrato de la operación `general-baseline`.
  - [x] 2.4 Modificar `agents/sdd-workspace.agent.md` para documentar la aceptación de la operación `general-baseline`.
- [x] **Fase 3: Refactorización y Pruebas en GREEN**
  - [x] 3.1 Ejecutar los nuevos tests unitarios y asegurar que pasen en verde (`node --test scripts/federated-general-baseline.test.js`).
  - [x] 3.2 Correr la suite de pruebas completa del proyecto y corregir cualquier regresión (`node scripts/check.js`).
