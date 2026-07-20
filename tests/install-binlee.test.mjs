import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { repositoryPath, runNode } from "./helpers/repository.mjs";

const installer = repositoryPath("scripts", "install-binlee.mjs");

const createProjectDirectory = async (context, prefix) => {
  const projectDirectory = await mkdtemp(join(tmpdir(), prefix));
  context.after(() => rm(projectDirectory, { recursive: true, force: true }));
  return projectDirectory;
};

const assertInstallerFailure = async (installerRun, expectedMessage) => {
  await assert.rejects(installerRun, (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, "");
    assert.match(error.stderr, expectedMessage);
    return true;
  });
};

test("installs a selected standalone skill into an isolated project", async (context) => {
  // Given a clean project directory
  const projectDirectory = await mkdtemp(join(tmpdir(), "binlee-install-test-"));
  context.after(() => rm(projectDirectory, { recursive: true, force: true }));

  // When the installer is asked for one standalone Codex project skill
  const { stdout } = await runNode(
    [installer, "--cli", "codex", "--scope", "project", "--skill", "binlee-help"],
    { cwd: projectDirectory },
  );

  // Then it reports and installs the selected entry point
  assert.match(stdout, /Installed 1 skill\(s\) for codex \(project\)\./);
  await access(join(projectDirectory, ".agents", "skills", "binlee-help", "SKILL.md"));
});

test("previews a full installation without writing files", async (context) => {
  // Given a clean project directory
  const projectDirectory = await mkdtemp(join(tmpdir(), "binlee-dry-run-test-"));
  context.after(() => rm(projectDirectory, { recursive: true, force: true }));

  // When the installer runs in preview mode
  const { stdout } = await runNode(
    [installer, "--cli", "claude", "--scope", "project", "--dry-run"],
    { cwd: projectDirectory },
  );

  // Then it reports all skills and leaves the target untouched
  assert.match(stdout, /Plan 8 skill\(s\) for claude \(project\)\./);
  await assert.rejects(access(join(projectDirectory, ".claude")));
});

test("rejects unknown options without installation side effects", async (context) => {
  for (const unknownArguments of [["--target", "requested-target"], ["--unexpected-option"]]) {
    await context.test(unknownArguments[0], async (subtest) => {
      // Given a clean project directory and a path that must remain untouched
      const projectDirectory = await createProjectDirectory(subtest, "binlee-unknown-option-test-");
      const requestedTarget = join(projectDirectory, unknownArguments[1] ?? "unused-target");
      const argumentsList = [
        installer,
        "--cli",
        "codex",
        "--scope",
        "project",
        "--skill",
        "binlee-help",
        unknownArguments[0],
        ...(unknownArguments[1] ? [requestedTarget] : []),
      ];

      // When the installer receives an option outside its documented contract
      const installerRun = runNode(argumentsList, { cwd: projectDirectory });

      // Then it fails loudly before writing to cwd or the supplied path
      await assertInstallerFailure(installerRun, new RegExp(`Unknown option: ${unknownArguments[0]}`));
      await assert.rejects(access(join(projectDirectory, ".agents")));
      await assert.rejects(access(requestedTarget));
    });
  }
});

test("rejects a missing skill value without installation side effects", async (context) => {
  // Given a clean project directory
  const projectDirectory = await createProjectDirectory(context, "binlee-missing-skill-test-");

  // When --skill has no value
  const installerRun = runNode(
    [installer, "--cli", "codex", "--scope", "project", "--skill"],
    { cwd: projectDirectory },
  );

  // Then it fails before installing the default full set
  await assertInstallerFailure(installerRun, /Missing value for --skill\./);
  await assert.rejects(access(join(projectDirectory, ".agents")));
});
