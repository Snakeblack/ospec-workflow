# Question Shape Library (on-demand)

Canonical `AskUserQuestion` payload shapes for the orchestrator's session-level
gates. Read this file only when composing one of these questions (pointer-table
handler); the shapes then stay in context for the rest of the session.

Every `recommended: true` option MUST follow the Recommended Option Description
Contract (`sdd-phase-common.md` §D): rationale, main trade-off vs. the alternatives,
and reversibility.

## Delivery strategy question shape

```json
{
  "questions": [
      {
         "header": "Delivery strategy",
         "question": "¿Qué estrategia de entrega quieres usar para este cambio?",
         "options": [
         {
            "label": "ask-on-risk",
            "description": "Recomendado porque solo interrumpe cuando el riesgo de PR grande es real, evitando preguntas innecesarias en cambios pequeños. Trade-off frente a auto-chain: no divide proactivamente, así que la primera vez que aparezca riesgo alto igual detendrá el flujo para preguntar. Reversible en cualquier momento cambiando la estrategia cacheada en una sesión posterior.",
            "recommended": true
         },
         {
            "label": "auto-chain",
            "description": "Dividir automáticamente en PRs encadenadas cuando haya riesgo."
         },
         {
            "label": "single-pr",
            "description": "Intentar una sola PR, exigiendo excepción si supera el presupuesto."
         },
         {
            "label": "exception-ok",
            "description": "Permitir una PR grande con size:exception."
         }
         ],
         "allowFreeformInput": false
      }
   ]
}
```

## Review workload question shape

```json
{
  "questions": [
    {
      "header": "Review workload",
      "question": "El cambio parece superar el presupuesto de revisión. ¿Cómo quieres entregarlo?",
      "options": [
        {
          "label": "Chained PRs",
          "description": "Recomendado porque mantiene cada PR dentro del presupuesto de revisión de 400 líneas, reduciendo el riesgo de revisiones superficiales. Trade-off frente a size:exception: agrega coordinación entre PRs encadenadas y retrasa el merge final. Reversible antes de la primera PR; una vez abiertas las PRs encadenadas, consolidar de nuevo en una sola requiere reescribir el historial.",
          "recommended": true
        },
        {
          "label": "size:exception",
          "description": "Continuar como una PR grande con excepción explícita."
        },
        {
          "label": "Stop before apply",
          "description": "No implementar todavía."
        }
      ],
      "allowFreeformInput": true
    }
  ]
}
```

## Blocked-envelope preferred shape (sub-agent → orchestrator)

Reference example of the `status: blocked` envelope a phase agent returns when it
needs user input; the normative field definitions live in `sdd-phase-common.md` §D.

```json
{
  "status": "blocked",
  "blocker_type": "needs_user_decision",
  "executive_summary": "Brief reason why user input is required.",
  "question_gate": {
    "reason": "Why this decision blocks the phase.",
    "questions": [
      {
        "header": "Short title",
        "question": "Concrete question for the user.",
        "options": [
          {
            "label": "Option A",
            "description": "Why Option A is recommended; its trade-off vs. Option B; and whether the choice is reversible later.",
            "recommended": true
          },
          {
            "label": "Option B"
          }
        ],
        "multiSelect": false,
        "allowFreeformInput": true
      }
    ]
  },
  "artifacts": [],
  "next_recommended": "Ask the user and rerun this phase.",
  "risks": ["What remains blocked until answered."],
  "skill_resolution": "injected"
}
```
