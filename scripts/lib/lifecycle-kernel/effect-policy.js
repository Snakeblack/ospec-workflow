"use strict";

const EFFECT_CLASSES = Object.freeze([
  "pure",
  "idempotent-keyed",
  "probeable",
  "compensatable",
  "irreversible",
]);

const EFFECT_CLASS_SET = new Set(EFFECT_CLASSES);

function requireEffectClass(effect) {
  if (!effect || typeof effect !== "object") {
    return { ok: false, code: "effect-class-required" };
  }
  const cls = effect.effect_class;
  if (typeof cls !== "string" || !EFFECT_CLASS_SET.has(cls)) {
    return { ok: false, code: "effect-class-required" };
  }
  return { ok: true, effect_class: cls };
}

/**
 * Class → retry / next-kind policy. Never claims exactly-once over external I/O.
 */
function applyEffectPolicy({ effect_class, reconcileAction, ambiguous = false, effect_id } = {}) {
  if (!EFFECT_CLASS_SET.has(effect_class)) {
    return { ok: false, code: "effect-class-required" };
  }

  if (effect_class === "pure") {
    return {
      ok: true,
      effect_class,
      may_reevaluate: true,
      retry: reconcileAction === "retry-execute" || reconcileAction === "execute",
      same_key: true,
      claims_exactly_once: false,
    };
  }

  if (effect_class === "idempotent-keyed") {
    return {
      ok: true,
      effect_class,
      may_reevaluate: reconcileAction === "retry-execute",
      retry: reconcileAction === "retry-execute" || reconcileAction === "execute",
      same_key: true,
      idempotency_key: effect_id || null,
      claims_exactly_once: false,
    };
  }

  if (effect_class === "probeable") {
    return {
      ok: true,
      effect_class,
      may_probe: true,
      invent_success: false,
      claims_exactly_once: false,
    };
  }

  if (effect_class === "compensatable") {
    return {
      ok: true,
      effect_class,
      may_compensate_on_confirmed_failure: true,
      claims_exactly_once: false,
    };
  }

  // irreversible
  if (ambiguous) {
    return {
      ok: false,
      code: "irreversible-ambiguous",
      effect_class,
      next_kind: "decide", // decide|stop — decide is default; callers may choose stop
      allowed_next_kinds: Object.freeze(["decide", "stop"]),
      auto_retry: false,
      claims_exactly_once: false,
      not_code_defect: true,
    };
  }

  return {
    ok: true,
    effect_class,
    auto_retry: false,
    claims_exactly_once: false,
  };
}

function selectIrreversibleAmbiguousNext(preference = "decide") {
  if (preference === "stop") return "stop";
  return "decide";
}

function blockDirectWrite({ hasPermit, usedCas, hasEffectClass } = {}) {
  if (hasPermit && usedCas && hasEffectClass) {
    return { ok: true };
  }
  return { ok: false, code: "direct-write-blocked" };
}

module.exports = {
  EFFECT_CLASSES,
  requireEffectClass,
  applyEffectPolicy,
  selectIrreversibleAmbiguousNext,
  blockDirectWrite,
};
