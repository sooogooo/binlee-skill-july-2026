import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { repositoryPath, runNode } from "../tests/helpers/repository.mjs";

const installer = repositoryPath("scripts", "install-binlee.mjs");

test("installs the source library with a dependent application skill", async (context) => {
  // Given a clean project directory
  const projectDirectory = await mkdtemp(join(tmpdir(), "binlee-dependency-test-"));
  context.after(() => rm(projectDirectory, { recursive: true, force: true }));

  // When one corpus-dependent skill is installed
  await runNode(
    [installer, "--cli", "codex", "--scope", "project", "--skill", "binlee-consumer-decision"],
    { cwd: projectDirectory },
  );

  // Then its source-library dependency is installed alongside it
  await access(join(projectDirectory, ".agents", "skills", "binlee-source-library", "SKILL.md"));
});
