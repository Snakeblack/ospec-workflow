"use strict";

const { cp, mkdir, readdir } = require("node:fs/promises");

const { runHarnessScenario } = require("../minimal-kernel-harness.js");

const NODE_ID = "campaign-node";
const INITIAL_STATE = Object.freeze({
  schema_version: 1,
  status: "ready",
  nodes: { [NODE_ID]: { id: NODE_ID, phase: "pending", attempt: 0 } },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function measurements({ phasesExecuted = 0, effectsExecuted = 0, eventsRecorded = 0, wallMs = 0, interruptions = 0, recoveries = 0 } = {}) {
  return {
    phases_executed: phasesExecuted,
    effects_executed: effectsExecuted,
    events_recorded: eventsRecorded,
    wall_ms: wallMs,
    interruptions,
    recoveries,
  };
}

function oracle(fixtureId) {
  return {
    applied: false,
    reason: `no observed contract for fixture ${fixtureId}`,
  };
}

function failure(fixtureId, code, values) {
  return {
    status: "fail",
    note: `machinery-baseline failed: ${code}`,
    measurements: measurements(values),
    oracle: oracle(fixtureId),
  };
}

function scenarioFailure(result) {
  const operation = result.operations.find((entry) => entry.code || entry.outcome === "blocked");
  return operation ? operation.code || "blocked" : null;
}

function recoveryExceedsBudget(result) {
  const corrections = result.budgets && result.budgets.corrections;
  return typeof corrections === "number" && corrections < 0;
}

async function materializeWorkspace(worktreePath, taskPath) {
  try {
    const entries = await readdir(worktreePath);
    if (entries.length > 0) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(worktreePath, { recursive: true });
  await cp(taskPath, worktreePath, { recursive: true, force: false });
  return true;
}

function lifecycleOperations() {
  // This machinery baseline measures the lifecycle machinery uniformly; task content varies only in the materialized workspace.
  // The kernel's execute phase is its effect executor between the canonical start and complete operations.
  return [
    { operation: "start", arguments: { node_id: NODE_ID } },
    { operation: "complete", arguments: { node_id: NODE_ID } },
  ];
}

function interruptedState(snapshot) {
  const state = clone(snapshot.state);
  state.status = "blocked";
  state.nodes[NODE_ID].phase = "failed";
  return state;
}

/**
 * Creates the fixed-policy K12 machinery baseline executor for runner.executePlan.
 * @param {{ cohort: object, now?: () => number, faults?: boolean }} options
 * @returns {(manifest: object, task: object) => Promise<object>}
 */
function createHarnessCampaignExecutor(options = {}) {
  const now = options.now || (() => Date.now());
  const faults = options.faults === undefined ? true : options.faults === true;

  return async function executeHarnessCampaign(manifest, task) {
    const startedAt = now();
    const fixtureId = manifest && manifest.fixture_id ? manifest.fixture_id : "unknown";
    let effectsExecuted = 0;
    let phasesExecuted = 0;
    let eventsRecorded = 0;
    let interruptions = 0;
    let recoveries = 0;
    const effectExecutor = async () => {
      effectsExecuted += 1;
      return { ok: true, usage: {} };
    };
    const elapsed = () => Math.max(0, now() - startedAt);

    try {
      if (!manifest || !task || !manifest.worktree_path || !task.task_path) {
        return failure(fixtureId, "invalid-run", { wallMs: elapsed() });
      }
      if (!await materializeWorkspace(manifest.worktree_path, task.task_path)) {
        return {
          status: "fail",
          note: "worktree-not-clean",
          measurements: measurements({ wallMs: elapsed() }),
          oracle: oracle(fixtureId),
        };
      }

      const scenario = await runHarnessScenario({
        id: manifest.run_id,
        subjectId: `k12:${fixtureId}`,
        initialState: clone(INITIAL_STATE),
        operations: lifecycleOperations(),
        effectExecutor,
        clock: () => 0,
        scenarioInterrupt: task.stratum === "adversarial" && faults ? "before-op:1" : null,
        budgets: { attempts: 0, corrections: 0 },
      });
      phasesExecuted += scenario.operations.length;
      eventsRecorded += scenario.events.length;

      const initialFailure = scenarioFailure(scenario);
      if (initialFailure) {
        return failure(fixtureId, initialFailure, {
          phasesExecuted,
          effectsExecuted,
          eventsRecorded,
          wallMs: elapsed(),
        });
      }

      if (task.stratum === "adversarial" && faults) {
        interruptions = 1;
        const continuation = await runHarnessScenario({
          id: `${manifest.run_id}:recover`,
          subjectId: `k12:${fixtureId}`,
          initialState: interruptedState(scenario.snapshot),
          initialJournal: scenario.snapshot.journal,
          initialAuthority: scenario.snapshot.authority,
          operations: [
            { operation: "recover", arguments: { node_id: NODE_ID } },
            ...lifecycleOperations(),
          ],
          effectExecutor,
          clock: () => 0,
          budgets: scenario.budgets,
        });
        phasesExecuted += continuation.operations.length;
        eventsRecorded += continuation.events.length;
        recoveries = continuation.operations.some((entry) => entry.operation === "recover") ? 1 : 0;
        const continuationFailure = scenarioFailure(continuation);
        if (continuationFailure || recoveryExceedsBudget(continuation)) {
          return failure(fixtureId, continuationFailure || "correction-budget-exceeded", {
            phasesExecuted,
            effectsExecuted,
            eventsRecorded,
            wallMs: elapsed(),
            interruptions,
            recoveries,
          });
        }
      }

      return {
        status: "pass",
        note: "machinery-baseline ok",
        measurements: measurements({
          phasesExecuted,
          effectsExecuted,
          eventsRecorded,
          wallMs: elapsed(),
          interruptions,
          recoveries,
        }),
        oracle: oracle(fixtureId),
      };
    } catch (error) {
      const code = error && error.code ? error.code : "executor-error";
      return failure(fixtureId, code, {
        phasesExecuted,
        effectsExecuted,
        eventsRecorded,
        wallMs: elapsed(),
        interruptions,
        recoveries,
      });
    }
  };
}

module.exports = { createHarnessCampaignExecutor };
