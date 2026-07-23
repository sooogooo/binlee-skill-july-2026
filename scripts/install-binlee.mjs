#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertDirectoryIsSafe,
  buildNextState,
  classifySkill,
  hashContent,
  isSkillName,
  parseInstallerOptions,
  readInstallState,
  readReleaseVersion,
  snapshotDirectory,
  snapshotsEqual,
} from "./install-binlee-state.mjs";
import {
  buildInstallerResult,
  emitInstallerError,
  emitInstallerResult,
  installerCheckExitCode,
} from "./install-binlee-output.mjs";
import {
  assertNoPendingTransaction,
  commitInstallTransaction,
  createTransactionId,
  readTransactionManifest,
  recoverPendingTransaction,
  rollbackInstallTransaction,
} from "./install-binlee-transaction.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "skills");
const sourceLibrary = "binlee-source-library";
const skillDependencies = new Map([
  ["binlee-clinic-operations", [sourceLibrary]],
  ["binlee-compliance-risk", [sourceLibrary]],
  ["binlee-consumer-decision", [sourceLibrary]],
  ["binlee-doctor-ip", [sourceLibrary]],
  ["binlee-med-aesthetics-strategy", [sourceLibrary]],
  ["binlee-public-communication", [sourceLibrary]],
]);
const usage = `Usage:
  node scripts/install-binlee.mjs [--check|--apply|--force|--rollback [transaction-id]] --cli <codex|claude|gemini|opencode> --scope <user|project> [--skill <name>] [--json]
  node scripts/install-binlee.mjs --cli <cli> --scope <scope> [--skill <name>] [--dry-run]
`;

const cliDirectories = {
  codex: { user: join(homedir(), ".agents", "skills"), project: () => join(process.cwd(), ".agents", "skills") },
  claude: { user: join(homedir(), ".claude", "skills"), project: () => join(process.cwd(), ".claude", "skills") },
  gemini: { user: join(homedir(), ".gemini", "skills"), project: () => join(process.cwd(), ".gemini", "skills") },
  opencode: {
    user: join(homedir(), ".config", "opencode", "skills"),
    project: () => join(process.cwd(), ".opencode", "skills"),
  },
};

try {
  await main(process.argv.slice(2));
} catch (error) {
  emitInstallerError(error, process.argv.includes("--json"));
  process.exitCode = 1;
}

async function main(argumentsList) {
  const options = parseInstallerOptions(argumentsList, usage);
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  const destinationRoot = resolveDestination(options.cli, options.scope);
  const cliRoot = dirname(destinationRoot);
  const stateRoot = join(cliRoot, ".binlee-install");
  const stateFile = join(stateRoot, "state.json");
  await Promise.all([
    assertDirectoryIsSafe(cliRoot),
    assertDirectoryIsSafe(destinationRoot),
    assertDirectoryIsSafe(stateRoot),
  ]);
  if (["check", "preview"].includes(options.action)) await assertNoPendingTransaction(stateRoot);
  else await recoverPendingTransaction(stateRoot, destinationRoot, stateFile);
  if (options.action === "rollback") {
    await runRollback(options, { destinationRoot, stateRoot, stateFile });
    return;
  }

  const releaseVersion = await readReleaseVersion(repositoryRoot);
  const skillNames = await resolveSkillNames(options.selectedSkill);
  const selectedSkills = options.selectedSkill ? [options.selectedSkill] : skillNames;
  const currentState = await readInstallState(stateFile);
  const skills = [];
  for (const name of skillNames) {
    const source = join(sourceRoot, name);
    const canonicalFiles = await snapshotDirectory(source);
    if (!canonicalFiles?.["SKILL.md"]) throw new Error(`Missing SKILL.md: ${name}`);
    const destination = join(destinationRoot, name);
    const targetFiles = await snapshotDirectory(destination);
    const status = classifySkill(canonicalFiles, targetFiles, currentState?.skills[name], releaseVersion);
    skills.push({ name, source, destination, canonicalFiles, targetFiles, status });
  }

  const result = buildInstallerResult(options.action, releaseVersion, selectedSkills, skills);
  if (options.action === "check" || options.action === "preview") {
    emitInstallerResult(options, result);
    process.exitCode = options.action === "preview" ? 0 : installerCheckExitCode(skills);
    return;
  }
  if (skills.some((skill) => skill.status === "conflict") && options.action !== "force") {
    emitInstallerResult(options, result);
    process.exitCode = 3;
    return;
  }

  const replaceAll = options.action === "force";
  const transactionSkills = skills.map((skill) => ({
    ...skill,
    replace: replaceAll || ["missing", "upgradeable"].includes(skill.status),
  }));
  const needsTransaction = replaceAll || skills.some((skill) => skill.status !== "current");
  if (needsTransaction) {
    const transaction = createTransaction(options.action, releaseVersion, selectedSkills, transactionSkills);
    const nextState = buildNextState(currentState, {
      releaseVersion,
      selectedSkills,
      skills,
      transaction,
    });
    const currentStateText = currentState ? await readFile(stateFile, "utf8") : null;
    const manifest = createManifest(transaction, transactionSkills, currentStateText);
    await commitInstallTransaction({
      stateRoot,
      stateFile,
      destinationRoot,
      currentStateText,
      nextState,
      transaction,
      manifest,
      skills: transactionSkills,
      failAt: parseFailureInjection(),
    });
    result.applied = true;
    result.transactionId = transaction.id;
  }
  emitInstallerResult(options, result);
}

async function runRollback(options, paths) {
  const currentState = await readInstallState(paths.stateFile);
  const transaction = currentState?.transactions.at(-1);
  if (!transaction) throw new Error("No successful installer transaction is available for rollback.");
  if (options.rollbackId && options.rollbackId !== transaction.id) {
    throw new Error("Only the latest successful transaction can be rolled back.");
  }
  if (options.selectedSkill && !transaction.skillNames.includes(options.selectedSkill)) {
    throw new Error(`Transaction ${transaction.id} does not include ${options.selectedSkill}.`);
  }
  const manifest = await readTransactionManifest(paths.stateRoot, transaction);
  const currentSnapshots = {};
  let conflict = false;
  const previousStatePath = join(paths.stateRoot, transaction.backupDirectory, "state.before.json");
  const previousState = await readInstallState(previousStatePath);
  if ((previousState !== null) !== manifest.beforeStateExisted) {
    throw new Error(`Rollback state backup is invalid for ${transaction.id}.`);
  }
  if (previousState && hashContent(await readFile(previousStatePath, "utf8")) !== manifest.beforeStateSha256) {
    throw new Error(`Rollback state backup is invalid for ${transaction.id}.`);
  }
  for (const name of manifest.changedSkills) {
    const backup = join(paths.stateRoot, transaction.backupDirectory, "skills", name);
    const backupSnapshot = await snapshotDirectory(backup);
    if (!snapshotsEqual(backupSnapshot, manifest.beforeSnapshots[name])) {
      throw new Error(`Rollback backup is invalid for ${name}.`);
    }
  }
  for (const name of manifest.skillNames) {
    currentSnapshots[name] = await snapshotDirectory(join(paths.destinationRoot, name));
    if (!snapshotsEqual(currentSnapshots[name], manifest.afterSkills[name])) conflict = true;
  }
  const result = {
    action: "rollback",
    transactionId: transaction.id,
    applied: false,
    conflict,
    preflightConflicts: conflict ? [...manifest.skillNames] : [],
    skills: manifest.skillNames.map((name) => ({ name, status: conflict ? "conflict" : "rollback" })),
  };
  if (conflict && !options.force) {
    emitInstallerResult(options, result);
    process.exitCode = 3;
    return;
  }
  await rollbackInstallTransaction({
    ...paths,
    transaction,
    manifest,
    currentSnapshots,
    currentStateText: await readFile(paths.stateFile, "utf8"),
  });
  result.applied = true;
  emitInstallerResult(options, result);
}

async function resolveSkillNames(selectedSkill) {
  if (selectedSkill) return resolveSkillDependencies([selectedSkill]);
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const symbolicSkill = entries.find((entry) => entry.isSymbolicLink() && isSkillName(entry.name));
  if (symbolicSkill) throw new Error(`Symbolic links are not supported: ${join(sourceRoot, symbolicSkill.name)}`);
  return entries.filter((entry) => entry.isDirectory() && isSkillName(entry.name)).map((entry) => entry.name).sort();
}

function resolveSkillDependencies(requestedNames) {
  const resolvedNames = [];
  const visitedNames = new Set();
  const visit = (name) => {
    if (visitedNames.has(name)) return;
    visitedNames.add(name);
    for (const dependency of skillDependencies.get(name) ?? []) visit(dependency);
    resolvedNames.push(name);
  };
  for (const name of requestedNames) visit(name);
  return resolvedNames;
}

function createTransaction(action, releaseVersion, selectedSkills, skills) {
  const id = createTransactionId();
  return {
    id,
    action,
    createdAt: new Date().toISOString(),
    releaseVersion,
    selectedSkills,
    skillNames: skills.map((skill) => skill.name),
    changedSkills: skills.filter((skill) => skill.replace).map((skill) => skill.name),
    backupDirectory: `backups/${id}`,
  };
}

function createManifest(transaction, skills, currentStateText) {
  return {
    schemaVersion: 1,
    ...transaction,
    beforeStateExisted: currentStateText !== null,
    beforeStateSha256: currentStateText === null ? null : hashContent(currentStateText),
    beforeSkills: Object.fromEntries(skills.filter((skill) => skill.replace)
      .map((skill) => [skill.name, skill.targetFiles !== null])),
    beforeSnapshots: Object.fromEntries(skills.filter((skill) => skill.replace)
      .map((skill) => [skill.name, skill.targetFiles])),
    afterSkills: Object.fromEntries(skills.map((skill) => [skill.name, skill.canonicalFiles])),
  };
}

function resolveDestination(cli, scope) {
  const destination = cliDirectories[cli]?.[scope];
  if (!destination) throw new Error(`${usage}\nUnknown or missing --cli/--scope.`);
  return typeof destination === "function" ? destination() : destination;
}

function parseFailureInjection() {
  const value = Number.parseInt(process.env.BINLEE_INSTALL_TEST_FAIL_AT ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
