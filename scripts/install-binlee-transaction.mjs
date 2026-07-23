import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  journalExists,
  journalPathFor,
  readJournal,
  readJsonFile,
  resolveJournalDirectories,
  resolveTransactionBackup,
  writeJournal,
} from "./install-binlee-journal.mjs";
import { InstallerError } from "./install-binlee-output.mjs";
import { isSkillName, serializeState } from "./install-binlee-state.mjs";

export const createTransactionId = () => `${Date.now()}-${randomUUID()}`;

export async function assertNoPendingTransaction(stateRoot) {
  if (await journalExists(stateRoot)) {
    throw new Error("A pending installer transaction requires recovery before check can run.");
  }
}

export async function recoverPendingTransaction(stateRoot, destinationRoot, stateFile) {
  if (!await journalExists(stateRoot)) return false;
  const journal = await readJournal(stateRoot);
  if (journal.phase === "committed") {
    await cleanupCommitted(stateRoot, journal);
    return true;
  }
  await restoreRecovery(stateRoot, destinationRoot, stateFile, journal);
  await cleanupInterrupted(stateRoot, journal);
  return true;
}

export async function commitInstallTransaction(options) {
  const stageName = `stage-${options.transaction.id}`;
  const backupName = `backups/${options.transaction.id}`;
  const stageRoot = join(options.stateRoot, stageName);
  const backupRoot = join(options.stateRoot, backupName);
  const changedSkills = options.skills.filter((skill) => skill.replace);
  const journal = buildJournal("apply", stageName, backupName, options, changedSkills, true);

  try {
    await prepareApply(stageRoot, backupRoot, changedSkills, options);
    await writeJournal(options.stateRoot, journal);
  } catch (cause) {
    const cleanupError = await captureFailure(() => removeAll([
      { path: stageRoot, recursive: true },
      { path: backupRoot, recursive: true },
    ]));
    throw combinedError("Unable to prepare install transaction.", cause, cleanupError);
  }

  try {
    let installIndex = 0;
    for (const skill of changedSkills) {
      await rm(skill.destination, { recursive: true, force: true });
      installIndex += 1;
      if (options.failAt === installIndex) throw new Error(`Injected install failure at ${installIndex}.`);
      await mkdir(dirname(skill.destination), { recursive: true });
      await rename(join(stageRoot, "skills", skill.name), skill.destination);
    }
    await replaceFile(options.stateFile, join(stageRoot, "state.json"));
    await writeJournal(options.stateRoot, { ...journal, phase: "committed" });
  } catch (cause) {
    await throwAfterRecovery("Install transaction failed and was restored.", cause, options, journal);
  }
  await cleanupCommitted(options.stateRoot, journal);
}

export async function readTransactionManifest(stateRoot, transaction) {
  const backupRoot = resolveTransactionBackup(stateRoot, transaction);
  const manifest = await readJsonFile(join(backupRoot, "transaction.json"), {
    code: "INVALID_ROLLBACK_TRANSACTION",
    message: "Invalid rollback transaction.",
    singleLink: true,
  });
  const aligned = manifest?.schemaVersion === 1
    && manifest.id === transaction.id
    && Array.isArray(manifest.skillNames)
    && Array.isArray(manifest.changedSkills)
    && JSON.stringify(manifest.skillNames) === JSON.stringify(transaction.skillNames)
    && JSON.stringify(manifest.changedSkills) === JSON.stringify(transaction.changedSkills)
    && manifest.changedSkills.every(isSkillName)
    && manifest.skillNames.every(isSkillName);
  if (!aligned) {
    throw new InstallerError("INVALID_ROLLBACK_TRANSACTION", "Invalid rollback transaction.");
  }
  return manifest;
}

export async function rollbackInstallTransaction(options) {
  const recoveryName = `rollback-${options.transaction.id}-${randomUUID()}`;
  const recoveryRoot = join(options.stateRoot, recoveryName);
  const changedSkills = options.manifest.changedSkills.map((name) => ({
    name,
    destination: join(options.destinationRoot, name),
    targetFiles: options.currentSnapshots[name] ?? null,
  }));
  const journal = buildJournal("rollback", null, recoveryName, options, changedSkills, false);

  try {
    await mkdir(join(recoveryRoot, "skills"), { recursive: true });
    for (const skill of changedSkills) {
      if (skill.targetFiles !== null) {
        await cp(skill.destination, join(recoveryRoot, "skills", skill.name), { recursive: true });
      }
    }
    await writeFile(join(recoveryRoot, "state.before.json"), options.currentStateText);
    await writeJournal(options.stateRoot, journal);
  } catch (cause) {
    const cleanupError = await captureFailure(() => removeAll([{ path: recoveryRoot, recursive: true }]));
    throw combinedError("Unable to prepare rollback transaction.", cause, cleanupError);
  }

  try {
    await restoreApplyBackup(options, changedSkills);
    await writeJournal(options.stateRoot, { ...journal, phase: "committed" });
  } catch (cause) {
    await throwAfterRecovery("Rollback failed and current state was restored.", cause, options, journal);
  }
  await cleanupCommitted(options.stateRoot, journal);
}

async function prepareApply(stageRoot, backupRoot, changedSkills, options) {
  await mkdir(join(stageRoot, "skills"), { recursive: true });
  await mkdir(join(backupRoot, "skills"), { recursive: true });
  for (const skill of changedSkills) {
    await cp(skill.source, join(stageRoot, "skills", skill.name), { recursive: true });
    if (skill.targetFiles !== null) {
      await cp(skill.destination, join(backupRoot, "skills", skill.name), { recursive: true });
    }
  }
  if (options.currentStateText !== null) {
    await writeFile(join(backupRoot, "state.before.json"), options.currentStateText);
  }
  await writeFile(join(backupRoot, "transaction.json"), `${JSON.stringify(options.manifest, null, 2)}\n`);
  await writeFile(join(stageRoot, "state.json"), serializeState(options.nextState));
}

function buildJournal(operation, stageDirectory, recoveryDirectory, options, skills, retainRecovery) {
  return {
    schemaVersion: 1,
    transactionId: options.transaction.id,
    operation,
    phase: "committing",
    stageDirectory,
    recoveryDirectory,
    retainRecovery,
    stateExisted: options.currentStateText !== null,
    skills: skills.map((skill) => ({ name: skill.name, existed: skill.targetFiles !== null })),
  };
}

async function restoreApplyBackup(options, changedSkills) {
  const backupRoot = resolveTransactionBackup(options.stateRoot, options.transaction);
  const errors = [];
  for (const skill of changedSkills) {
    const removed = await attempt(() => rm(skill.destination, { recursive: true, force: true }), errors);
    if (removed && options.manifest.beforeSkills[skill.name]) {
      await attempt(() => cp(join(backupRoot, "skills", skill.name), skill.destination, { recursive: true }), errors);
    }
  }
  if (options.manifest.beforeStateExisted) {
    await attempt(() => replaceFile(options.stateFile, join(backupRoot, "state.before.json"), true), errors);
  } else {
    await attempt(() => rm(options.stateFile, { force: true }), errors);
  }
  throwCollected(errors, "Unable to restore rollback source transaction.");
}

async function restoreRecovery(stateRoot, destinationRoot, stateFile, journal) {
  const { recoveryRoot } = resolveJournalDirectories(stateRoot, journal);
  const errors = [];
  for (const skill of [...journal.skills].reverse()) {
    const destination = join(destinationRoot, skill.name);
    const removed = await attempt(() => rm(destination, { recursive: true, force: true }), errors);
    if (removed && skill.existed) {
      await attempt(() => cp(join(recoveryRoot, "skills", skill.name), destination, { recursive: true }), errors);
    }
  }
  if (journal.stateExisted) {
    await attempt(() => replaceFile(stateFile, join(recoveryRoot, "state.before.json"), true), errors);
  } else {
    await attempt(() => rm(stateFile, { force: true }), errors);
  }
  throwCollected(errors, "Unable to restore interrupted installer transaction.");
}

async function throwAfterRecovery(message, cause, options, journal) {
  const recoveryError = await captureFailure(() => restoreRecovery(
    options.stateRoot,
    options.destinationRoot,
    options.stateFile,
    journal,
  ));
  const cleanupError = recoveryError
    ? null
    : await captureFailure(() => cleanupInterrupted(options.stateRoot, journal));
  throw combinedError(message, cause, recoveryError, cleanupError);
}

async function cleanupCommitted(stateRoot, journal) {
  const { stageRoot, recoveryRoot } = resolveJournalDirectories(stateRoot, journal);
  const paths = [];
  if (stageRoot) paths.push({ path: stageRoot, recursive: true });
  if (!journal.retainRecovery) paths.push({ path: recoveryRoot, recursive: true });
  paths.push({ path: journalPathFor(stateRoot), recursive: false });
  await removeAll(paths);
}

async function cleanupInterrupted(stateRoot, journal) {
  const { stageRoot, recoveryRoot } = resolveJournalDirectories(stateRoot, journal);
  const paths = [];
  if (stageRoot) paths.push({ path: stageRoot, recursive: true });
  paths.push({ path: recoveryRoot, recursive: true });
  paths.push({ path: journalPathFor(stateRoot), recursive: false });
  await removeAll(paths);
}

async function replaceFile(destination, source, copy = false) {
  await mkdir(dirname(destination), { recursive: true });
  await rm(destination, { force: true });
  if (copy) await cp(source, destination);
  else await rename(source, destination);
}

async function removeAll(entries) {
  const errors = [];
  for (const entry of entries) {
    await attempt(() => rm(entry.path, { recursive: entry.recursive, force: true }), errors);
  }
  throwCollected(errors, "Unable to clean installer transaction metadata.");
}

async function attempt(operation, errors) {
  try {
    await operation();
    return true;
  } catch (error) {
    errors.push(error);
    return false;
  }
}

async function captureFailure(operation) {
  const errors = [];
  await attempt(operation, errors);
  return errors[0] ?? null;
}

function throwCollected(errors, message) {
  if (errors.length > 0) throw new AggregateError(errors, message);
}

function combinedError(message, ...errors) {
  return new Error(message, { cause: new AggregateError(errors.filter(Boolean)) });
}
