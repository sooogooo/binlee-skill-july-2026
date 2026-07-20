import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { repositoryPath, runNode } from "./helpers/repository.mjs";

const installer = repositoryPath("scripts", "install-binlee.mjs");

test("installs a selected skill into an isolated project", async (context) => {
  // Given a clean project directory
  const projectDirectory = await mkdtemp(join(tmpdir(), "binlee-install-test-"));
  context.after(() => rm(projectDirectory, { recursive: true, force: true }));

  // When the installer is asked for one Codex project skill
  const { stdout } = await runNode(
    [installer, "--cli", "codex", "--scope", "project", "--skill", "binlee-consumer-decision"],
    { cwd: projectDirectory },
  );

  // Then it reports and installs the selected entry point
  assert.match(stdout, /Installed 1 skill\(s\) for codex \(project\)\./);
  await access(join(projectDirectory, ".agents", "skills", "binlee-consumer-decision", "SKILL.md"));
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
