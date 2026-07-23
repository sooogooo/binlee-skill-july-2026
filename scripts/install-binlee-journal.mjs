import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { InstallerError } from "./install-binlee-output.mjs";
import { isSkillName } from "./install-binlee-state.mjs";

const journalName = "journal.json";
const transactionIdPattern = /^[0-9]+-[0-9a-f-]{36}$/;
const uuidPattern = "[0-9a-f-]{36}";
const journalKeys = [
  "operation",
  "phase",
  "recoveryDirectory",
  "retainRecovery",
  "schemaVersion",
  "skills",
  "stageDirectory",
  "stateExisted",
  "transactionId",
].sort();

export const journalPathFor = (stateRoot) => join(stateRoot, journalName);

export async function journalExists(stateRoot) {
  return Boolean(await lstatOrNull(journalPathFor(stateRoot)));
}

export async function readJournal(stateRoot) {
  const path = journalPathFor(stateRoot);
  const journal = await readJsonFile(path, {
    code: "INVALID_TRANSACTION_JOURNAL",
    message: "Invalid installer transaction journal.",
    singleLink: true,
  });
  validateJournal(journal);
  resolveJournalDirectories(stateRoot, journal);
  return journal;
}

export async function writeJournal(stateRoot, journal) {
  validateJournal(journal);
  resolveJournalDirectories(stateRoot, journal);
  await atomicWriteJson(journalPathFor(stateRoot), journal);
}

export async function readJsonFile(path, options) {
  const stats = await lstatOrInvalid(path, options);
  if (stats.isSymbolicLink() || !stats.isFile() || (options.singleLink && stats.nlink !== 1)) {
    throw new InstallerError(options.code, options.message);
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (cause) {
    throw new InstallerError(options.code, options.message, { cause });
  }
}

export function resolveJournalDirectories(stateRoot, journal) {
  return {
    stageRoot: journal.stageDirectory === null
      ? null
      : resolveOwnedPath(stateRoot, journal.stageDirectory),
    recoveryRoot: resolveOwnedPath(stateRoot, journal.recoveryDirectory),
  };
}

export function resolveTransactionBackup(stateRoot, transaction) {
  const expected = `backups/${transaction.id}`;
  if (transaction.backupDirectory !== expected || !transactionIdPattern.test(transaction.id)) {
    throw new InstallerError("INVALID_ROLLBACK_TRANSACTION", "Invalid rollback transaction.");
  }
  return resolveOwnedPath(stateRoot, expected);
}

async function atomicWriteJson(path, value) {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let handle = null;
  let identity = null;
  let failure = null;
  try {
    handle = await open(temporary, "wx", 0o600);
    identity = await assertPrivateRegularFile(handle, temporary);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await assertPrivateRegularFile(handle, temporary, identity);
    await handle.close();
    handle = null;
    await assertReplaceableJournal(path);
    await rename(temporary, path);
  } catch (cause) {
    failure = cause;
  }
  const closeFailure = handle ? await captureFailure(() => handle.close()) : null;
  const cleanupFailure = failure && identity
    ? await captureFailure(() => cleanupVerifiedTemporary(temporary, identity))
    : null;
  if (failure || closeFailure || cleanupFailure) {
    throw new InstallerError(
      "JOURNAL_WRITE_FAILED",
      "Unable to write installer transaction journal safely.",
      { cause: new AggregateError([failure, closeFailure, cleanupFailure].filter(Boolean)) },
    );
  }
}

async function assertPrivateRegularFile(handle, path, expectedIdentity = null) {
  const pathStats = await lstat(path);
  const handleStats = await handle.stat();
  const identity = { dev: handleStats.dev, ino: handleStats.ino };
  const sameFile = pathStats.dev === identity.dev && pathStats.ino === identity.ino;
  const expected = !expectedIdentity
    || (identity.dev === expectedIdentity.dev && identity.ino === expectedIdentity.ino);
  if (pathStats.isSymbolicLink() || !pathStats.isFile() || !handleStats.isFile()
    || pathStats.nlink !== 1 || handleStats.nlink !== 1 || !sameFile || !expected) {
    throw new InstallerError("UNSAFE_JOURNAL_TEMP", "Unsafe installer journal temporary file.");
  }
  return identity;
}

async function assertReplaceableJournal(path) {
  const stats = await lstatOrNull(path);
  if (!stats) return;
  if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1) {
    throw new InstallerError("UNSAFE_TRANSACTION_JOURNAL", "Unsafe installer transaction journal.");
  }
}

async function cleanupVerifiedTemporary(path, identity) {
  const stats = await lstatOrNull(path);
  if (!stats) return;
  const owned = stats.isFile() && !stats.isSymbolicLink() && stats.nlink === 1
    && stats.dev === identity.dev && stats.ino === identity.ino;
  if (!owned) throw new InstallerError("UNSAFE_JOURNAL_TEMP", "Unsafe installer journal temporary file.");
  await rm(path);
}

function validateJournal(journal) {
  const keys = journal && typeof journal === "object" && !Array.isArray(journal)
    ? Object.keys(journal).sort()
    : [];
  const shared = JSON.stringify(keys) === JSON.stringify(journalKeys)
    && journal.schemaVersion === 1
    && transactionIdPattern.test(journal.transactionId ?? "")
    && ["apply", "rollback"].includes(journal.operation)
    && ["committing", "committed"].includes(journal.phase)
    && Array.isArray(journal.skills)
    && journal.skills.every(validJournalSkill)
    && new Set(journal.skills.map((skill) => skill.name)).size === journal.skills.length
    && typeof journal.stateExisted === "boolean";
  const applyValid = journal?.operation === "apply"
    && journal.stageDirectory === `stage-${journal.transactionId}`
    && journal.recoveryDirectory === `backups/${journal.transactionId}`
    && journal.retainRecovery === true;
  const rollbackPattern = new RegExp(`^rollback-${journal?.transactionId}-${uuidPattern}$`);
  const rollbackValid = journal?.operation === "rollback"
    && journal.stageDirectory === null
    && rollbackPattern.test(journal.recoveryDirectory ?? "")
    && journal.retainRecovery === false;
  if (!shared || (!applyValid && !rollbackValid)) {
    throw new InstallerError("INVALID_TRANSACTION_JOURNAL", "Invalid installer transaction journal.");
  }
}

function validJournalSkill(skill) {
  return skill && Object.keys(skill).sort().join(",") === "existed,name"
    && isSkillName(skill.name) && typeof skill.existed === "boolean";
}

function resolveOwnedPath(stateRoot, relativePath) {
  const root = resolve(stateRoot);
  const path = resolve(root, relativePath);
  const relation = relative(root, path);
  if (!relation || relation.startsWith("..") || isAbsolute(relation)) {
    throw new InstallerError("INVALID_TRANSACTION_JOURNAL", "Invalid installer transaction journal.");
  }
  return path;
}

async function lstatOrInvalid(path, options) {
  try {
    return await lstat(path);
  } catch (cause) {
    throw new InstallerError(options.code, options.message, { cause });
  }
}

async function lstatOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function captureFailure(operation) {
  try {
    await operation();
    return null;
  } catch (error) {
    return error;
  }
}
