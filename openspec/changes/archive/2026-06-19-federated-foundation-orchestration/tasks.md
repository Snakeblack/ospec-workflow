# Tasks: Ingesta de Documentos y Síntesis de Foundation Federado (C3)

- [x] **Fase 1: Pruebas Unitarias RED y Mocking**
  - [x] 1.1 Crear el fichero de pruebas `scripts/sdd-foundation-federated.test.js` e implementar el primer test RED para la lectura y consolidación del atlas cache en federado.
  - [x] 1.2 Implementar test RED para simular la resolución de contratos (`provides` / `consumers`) en la síntesis de documentación técnica.
  - [x] 1.3 Implementar test RED para simular el flujo interactivo de remediación cuando MarkItDown no está disponible.
- [x] **Fase 2: Implementación en Habilidades (Skills) y Agentes**
  - [x] 2.1 Modificar `skills/sdd-foundation/SKILL.md` para dar soporte a la lectura federada y síntesis de la matriz de contratos.
  - [x] 2.2 Agregar en `skills/sdd-foundation/SKILL.md` la lógica del flujo de remediación interactivo si el MCP de MarkItDown no está configurado.
  - [x] 2.3 Modificar `agents/sdd-foundation.agent.md` para aceptar parámetros de federación y el flujo interactivo.
  - [x] 2.4 Modificar `agents/sdd-orchestrator.agent.md` para orquestar la delegación a `sdd-foundation` con parámetros federados.
- [x] **Fase 3: Refactorización y Pruebas en GREEN**
  - [x] 3.1 Ejecutar los nuevos tests unitarios y asegurar que pasen en verde (`node --test scripts/sdd-foundation-federated.test.js`).
  - [x] 3.2 Correr la suite de pruebas completa del proyecto y corregir cualquier regresión (`npm test`).
  - [x] 3.3 Sincronizar las plantillas de configuración de destinos regenerando los goldens correspondientes en `cli.test.js` si es necesario.
