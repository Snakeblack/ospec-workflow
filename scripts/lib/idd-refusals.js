"use strict";

// How to get past each refusal of the ospec CLI (E1.45, B5), so the agent
// follows the protocol without reading the CLI. A site that knows more (the
// change, a path, a command) passes its own `how`, which wins; a refusal that
// only a CLI defect reaches is marked by design, with why. idd-refusals.test.js
// finds every code the CLI throws and requires one of the two. `<id>` stands
// for the change and is filled in when the call names it.

const { GATES, IMPACTS, INTENT_KINDS, SIGNALS } = require("./idd-contract.js");

const NEXT = "ospec next --change <id> --json names the next step";
const ANSWER = '--answer "<the user\'s words>" --source user';
const RESTORE_STATE =
  "the CLI owns idd/<id>/state.yaml: restore it with git checkout -- idd/<id>/state.yaml, or move it aside with ospec doctor --repair and resume the change, then run the command again";
const CLI_ONLY = "only the CLI records evidence, from runs it observes; no agent input reaches it";

const REFUSALS = Object.freeze({
  "ambiguous-intent-open": `resolve the intent first: ask the question of ospec next --change <id> --json and record the answer with ospec record intent --change <id> ${ANSWER} and the kind, summary and acceptance`,
  "answer-incomplete": "confirmed and assumed need --source-kind and --source-ref, assumed also --review-trigger, n/a needs --reason and deferred needs --owner",
  "archive-conflict": "the archive already holds other content under that name: show both to the user, who decides; ospec close never overwrites an archive",
  "archive-failed": "the change stays open: run ospec close --change <id> again, and report it with the output of ospec doctor if it fails again",
  "assumption-required": 'ospec record assumption --change <id> --text "<assumption>"',
  "attestation-conflict": `nothing to record: the fitness evidence already recorded stands; ${NEXT}`,
  "candidate-unchanged": "fix the code the review blocked on, then ospec review correct --change <id>",
  "change-closed": 'a closed change takes no more records: open a new one with ospec record intent --change <new-id> --kind <kind> --summary "<what>" --acceptance "<observable result>"',
  "change-mismatch": RESTORE_STATE,
  "change-open": { byDesign: "only ospec close archives a change, after closing it; no agent input reaches it" },
  "cite-outside-plan": "add the cited file to the plan with ospec signals --change <id> --path <file>, or cite a file of the plan or the diff",
  "cite-unresolved": "cite path:line of a file inside the project, from the documentation or the code that settles the category, or ask it as an --open-fact",
  "close-refused": "settle what the message lists, run ospec check --change <id>, then ospec close --change <id> again",
  "config-invalid": "fix idd/config.yaml as the message says (JSON text, valid YAML 1.2), keeping its other keys, then run the command again",
  "evidence-conflict": { byDesign: CLI_ONLY },
  "evidence-id-required": { byDesign: CLI_ONLY },
  "evidence-kind-mismatch": { byDesign: CLI_ONLY },
  "evidence-required": 'ospec record fitness --change <id> (--adr <adr> | --quality <scenario>) --evidence "<what you checked by hand>"',
  "evidence-stale": "run ospec check --change <id> on the current tree, then ospec close --change <id>",
  "evidence-time-required": { byDesign: CLI_ONLY },
  "facts-undeclared":
    'declare the open facts with one --open-fact "<question>" each, or --no-open-facts --basis "<what settles every behavior>"; a feature covers each category with an --open-fact <category>:<question>, a --cite or a --quote',
  "gate-answer-required": `add the user's answer: ${ANSWER}, or --source user-unverified for a relayed one`,
  "gate-conflict": `nothing to record: the gate keeps the answer it has; ${NEXT}`,
  "gate-managed-by-check": `ospec check --change <id> opens checks-changed; once open, resolve it with ospec record gate --change <id> --gate checks-changed --resolve ${ANSWER}`,
  "gate-managed-by-intent": `ospec record intent opens these gates: --ambiguous --request for ambiguous-intent, --open-fact for open-facts; resolve open-facts with ospec record gate --change <id> --gate open-facts --resolve ${ANSWER}`,
  "gate-managed-by-review": `ospec check --change <id> opens review-limit once the trust reviews are used up; resolve it then with ospec record gate --change <id> --gate review-limit --resolve ${ANSWER}`,
  "gate-not-open": `only an open gate is resolved: ${NEXT}; open adr-amend-or-contradict or irreversible-operation yourself with ospec record gate --change <id> --gate <gate> --open --reason "<why>"`,
  "gate-resolved": 'the user already answered adr-amend-or-contradict for this change: take this amendment to a new change with ospec record intent --change <new-id>',
  "git-not-found": "install git and put it on PATH, then run the command again",
  "impact-config-invalid": "fix the impact: section of idd/config.yaml as the message says, keeping its other keys",
  "impact-conflict": "nothing to record: the declared impact stands; an amended or superseded ADR names its new ADR once, with --record",
  "impact-required": `add --impact <${IMPACTS.join("|")}> --reason "<why>", or --record <new ADR> once the impact amends or supersedes`,
  "intent-conflict": "record intent again with the same --summary, --acceptance and --request, or open a new change for another one; only a raised --kind changes it",
  "intent-incomplete": `pass --kind <${INTENT_KINDS.join("|")}>, --summary "<what>" and --acceptance "<observable result>"; an ambiguous intent keeps --request "<request>"`,
  "invalid-action": "pass --open or --resolve",
  "invalid-base": { byDesign: "the CLI records the base of a change from git; no agent input reaches it" },
  "invalid-change-id": "use a kebab-case id: lowercase letters and digits joined by single hyphens, such as fix-login",
  "invalid-impact": `use one of ${IMPACTS.join(", ")}`,
  "invalid-plan": "--work-units takes a positive integer",
  "invalid-record": "--record names the new ADR's .md file under docs/architecture/decisions/, and only for an ADR the change amends or supersedes",
  "invalid-reference": "name one reference: --adr <adr> or --quality <scenario>",
  "invalid-source": "use --source user for an answer the user gave in this session, or user-unverified for a relayed one",
  "kind-mismatch": 'raise the kind with ospec record intent --change <id> --kind <kind> and the same --summary and --acceptance',
  "knowledge-map-unreadable": "fix docs/architecture/knowledge-map.yaml so it is JSON text (valid YAML 1.2)",
  "lock-lost": "another CLI process took over the lock of idd/<id>/state.yaml while this command ran, so nothing was written: run the command again",
  "map-invalid": "fix the knowledge map as the message says; ospec foundation next --profile <profile> --json returns its template",
  "map-missing": "pass --map <path> to an existing knowledge map, or start one with ospec foundation next --profile <profile> --json",
  "map-unreadable": "fix the knowledge map so it is JSON text (valid YAML 1.2)",
  "not-a-git-repo": "IDD works only inside a git work tree: set up the project's repository with git init -b main, then open the change again",
  "not-manual-fitness": "a fitness function with a Check: line runs in ospec check --change <id>; --evidence is only for one without it",
  "obligation-satisfied": `nothing to do: the obligation is satisfied; ${NEXT}`,
  "obligation-withdrawn": `nothing to prove: the obligation is withdrawn; ${NEXT}`,
  "open-facts-open": `ask the open facts first and resolve them with ospec record gate --change <id> --gate open-facts --resolve ${ANSWER}; then record the intent again`,
  "profile-mismatch": "drop --profile, or pass the profile the knowledge map declares",
  "profile-required": "pass the profile the first time: ospec foundation next --profile <profile> --json",
  "reason-required": 'pass --reason "<why>"',
  "reference-not-declared": "declare it first: ospec signals --change <id> --adr <adr> or --quality <scenario>",
  "retract-answer-refused": "the user's answer retracts only persistent-data that the content of the diff alone derives: keep the signal and satisfy its obligation",
  "retract-conflict": `nothing to record: the signal stays retracted with its first reason; ${NEXT}`,
  "review-current": `nothing to review: the trust review of this candidate is approved; ${NEXT}`,
  "review-limit": "the trust reviews are used up: ospec check --change <id> opens review-limit, and only the user's answer grants one more",
  "review-refused": "fix what the message names and run the same ospec review command again, passing the reviewer's JSON unchanged",
  "roadmap-invalid": "fix the roadmap at the line the message names, or pass --roadmap <path>",
  "roadmap-missing": "pass --roadmap <path> to read another roadmap",
  "roadmap-unrecognized": "give the roadmap a phase table whose rows start with '<ID>. <title>', or pass --roadmap <path>",
  "signal-confirmed-by-diff": "the diff confirms the signal: satisfy the obligation it derives, or change the diff",
  "signal-not-recorded": "retract only a signal the change has: ospec signals --change <id> --json lists them",
  "signal-not-retractable": 'satisfy the obligation it derives, or withdraw that obligation with ospec record withdraw --change <id> --obligation <obligation> --reason "<why>" once no active signal derives it',
  "snapshot-invalid": "shorten or fix the roadmap text the message names, or pass --roadmap <path>",
  "snapshot-limit": "pass --roadmap <path> to a roadmap within the limit the message names",
  "state-changed": "run ospec close --change <id> again",
  "state-invalid": `ospec foundation record takes --state confirmed, assumed, n/a or deferred; for an IDD change, ${RESTORE_STATE}`,
  "state-unreadable": RESTORE_STATE,
  "team-invalid": "fix team: in idd/config.yaml: size solo, small or multi-team; experience junior, mixed or senior",
  "unknown-base": "pass --base a commit or ref that exists, such as main or HEAD~1",
  "unknown-change": 'list the changes with ospec status, or open one with ospec record intent --change <id> --kind <kind> --summary "<what>" --acceptance "<observable result>"',
  "unknown-gate": `use one of ${GATES.join(", ")}`,
  "unknown-obligation": "ospec next --change <id> --json lists the change's obligations; ospec signals --change <id> --path <file> derives the missing ones",
  "unknown-profile": "pass a profile of the foundation catalog to ospec foundation next --profile <profile>",
  "unknown-reference": "declare an ADR under docs/architecture/decisions/ or a quality scenario of docs/architecture/knowledge-map.yaml",
  "unknown-signal": `use one of ${SIGNALS.map((signal) => signal.id).join(", ")}`,
  "unknown-slot": "record a slot of the knowledge map; ospec foundation next --json names the slots of the round",
  usage: "ospec --help lists every command",
  "withdraw-conflict": `nothing to record: the obligation stays withdrawn with its first reason; ${NEXT}`,
  "withdraw-refused": 'an active signal still derives the obligation: satisfy it, or retract an overstated signal with ospec record retract --change <id> --signal <signal> --reason "<why>"',
});

function refusalHow(code, { change } = {}) {
  const entry = REFUSALS[code];
  if (typeof entry !== "string") return null;
  return change ? entry.replaceAll("<id>", change) : entry;
}

module.exports = { REFUSALS, refusalHow };
