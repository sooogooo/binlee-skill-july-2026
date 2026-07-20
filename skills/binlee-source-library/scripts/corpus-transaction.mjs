import { createHash, randomUUID } from "node:crypto";
import { access, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const JOURNAL_NAME = ".corpus-transaction.json";

export class CorpusTransactionError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "CorpusTransactionError";
    this.code = code;
  }
}

export function corpusArtifactPaths(referenceDir) {
  return {
    articles: join(referenceDir, "articles.json"),
    index: join(referenceDir, "article-index.jsonl"),
    manifest: join(referenceDir, "manifest.json"),
  };
}

export async function commitCorpusArtifacts(artifacts, paths, options = {}) {
  validateCorpusArtifacts(artifacts);
  const targetDirectory = validateTargetPaths(paths);
  await recoverCorpusTransaction(paths);
  const stagingDirectory = await mkdtemp(join(targetDirectory, ".corpus-stage-"));
  const transactionId = randomUUID();
  const entries = [
    { key: "articles", target: paths.articles, text: artifacts.articlesText },
    { key: "index", target: paths.index, text: artifacts.indexText },
    { key: "manifest", target: paths.manifest, text: artifacts.manifestText },
  ];
  const stagedEntries = entries.map((entry) => ({
    ...entry,
    staged: join(stagingDirectory, basename(entry.target)),
    backup: `${entry.target}.backup-${transactionId}`,
    hadTarget: false,
  }));

  try {
    await Promise.all(stagedEntries.map((entry) => writeDurableFile(entry.staged, entry.text, "w")));
    for (const entry of stagedEntries) entry.hadTarget = await pathExists(entry.target);
    const journalPath = join(targetDirectory, JOURNAL_NAME);
    await writeJournal(journalPath, {
      version: 1,
      pid: process.pid,
      transactionId,
      stagingDirectory: basename(stagingDirectory),
      hadTargets: Object.fromEntries(stagedEntries.map((entry) => [entry.key, entry.hadTarget])),
    });
    await installStagedEntries(stagedEntries, journalPath, options.beforeInstall);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

export async function recoverCorpusTransaction(paths) {
  const targetDirectory = validateTargetPaths(paths);
  const journalPath = join(targetDirectory, JOURNAL_NAME);
  if (!await pathExists(journalPath)) return false;

  let journal;
  try {
    journal = JSON.parse(await readFile(journalPath, "utf8"));
  } catch (cause) {
    throw new CorpusTransactionError("CORPUS_RECOVERY", "Corpus transaction journal is invalid.", cause);
  }
  if (journal.version !== 1 || typeof journal.transactionId !== "string" || typeof journal.hadTargets !== "object") {
    throw new CorpusTransactionError("CORPUS_RECOVERY", "Corpus transaction journal has an unsupported shape.");
  }
  if (journal.pid !== process.pid && processIsAlive(journal.pid)) {
    throw new CorpusTransactionError("CORPUS_BUSY", `Corpus refresh process ${journal.pid} is still active.`);
  }

  const entries = [
    { key: "articles", target: paths.articles },
    { key: "index", target: paths.index },
    { key: "manifest", target: paths.manifest },
  ].map((entry) => ({
    ...entry,
    hadTarget: journal.hadTargets[entry.key] === true,
    backup: `${entry.target}.backup-${journal.transactionId}`,
  }));

  try {
    const installed = [];
    for (const entry of entries) {
      const hasBackup = entry.hadTarget && await pathExists(entry.backup);
      if ((!entry.hadTarget || hasBackup) && await pathExists(entry.target)) installed.push(entry);
    }
    await rollbackEntries(entries, installed);
    if (typeof journal.stagingDirectory === "string" && /^\.corpus-stage-[^/\\]+$/.test(journal.stagingDirectory)) {
      await rm(join(targetDirectory, journal.stagingDirectory), { recursive: true, force: true });
    }
    await rm(journalPath, { force: true });
  } catch (cause) {
    throw new CorpusTransactionError("CORPUS_RECOVERY", "Unable to restore the previous corpus transaction.", cause);
  }
  return true;
}

export function validateCorpusArtifacts(artifacts) {
  let articles;
  let indexRecords;
  let manifest;
  try {
    articles = JSON.parse(artifacts.articlesText);
    indexRecords = artifacts.indexText.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    manifest = JSON.parse(artifacts.manifestText);
  } catch (cause) {
    throw new CorpusTransactionError("CORPUS_ARTIFACT_JSON", "Generated corpus artifacts contain invalid JSON.", cause);
  }

  if (!Array.isArray(articles)) {
    throw new CorpusTransactionError("CORPUS_ARTIFACT_MISMATCH", "Generated articles must be an array.");
  }

  const digest = createHash("sha256").update(artifacts.articlesText).digest("hex");
  const articleIds = articles.map((article) => article.id);
  const indexIds = indexRecords.map((article) => article.id);
  const categoryTotal = Object.values(manifest.categories ?? {}).reduce((total, count) => total + count, 0);
  const aligned = articles.length === indexRecords.length
    && articles.length === manifest.articleCount
    && articles.length === categoryTotal
    && new Set(articleIds).size === articleIds.length
    && articleIds.every((id, index) => id === indexIds[index])
    && digest === manifest.sha256;

  if (!aligned) {
    throw new CorpusTransactionError("CORPUS_ARTIFACT_MISMATCH", "Generated corpus artifacts are not internally aligned.");
  }
}

async function installStagedEntries(entries, journalPath, beforeInstall) {
  const installed = [];
  try {
    for (const entry of entries) {
      if (entry.hadTarget) {
        await rename(entry.target, entry.backup);
      }
    }
    for (const entry of entries) {
      await beforeInstall?.(entry.key);
      await rename(entry.staged, entry.target);
      installed.push(entry);
    }
  } catch (cause) {
    try {
      await rollbackEntries(entries, installed);
      await rm(journalPath, { force: true });
    } catch {
      throw new CorpusTransactionError("CORPUS_RECOVERY", "Corpus commit failed and requires journal recovery.", cause);
    }
    throw new CorpusTransactionError("CORPUS_COMMIT", "Unable to commit the refreshed corpus; previous artifacts were restored.", cause);
  }

  await rm(journalPath, { force: true });
  const cleanupResults = await Promise.allSettled(entries
    .filter((entry) => entry.hadTarget)
    .map((entry) => rm(entry.backup, { force: true })));
  const cleanupFailures = cleanupResults.filter((result) => result.status === "rejected").length;
  if (cleanupFailures > 0) {
    process.emitWarning(
      `${cleanupFailures} stale corpus backup file(s) could not be removed.`,
      { code: "CORPUS_BACKUP_CLEANUP" },
    );
  }
}

async function rollbackEntries(entries, installed) {
  const failures = [];
  for (const entry of installed) {
    try {
      await rm(entry.target, { force: true });
    } catch (error) {
      failures.push(error);
    }
  }
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.hadTarget && await pathExists(entry.backup)) {
        if (await pathExists(entry.target)) await rm(entry.target, { force: true });
        await rename(entry.backup, entry.target);
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "One or more corpus artifacts could not be restored.");
  }
}

async function writeJournal(journalPath, journal) {
  try {
    await writeDurableFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "wx");
  } catch (cause) {
    const code = cause.code === "EEXIST" ? "CORPUS_BUSY" : "CORPUS_COMMIT";
    throw new CorpusTransactionError(code, "Unable to create the corpus transaction journal.", cause);
  }
}

async function writeDurableFile(path, content, flags) {
  const handle = await open(path, flags);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function validateTargetPaths(paths) {
  const targets = [paths.articles, paths.index, paths.manifest];
  if (new Set(targets).size !== targets.length) {
    throw new CorpusTransactionError("CORPUS_PATHS", "Corpus artifact paths must be distinct.");
  }
  const directories = new Set(targets.map((target) => dirname(target)));
  if (directories.size !== 1) {
    throw new CorpusTransactionError("CORPUS_PATHS", "Corpus artifacts must share one directory.");
  }
  return directories.values().next().value;
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
