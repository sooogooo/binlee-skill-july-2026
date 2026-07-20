#!/usr/bin/env node

import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

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

const resolveSkillDependencies = (requestedSkillNames) => {
  const resolvedSkillNames = [];
  const visitedSkillNames = new Set();

  const visit = (skillName) => {
    if (visitedSkillNames.has(skillName)) {
      return;
    }
    visitedSkillNames.add(skillName);
    for (const dependency of skillDependencies.get(skillName) ?? []) {
      visit(dependency);
    }
    resolvedSkillNames.push(skillName);
  };

  for (const skillName of requestedSkillNames) {
    visit(skillName);
  }
  return resolvedSkillNames;
};

const usage = `Usage:
  node scripts/install-binlee.mjs --cli <codex|claude|gemini|opencode> --scope <user|project> [--skill <name>] [--dry-run]

Examples:
  node scripts/install-binlee.mjs --cli codex --scope user
  node scripts/install-binlee.mjs --cli claude --scope project --skill binlee-consumer-decision
`;

const argumentsList = process.argv.slice(2);
const valueOptions = new Set(["--cli", "--scope", "--skill"]);
const booleanOptions = new Set(["--dry-run", "--help"]);
for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (valueOptions.has(argument)) {
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) {
      process.stderr.write(`Missing value for ${argument}.\n`);
      process.exit(1);
    }
    index += 1;
    continue;
  }
  if (booleanOptions.has(argument)) {
    continue;
  }
  process.stderr.write(`Unknown option: ${argument}\n`);
  process.exit(1);
}

const getFlag = (name) => {
  const index = argumentsList.indexOf(name);
  return index === -1 ? undefined : argumentsList[index + 1];
};

if (argumentsList.includes("--help") || argumentsList.length === 0) {
  process.stdout.write(usage);
  process.exit(0);
}

const cli = getFlag("--cli");
const scope = getFlag("--scope");
const selectedSkill = getFlag("--skill");
const dryRun = argumentsList.includes("--dry-run");

const cliDirectories = {
  codex: {
    user: join(homedir(), ".agents", "skills"),
    project: join(process.cwd(), ".agents", "skills"),
  },
  claude: {
    user: join(homedir(), ".claude", "skills"),
    project: join(process.cwd(), ".claude", "skills"),
  },
  gemini: {
    user: join(homedir(), ".gemini", "skills"),
    project: join(process.cwd(), ".gemini", "skills"),
  },
  opencode: {
    user: join(homedir(), ".config", "opencode", "skills"),
    project: join(process.cwd(), ".opencode", "skills"),
  },
};

if (!cliDirectories[cli] || !cliDirectories[cli][scope]) {
  process.stderr.write(`${usage}\nUnknown or missing --cli/--scope.\n`);
  process.exit(1);
}

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
if (selectedSkill && !skillNamePattern.test(selectedSkill)) {
  process.stderr.write("--skill must be a lowercase hyphenated skill name.\n");
  process.exit(1);
}

const directoryEntries = await readdir(sourceRoot, { withFileTypes: true });
const skillNames = selectedSkill
  ? resolveSkillDependencies([selectedSkill])
  : directoryEntries.filter((entry) => entry.isDirectory() && skillNamePattern.test(entry.name)).map((entry) => entry.name).sort();

if (skillNames.length === 0) {
  process.stderr.write("No skill directories found under skills/.\n");
  process.exit(1);
}

const destinationRoot = cliDirectories[cli][scope];
for (const skillName of skillNames) {
  const source = join(sourceRoot, skillName);
  const destination = join(destinationRoot, skillName);
  const sourceEntries = await readdir(source, { withFileTypes: true }).catch(() => null);
  if (!sourceEntries || !sourceEntries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
    process.stderr.write(`Missing SKILL.md: ${skillName}\n`);
    process.exit(1);
  }
  process.stdout.write(`${dryRun ? "Would install" : "Installing"} ${skillName} -> ${destination}\n`);
  if (!dryRun) {
    await mkdir(destinationRoot, { recursive: true });
    await cp(source, destination, { recursive: true, force: true });
  }
}

process.stdout.write(`${dryRun ? "Plan" : "Installed"} ${skillNames.length} skill(s) for ${cli} (${scope}).\n`);
