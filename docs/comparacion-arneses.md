# Análisis Comparativo: `ospec-workflow` vs. Otros Arneses de Agentes de IA

Este documento presenta un análisis comparativo del arnés actual (**ospec-workflow v2.14.2**) frente a tres arneses de desarrollo asistido por IA de referencia en el ecosistema de código abierto:
1. **[Gentle AI](https://github.com/Gentleman-Programming/gentle-ai)** de Gentleman Programming (código base de origen).
2. **[ECC (Everything Claude Code)](https://github.com/affaan-m/ECC)** de affaan-m (optimizador de rendimiento, memoria y tokens).
3. **[Spec Kit](https://github.com/github/spec-kit)** de GitHub (CLI y plantillas estructuradas bajo Spec-Driven Development).

El análisis evalúa cada arnés a través de 7 dimensiones arquitectónicas clave, asigna puntuaciones y propone oportunidades de mejora para `ospec-workflow`.

---

## 1. Matriz de Puntuación de Funcionalidades y Capacidades

| Dimensión | ospec-workflow (Actual) | Gentle AI (Origen) | ECC (affaan-m) | Spec Kit (GitHub) |
| :--- | :---: | :---: | :---: | :---: |
| **1. Runtime Hooks y Ciclo de Vida** | **10 / 10** | 8 / 10 | 8 / 10 | 2 / 10 |
| **2. Flujos de Trabajo y Recuperación** | **10 / 10** | 8 / 10 | 7 / 10 | 6 / 10 |
| **3. Desarrollo Guiado por Especificaciones (SDD)** | **10 / 10** | 8 / 10 | 6 / 10 | 9 / 10 |
| **4. Eficiencia de Tokens** | **8 / 10** | 8 / 10 | **10 / 10** | 4 / 10 |
| **5. Arquitectura y Multi-Target** | **10 / 10** | 7 / 10 | 9 / 10 | 6 / 10 |
| **6. Gestión de Memoria** | **9 / 10** | **9 / 10** | 8 / 10 | 2 / 10 |
| **7. Seguridad y Salvaguardas** | **8 / 10** | 7 / 10 | **10 / 10** | 5 / 10 |
| **Promedio Ponderado** | **9.3 / 10** | **7.9 / 10** | **8.3 / 10** | **4.9 / 10** |

---

## 2. Análisis Detallado por Dimensión

### A. Runtime Hooks y Ciclo de Vida
*   **`ospec-workflow` (10/10):** Dispone de 5 hooks de ciclo de vida altamente granulares (`SessionStart`, `PreToolUse`, `PreCompact`, `SubagentStop`, `Stop`). Utiliza un **motor de ejecución dual** optimizado para velocidad: los hooks del camino caliente (como `PreToolUse`, ejecutado antes de cada llamada a herramientas) se ejecutan mediante un **binario compilado en Go** (~0.03s de latencia), cayendo automáticamente a **scripts de Node.js** (~0.3–0.5s de arranque en frío) solo si el binario de Go no está compilado o disponible para la plataforma actual.
*   **Gentle AI (8/10):** Implementa hooks principalmente para refrescar el registro de habilidades al iniciar la sesión. Funciona sobre Node.js puro, lo que introduce pequeñas penalizaciones de latencia de arranque en frío dentro de CLI interactivas.
*   **ECC (8/10):** Utiliza hooks Node.js que interceptan flujos para guardar/cargar contextos de sesión, evaluar el consumo de tokens de forma preventiva y emitir alertas de seguridad.
*   **Spec Kit (2/10):** Al ser una CLI e intérprete estático de archivos markdown, carece de hooks dinámicos para interceptar herramientas o eventos de ciclo de vida en tiempo de ejecución del agente.

### B. Flujos de Trabajo y Recuperación de Estado
*   **`ospec-workflow` (10/10):** Ofrece flujos contextuales específicos:
    *   `Standard`: Ciclo completo (Explore $\rightarrow$ Propose $\rightarrow$ Spec $\rightarrow$ Design $\rightarrow$ Tasks $\rightarrow$ Apply $\rightarrow$ Verify $\rightarrow$ Archive).
    *   `Lite`: Flujo reducido para cambios de bajo riesgo.
    *   `FF` (Fast-Forward): Planificación inmediata hasta la generación de tareas.
    *   `Baseline Brownfield`: Siembra de especificaciones para código preexistente.
    *   `Workspace`: Federación y análisis de impacto cross-repo.
    *   `Continuation`: El estado se conserva en archivos YAML locales (`state.yaml`). Permite reanudar el flujo en cualquier momento, independientemente de si el historial del chat se compacta o se limpia.
*   **Gentle AI (8/10):** Soporta el pipeline estándar de SDD, pero carece de la federación multi-repo o de los workflows simplificados (Lite/Baseline).
*   **ECC (7/10):** Estructura el trabajo mediante planificación guiada por habilidades y desarrollo basado en pruebas, pero no tiene una máquina de estados delta-driven como OpenSpec.
*   **Spec Kit (6/10):** Impone un pipeline estricto de 5 pasos (Constitution $\rightarrow$ Spec $\rightarrow$ Plan $\rightarrow$ Tasks $\rightarrow$ Code). En caso de desconexión o reinicio del chat, la recuperación de estado requiere reanalizar manualmente los archivos markdown del repositorio.

### C. Desarrollo Guiado por Especificaciones (SDD) y Puertas de Calidad
*   **`ospec-workflow` (10/10):** Aplica pruebas de integración y Strict TDD. Implementa un **Review Workload Guard** que analiza el volumen de líneas modificadas y, si superan el presupuesto recomendado (~400 líneas), aconseja dividir el cambio en PRs encadenadas (`stacked-to-main` o `feature-branch-chain`) o requerir una confirmación explícita de excepción de tamaño (`size:exception`).
*   **Gentle AI (8/10):** Cuenta con los pasos de diseño e implementación guiados por especificación, pero no automatiza los límites de tamaño de revisión ni las estrategias de PRs encadenadas.
*   **ECC (6/10):** Ofrece habilidades de apoyo como la generación de ADR (Architecture Decision Records) y planes, pero no utiliza la especificación como motor primario de gates.
*   **Spec Kit (9/10):** Excelente base metodológica. Introduce el concepto de la **Constitución**, un archivo de políticas inmutables que dicta restricciones técnicas, convenciones de estilo y guías de arquitectura que el agente está obligado a seguir en cada cambio.

### D. Eficiencia de Tokens
*   **`ospec-workflow` (8/10):** Optimiza el contexto derivando tareas a subagentes y configurando perfiles en `models.yaml` (utilizando modelos más económicos como Claude Haiku o Flash para tareas mecánicas o exploración, y reservando modelos premium para diseño de arquitectura o verificación). Compacta las reglas de habilidades en `skill-registry.cache.json`.
*   **Gentle AI (8/10):** Implementa el enrutamiento de modelos por fases (Opus vs Sonnet) y la caché indexada de habilidades.
*   **ECC (10/10):** Es el líder en eficiencia. Cuenta con un sistema de **"Instalación Selectiva"** (inyectando solo las instrucciones y reglas de habilidades estrictamente necesarias para el contexto del cambio, en lugar de un prompt monolítico) y un **"Token Budget Advisor"** que evalúa el consumo del contexto y notifica al usuario cuando es óptimo compactar la sesión.
*   **Spec Kit (4/10):** Envía especificaciones y planes completos en formato markdown al contexto. No realiza optimización activa de tokens.

### E. Arquitectura y Soporte Multi-Target
*   **`ospec-workflow` (10/10):** Mantiene una única fuente de verdad (manifiesto canónico de VS Code) y cuenta con un compilador/generador puro (`scripts/configure/cli.js`) que transfigura el arnés para:
    *   **VS Code**: Carga directa del source.
    *   **Claude Code**: Compilación a `.claude-plugin`, mapeando variables y empaquetando hooks de shell.
    *   **GitHub Copilot CLI**: Conversión a `.github/agents/*.agent.md`, prompts `.github/prompts/*.prompt.md` e instrucciones `.github/instructions/`.
    *   **OpenCode**: Estructura `.opencode/` + `opencode.json` puenteando hooks de ciclo de vida con plugins JavaScript.
*   **Gentle AI (7/10):** Orientado principalmente a VS Code y Claude Code; requiere modificaciones manuales para otros targets.
*   **ECC (9/10):** Compatible con múltiples arneses (Claude Code, Cursor, Codex, OpenCode, Gemini, Zed) usando un script interactivo de instalación (`configure-ecc`), aunque no centraliza la compilación desde una fuente única canónica.
*   **Spec Kit (6/10):** Escrito en Python (usando `uv`). Es agnóstico por operar sobre archivos del espacio de trabajo, pero no se compila como plugin de IDE de forma nativa.

### F. Gestión de Memoria
*   **`ospec-workflow` (9/10):** Integración nativa con Engram (SQLite + FTS5) para almacenar memoria semántica de largo plazo, complementado con archivos de estado serializados en `.ospec/` para garantizar la continuidad cross-session.
*   **Gentle AI (9/10):** Desarrolló el protocolo de memoria persistente Engram (SQLite y API HTTP/MCP).
*   **ECC (8/10):** Almacena y carga metadatos de sesión y del proyecto mediante hooks automáticos de persistencia de contexto.
*   **Spec Kit (2/10):** No integra motores de memoria ni bases de datos vectoriales/FTS. El estado del proyecto reside estrictamente en el historial git y la documentación.

### G. Seguridad y Salvaguardas
*   **`ospec-workflow` (8/10):** El hook `PreToolUse` valida comandos de terminal y bloquea/solicita confirmación manual para herramientas que supongan un riesgo potencial.
*   **Gentle AI (7/10):** Control básico de uso de herramientas e interacción segura.
*   **ECC (10/10):** Cuenta con **AgentShield**, una herramienta que analiza proactivamente archivos de configuración (como configuraciones de Claude Code o Cursor) para detectar inyecciones de prompts en dependencias, fugas de credenciales en el espacio de trabajo y variables de entorno expuestas.
*   **Spec Kit (5/10):** La seguridad depende completamente de directrices estáticas declaradas en las directivas de la Constitución.

---

## 3. Conclusiones

El arnés actual `ospec-workflow` posee una de las arquitecturas más completas en cuanto a **ejecución híbrida nativa (Go/JS)**, **transformación automática de targets** y **robustez del workflow guiado por especificaciones**. 
