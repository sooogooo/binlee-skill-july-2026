import assert from "node:assert/strict";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { repositoryPath, runNode } from "./helpers/repository.mjs";

const installer = repositoryPath("scripts", "install-binlee.mjs");
const sourceLibrary = "binlee-source-library";
const businessSkillNames = [
  "binlee-clinic-operations",
  "binlee-compliance-risk",
  "binlee-consumer-decision",
  "binlee-doctor-ip",
  "binlee-med-aesthetics-strategy",
  "binlee-public-communication",
];
const expectedAllSkillNames = [
  "binlee-clinic-operations",
  "binlee-compliance-risk",
  "binlee-consumer-decision",
  "binlee-doctor-ip",
  "binlee-help",
  "binlee-med-aesthetics-strategy",
  "binlee-public-communication",
  sourceLibrary,
];

const createProjectDirectory = async (context, prefix) => {
  const projectDirectory = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(projectDirectory, { recursive: true, force: true }));
  return projectDirectory;
};

const reportedSkillNames = (stdout, action) => [...stdout.matchAll(new RegExp(`^${action} ([a-z0-9-]+) ->`, "gm"))]
  .map((match) => match[1]);

const installedSkillNames = (projectDirectory) => readdir(join(projectDirectory, ".agents", "skills"));

test("installs the source library with a dependent application skill", async (context) => {
  // Given a clean project directory
  const projectDirectory = await createProjectDirectory(context, "binlee-dependency-test-");

  // When one corpus-dependent skill is installed
  const { stdout } = await runNode(
    [installer, "--cli", "codex", "--scope", "project", "--skill", "binlee-consumer-decision"],
    { cwd: projectDirectory },
  );

  // Then its source-library dependency is installed first and reported once
  assert.deepEqual(reportedSkillNames(stdout, "Installing"), [sourceLibrary, "binlee-consumer-decision"]);
  assert.match(stdout, /Installed 2 skill\(s\) for codex \(project\)\./);
  await access(join(projectDirectory, ".agents", "skills", "binlee-source-library", "SKILL.md"));
  await access(join(projectDirectory, ".agents", "skills", "binlee-consumer-decision", "SKILL.md"));
});

test("installs the source library with every business skill", async (context) => {
  for (const skillName of businessSkillNames) {
    await context.test(skillName, async (subtest) => {
      // Given a clean project directory
      const projectDirectory = await createProjectDirectory(subtest, "binlee-business-skill-test-");

      // When one business skill is installed
      const { stdout } = await runNode(
        [installer, "--cli", "codex", "--scope", "project", "--skill", skillName],
        { cwd: projectDirectory },
      );

      // Then the dependency closure contains exactly the source library and requested skill
      assert.deepEqual(reportedSkillNames(stdout, "Installing"), [sourceLibrary, skillName]);
      assert.deepEqual((await installedSkillNames(projectDirectory)).sort(), [sourceLibrary, skillName].sort());
    });
  }
});

test("previews a dependent installation without writing files", async (context) => {
  // Given a clean project directory
  const projectDirectory = await createProjectDirectory(context, "binlee-dependency-preview-test-");

  // When a dependent skill installation is previewed
  const { stdout } = await runNode(
    [installer, "--cli", "codex", "--scope", "project", "--skill", "binlee-consumer-decision", "--dry-run"],
    { cwd: projectDirectory },
  );

  // Then both planned skills are reported in stable order and nothing is written
  assert.deepEqual(reportedSkillNames(stdout, "Would install"), [sourceLibrary, "binlee-consumer-decision"]);
  assert.match(stdout, /Plan 2 skill\(s\) for codex \(project\)\./);
  await assert.rejects(access(join(projectDirectory, ".agents")));
});

test("installs standalone skills without unrelated dependencies", async (context) => {
  for (const skillName of ["binlee-help", sourceLibrary]) {
    await context.test(skillName, async (subtest) => {
      // Given a clean project directory
      const projectDirectory = await createProjectDirectory(subtest, "binlee-standalone-skill-test-");

      // When a standalone skill is installed
      const { stdout } = await runNode(
        [installer, "--cli", "codex", "--scope", "project", "--skill", skillName],
        { cwd: projectDirectory },
      );

      // Then only the requested skill is installed
      assert.deepEqual(reportedSkillNames(stdout, "Installing"), [skillName]);
      assert.match(stdout, /Installed 1 skill\(s\) for codex \(project\)\./);
      assert.deepEqual(await installedSkillNames(projectDirectory), [skillName]);
    });
  }
});

test("keeps the full installation at eight unique skills", async (context) => {
  // Given a clean project directory
  const projectDirectory = await createProjectDirectory(context, "binlee-full-install-test-");

  // When all skills are installed
  const { stdout } = await runNode(
    [installer, "--cli", "codex", "--scope", "project"],
    { cwd: projectDirectory },
  );

  // Then the existing eight-skill surface is preserved without duplicates
  assert.deepEqual(reportedSkillNames(stdout, "Installing"), expectedAllSkillNames);
  assert.match(stdout, /Installed 8 skill\(s\) for codex \(project\)\./);
  assert.deepEqual((await installedSkillNames(projectDirectory)).sort(), expectedAllSkillNames);
});

test("repeated dependent installation is idempotent", async (context) => {
  // Given a project where a dependent business skill is already installed
  const projectDirectory = await createProjectDirectory(context, "binlee-idempotent-install-test-");
  const argumentsList = [
    installer,
    "--cli",
    "codex",
    "--scope",
    "project",
    "--skill",
    "binlee-consumer-decision",
  ];
  await runNode(argumentsList, { cwd: projectDirectory });

  // When the same installation is repeated
  const { stdout } = await runNode(argumentsList, { cwd: projectDirectory });

  // Then it succeeds with the same unique dependency closure
  assert.deepEqual(reportedSkillNames(stdout, "Installing"), [sourceLibrary, "binlee-consumer-decision"]);
  assert.match(stdout, /Installed 2 skill\(s\) for codex \(project\)\./);
  assert.deepEqual(
    (await installedSkillNames(projectDirectory)).sort(),
    [sourceLibrary, "binlee-consumer-decision"].sort(),
  );
});
