"use strict";

/**
 * Validates embedded Obligation Manifest completeness fail-closed.
 * @param {Array<Object>} obligations - Array of obligation items
 * @param {Array<Object>|Object} nodes - Array of semantic nodes or node map
 * @returns {{ valid: boolean, unmapped: string[], missingEvidence: string[], errors: string[] }}
 */
function validateObligationManifest(obligations, nodes) {
  const errors = [];
  const unmapped = [];
  const missingEvidence = [];

  if (!Array.isArray(obligations)) {
    return {
      valid: false,
      unmapped: [],
      missingEvidence: [],
      errors: ["obligations must be an array"],
    };
  }

  const nodeIds = new Set();
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      if (node && typeof node === "object" && typeof node.node_id === "string") {
        nodeIds.add(node.node_id);
      }
    }
  } else if (nodes && typeof nodes === "object") {
    for (const key of Object.keys(nodes)) {
      nodeIds.add(key);
    }
  }

  for (const obligation of obligations) {
    if (!obligation || typeof obligation !== "object") {
      errors.push("obligation item must be an object");
      continue;
    }

    const id = String(obligation.id || "");
    if (!id) {
      errors.push("obligation id is required");
      continue;
    }

    const criticality = String(obligation.criticality || "must").toLowerCase();
    const implementedBy = Array.isArray(obligation.implemented_by) ? obligation.implemented_by : [];
    const requiredEvidence = Array.isArray(obligation.required_evidence) ? obligation.required_evidence : [];
    const hasDeferral =
      obligation.deferred &&
      typeof obligation.deferred === "object" &&
      typeof obligation.deferred.reason === "string" &&
      obligation.deferred.reason.trim() !== "" &&
      typeof obligation.deferred.approved_by === "string" &&
      obligation.deferred.approved_by.trim() !== "";

    // Check referenced node IDs exist in nodes
    for (const targetNodeId of implementedBy) {
      if (!nodeIds.has(targetNodeId)) {
        errors.push(`obligation "${id}" references non-existent node "${targetNodeId}"`);
      }
    }

    if (criticality === "must") {
      if (!hasDeferral) {
        if (implementedBy.length === 0) {
          unmapped.push(id);
          errors.push(`MUST obligation "${id}" is not implemented by any graph node and lacks approved deferral`);
        }
        if (requiredEvidence.length === 0) {
          missingEvidence.push(id);
          errors.push(`MUST obligation "${id}" lacks required verification evidence and lacks approved deferral`);
        }
      }
    }
  }

  const valid = errors.length === 0 && unmapped.length === 0 && missingEvidence.length === 0;

  return {
    valid,
    unmapped,
    missingEvidence,
    errors,
  };
}

module.exports = {
  validateObligationManifest,
};
