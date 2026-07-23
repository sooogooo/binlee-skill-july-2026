import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readJson, runInstaller, selectedHelpArguments } from "./installer-fixture.mjs";

export const skillName = "binlee-help";
export const targetSkill = (fixture) => join(fixture.destinationSkills, skillName);
export const sourceSkill = (fixture) => join(fixture.sourceSkills, skillName);
export const parseOutput = (run) => JSON.parse(run.stdout);

export async function applySelected(fixture, extraArguments = []) {
  return runInstaller(fixture, ["--apply", "--json", ...extraArguments, ...selectedHelpArguments]);
}

export async function writeJournal(fixture, journal) {
  await mkdir(fixture.stateRoot, { recursive: true });
  await writeFile(join(fixture.stateRoot, "journal.json"), `${JSON.stringify(journal, null, 2)}\n`);
}

export function applyJournal(transactionId, overrides = {}) {
  return {
    schemaVersion: 1,
    transactionId,
    operation: "apply",
    phase: "committing",
    stageDirectory: `stage-${transactionId}`,
    recoveryDirectory: `backups/${transactionId}`,
    retainRecovery: true,
    stateExisted: true,
    skills: [{ name: skillName, existed: true }],
    ...overrides,
  };
}

export async function readSkillText(fixture) {
  return readFile(join(targetSkill(fixture), "SKILL.md"), "utf8");
}

export async function latestTransaction(fixture) {
  return (await readJson(fixture.stateFile)).transactions.at(-1);
}
