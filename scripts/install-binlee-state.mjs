import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { InstallerError } from "./install-binlee-output.mjs";

export const stateSchemaVersion = 1;
export const hashContent = (content) => createHash("sha256").update(content).digest("hex");

export async function readReleaseVersion(repositoryRoot) {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("package.json must contain a release version.");
  }
  return packageJson.version;
}

export async function readInstallState(stateFile) {
  const stats = await lstat(stateFile).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stats) return null;
  if (stats.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${stateFile}`);
  if (!stats.isFile()) throw new Error(`Installer state is not a file: ${stateFile}`);

  let state;
  try {
    state = JSON.parse(await readFile(stateFile, "utf8"));
  } catch (cause) {
    throw new InstallerError("INVALID_INSTALL_STATE", "Invalid installer state.", { cause });
  }
  validateState(state);
  return state;
}

export async function snapshotDirectory(root) {
  const stats = await lstat(root).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stats) return null;
  if (stats.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${root}`);
  if (!stats.isDirectory()) throw new Error(`Skill target is not a directory: ${root}`);

  const files = {};
  await walkDirectory(root, root, files);
  return files;
}

export async function assertDirectoryIsSafe(path) {
  const stats = await lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stats) return;
  if (stats.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${path}`);
  if (!stats.isDirectory()) throw new Error(`Expected a directory: ${path}`);
}

export function classifySkill(canonicalFiles, targetFiles, installedSkill, releaseVersion) {
  if (targetFiles === null) return "missing";
  if (!installedSkill) return snapshotsEqual(canonicalFiles, targetFiles) ? "adoptable" : "conflict";
  if (!snapshotsEqual(targetFiles, installedSkill.files)) return "conflict";
  return snapshotsEqual(canonicalFiles, installedSkill.files)
    && installedSkill.releaseVersion === releaseVersion
    ? "current"
    : "upgradeable";
}

export function snapshotsEqual(left, right) {
  if (!left || !right) return left === right;
  const leftEntries = Object.entries(left).sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath, "en"));
  const rightEntries = Object.entries(right).sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath, "en"));
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([path, descriptor], index) => {
    const [rightPath, rightDescriptor] = rightEntries[index] ?? [];
    return path === rightPath
      && descriptor.kind === rightDescriptor?.kind
      && descriptor.sha256 === rightDescriptor?.sha256;
  });
}

export function buildNextState(currentState, options) {
  const skills = { ...(currentState?.skills ?? {}) };
  for (const skill of options.skills) {
    skills[skill.name] = {
      releaseVersion: options.releaseVersion,
      files: skill.canonicalFiles,
    };
  }
  return {
    schemaVersion: stateSchemaVersion,
    releaseVersion: options.releaseVersion,
    selectedSkills: options.selectedSkills,
    skills,
    transactions: [...(currentState?.transactions ?? []), options.transaction],
  };
}

export const serializeState = (state) => `${JSON.stringify(state, null, 2)}\n`;

export function parseInstallerOptions(argumentsList, usage) {
  if (argumentsList.length === 0 || argumentsList.includes("--help")) return { help: true };
  const values = {};
  const actions = [];
  let rollbackId;
  let force = false;
  let json = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (["--cli", "--scope", "--skill"].includes(argument)) {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}.`);
      values[argument.slice(2)] = value;
      index += 1;
    } else if (["--check", "--apply", "--dry-run"].includes(argument)) {
      actions.push(argument.slice(2));
    } else if (argument === "--rollback") {
      actions.push("rollback");
      const value = argumentsList[index + 1];
      if (value && !value.startsWith("--")) {
        rollbackId = value;
        index += 1;
      }
    } else if (argument === "--force") force = true;
    else if (argument === "--json") json = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (new Set(actions).size > 1) throw new Error("Installer actions are mutually exclusive.");
  let action = actions[0] === "dry-run" ? "preview" : actions[0] ?? "apply";
  if (force && ["check", "preview"].includes(action)) throw new Error("Installer actions are mutually exclusive.");
  if (force && action !== "rollback") action = "force";
  if (values.skill && !isSkillName(values.skill)) throw new Error("--skill must be a lowercase hyphenated skill name.");
  if (!values.cli || !values.scope) throw new Error(`${usage}\nUnknown or missing --cli/--scope.`);
  return {
    action,
    cli: values.cli,
    scope: values.scope,
    selectedSkill: values.skill,
    rollbackId,
    force,
    json,
    legacy: actions.length === 0 && !force,
  };
}

export function isSkillName(name) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

async function walkDirectory(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${path}`);
    if (entry.isDirectory()) {
      await walkDirectory(root, path, files);
      continue;
    }
    if (!entry.isFile()) throw new Error(`Unsupported filesystem entry: ${path}`);
    files[normalizePath(relative(root, path))] = hashFile(await readFile(path));
  }
}

function hashFile(bytes) {
  let text;
  if (!bytes.includes(0)) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) text = undefined;
    } catch {
      text = undefined;
    }
  }
  const kind = text === undefined ? "binary" : "text";
  const content = kind === "text" ? text.replaceAll("\r\n", "\n") : bytes;
  return { kind, sha256: createHash("sha256").update(content).digest("hex") };
}

function normalizePath(path) {
  return sep === "/" ? path : path.split(sep).join("/");
}

function validateState(state) {
  const valid = state?.schemaVersion === stateSchemaVersion
    && typeof state.releaseVersion === "string"
    && Array.isArray(state.selectedSkills)
    && state.skills !== null
    && typeof state.skills === "object"
    && !Array.isArray(state.skills)
    && Array.isArray(state.transactions);
  if (!valid) throw invalidState();
  if (!state.selectedSkills.every(isSkillName)) throw invalidState();
  for (const [name, skill] of Object.entries(state.skills)) {
    if (!isSkillName(name)
      || typeof skill?.releaseVersion !== "string"
      || skill.files === null
      || typeof skill.files !== "object"
      || Array.isArray(skill.files)) {
      throw invalidState();
    }
    validateSnapshot(skill.files);
  }
  for (const transaction of state.transactions) {
    const validTransaction = typeof transaction?.id === "string"
      && /^[0-9]+-[0-9a-f-]{36}$/.test(transaction.id)
      && ["apply", "force"].includes(transaction.action)
      && Array.isArray(transaction.selectedSkills)
      && transaction.selectedSkills.every(isSkillName)
      && Array.isArray(transaction.skillNames)
      && transaction.skillNames.every(isSkillName)
      && Array.isArray(transaction.changedSkills)
      && transaction.changedSkills.every((name) => transaction.skillNames.includes(name))
      && transaction.backupDirectory === `backups/${transaction.id}`;
    if (!validTransaction) throw invalidState();
  }
}

function validateSnapshot(files) {
  for (const [path, descriptor] of Object.entries(files)) {
    const safePath = path.length > 0 && !path.startsWith("/") && !path.includes("\\")
      && !path.split("/").includes("..");
    const validDescriptor = ["text", "binary"].includes(descriptor?.kind)
      && /^[a-f0-9]{64}$/.test(descriptor.sha256 ?? "");
    if (!safePath || !validDescriptor) throw invalidState();
  }
}

function invalidState() {
  return new InstallerError("INVALID_INSTALL_STATE", "Invalid installer state.");
}
