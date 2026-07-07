# Documentación Técnica de ospec-workflow (v2.20.3)

Esta carpeta contiene la documentación detallada del arnés de agentes y la metodología SDD. Mientras que el `README.md` de la raíz se enfoca en la filosofía y el inicio rápido, aquí se detalla el funcionamiento interno, diseño de sistemas y arquitectura de ejecución.

---

## Índice de Lectura Recomendada

### 🎯 Metodología y Ciclo SDD (Spec-Driven Development)

| Documento | ¿Para qué sirve? |
| :--- | :--- |
| [sdd-metodologia.md](sdd-metodologia.md) | **Modelo Mental**: Principios, roles (Humano, Orquestador, Fase), y por qué el contrato va antes que el código. |
| [sdd-fases.md](sdd-fases.md) | **Detalle de Fases**: Contratos, entradas/salidas y reglas para las 12 fases del ciclo (incluyendo la nueva fase de resolución de ambigüedad `/sdd-clarify`). |
| [sdd-workflows.md](sdd-workflows.md) | **Flujos Reales**: Caminos de ejecución estándar, lite, FF, baseline brownfield para sembrado de specs, y flujos federados multi-repo. |
| [openspec.md](openspec.md) | **OpenSpec**: Persistencia de artefactos delta, estructura de `state.yaml` y el nuevo registro de micro-decisiones (**Assumption Ledger**). |
| [tdd-y-revision.md](tdd-y-revision.md) | **Calidad y Verificación**: Ciclo Strict TDD, Git hooks de pre-commit, presupuestos de revisión (~400 líneas) y niveles de evidencia. |

### ⚙️ Arquitectura, Runtime e Instalación

| Documento | ¿Para qué sirve? |
| :--- | :--- |
| [harness-runtime.md](harness-runtime.md) | **Capas del Arnés**: Hooks del ciclo de vida, caché v2, políticas activas de seguridad (**AgentShield**), límites (**Token Budget Advisor**) y enforzamiento de no atribución AI. |
| [harness-go-js-parity.md](harness-go-js-parity.md) | **Frontera Go ↔ JS**: Relación entre el motor Go ultrarrápido del camino caliente (~30ms) y el fallback local de Node.js, contratos de paridad y agregación de federación. |
| [plugin-installation.md](plugin-installation.md) | **Instalación y Compilación**: Cómo configurar y generar compilados nativos autocontenidos en `dist/` para VS Code, Claude Code, GitHub Copilot CLI y opencode. |
| [model-routing.md](model-routing.md) | **Routing de Modelos**: Selección inteligente de modelos por tiers (`cheap` vs `premium`) según el costo y tipo de fase en `models.yaml`. |
| [mcp-policy.md](mcp-policy.md) | **Política de Servidores MCP**: Activación de plugins adicionales externos (Context7 para documentación, MarkItDown para conversión). |
| [comparacion-arneses.md](comparacion-arneses.md) | **Análisis Comparativo**: Evaluación técnica de `ospec-workflow` frente a otros arneses de referencia (Gentle AI, ECC, Spec Kit). |

---

## Idea Central

> **La velocidad sin dirección es desperdicio.**

SDD no busca añadir fricción ni burocracia innecesaria. Existe para evitar que la IA construya soluciones incorrectas por falta de entendimiento del dominio. Fijar un contrato claro de comportamiento, arquitectura y tareas antes de codificar garantiza implementaciones de alta calidad y revisiones sencillas de realizar.

