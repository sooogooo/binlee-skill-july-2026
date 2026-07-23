import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { repositoryPath } from "./repository.mjs";

const execFileAsync = promisify(execFile);

export async function createInstallerFixture(context, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "binlee-upgrade-test-"));
  const repository = join(root, "repository");
  const project = join(root, "project");
  const skillNames = options.skillNames ?? ["binlee-help"];

  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(repository, "skills"), { recursive: true });
  await mkdir(project, { recursive: true });
  await cp(repositoryPath("scripts"), join(repository, "scripts"), { recursive: true });
  await cp(repositoryPath("package.json"), join(repository, "package.json"));
  for (const skillName of skillNames) {
    await cp(repositoryPath("skills", skillName), join(repository, "skills", skillName), { recursive: true });
  }

  const cliRoot = join(project, ".agents");
  return {
    root,
    repository,
    project,
    installer: join(repository, "scripts", "install-binlee.mjs"),
    sourceSkills: join(repository, "skills"),
    destinationSkills: join(cliRoot, "skills"),
    stateRoot: join(cliRoot, ".binlee-install"),
    stateFile: join(cliRoot, ".binlee-install", "state.json"),
  };
}

export async function runInstaller(fixture, argumentsList, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, [fixture.installer, ...argumentsList], {
      cwd: fixture.project,
      encoding: "utf8",
      env: { ...process.env, ...options.env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message,
    };
  }
}

export const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export const selectedHelpArguments = [
  "--cli", "codex",
  "--scope", "project",
  "--skill", "binlee-help",
];
