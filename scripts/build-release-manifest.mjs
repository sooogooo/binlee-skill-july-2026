#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hashContent,
  isSkillName,
  readReleaseVersion,
  snapshotDirectory,
} from "./install-binlee-state.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(repositoryRoot, "skills");
const manifestPath = join(repositoryRoot, "release", "skills-manifest.json");
const repository = "https://github.com/sooogooo/binlee-skill-july-2026";
const usage =
  "Usage: node scripts/build-release-manifest.mjs <--write|--check>";

try {
  const mode = parseMode(process.argv.slice(2));
  const manifest = await buildManifest();
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

  if (mode === "--write") {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, serialized);
    process.stdout.write(
      `Wrote release/skills-manifest.json (${manifest.digest}).\n`,
    );
  } else {
    const committed = await readFile(manifestPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (
      committed === null ||
      committed.replaceAll("\r\n", "\n") !== serialized
    ) {
      throw new Error(
        "Release manifest is stale. Run npm run release:manifest.",
      );
    }
    process.stdout.write(`Release manifest is current (${manifest.digest}).\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

function parseMode(argumentsList) {
  if (
    argumentsList.length !== 1 ||
    !["--write", "--check"].includes(argumentsList[0])
  ) {
    throw new Error(usage);
  }
  return argumentsList[0];
}

async function buildManifest() {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const symbolicSkill = entries.find(
    (entry) => entry.isSymbolicLink() && isSkillName(entry.name),
  );
  if (symbolicSkill)
    throw new Error(
      `Symbolic links are not supported: skills/${symbolicSkill.name}`,
    );

  const skillNames = entries
    .filter((entry) => entry.isDirectory() && isSkillName(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
  const skills = [];
  for (const name of skillNames) {
    const snapshot = await snapshotDirectory(join(skillsRoot, name));
    if (!snapshot?.["SKILL.md"]) throw new Error(`Missing SKILL.md: ${name}`);
    const files = Object.fromEntries(
      Object.entries(snapshot).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    );
    skills.push({ name, fileCount: Object.keys(files).length, files });
  }

  const unsignedManifest = {
    schemaVersion: 1,
    releaseVersion: await readReleaseVersion(repositoryRoot),
    repository,
    skills,
  };
  return {
    ...unsignedManifest,
    digest: hashContent(JSON.stringify(unsignedManifest)),
  };
}
