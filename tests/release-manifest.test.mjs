import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { repositoryPath, repositoryRoot } from "./helpers/repository.mjs";

const execFileAsync = promisify(execFile);
const manifestRelativePath = join("release", "skills-manifest.json");
const expectedSkillNames = [
  "binlee-clinic-operations",
  "binlee-compliance-risk",
  "binlee-consumer-decision",
  "binlee-doctor-ip",
  "binlee-help",
  "binlee-med-aesthetics-strategy",
  "binlee-public-communication",
  "binlee-source-library",
];

const hashJson = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function runManifest(repository, argumentsList) {
  try {
    const result = await execFileAsync(
      process.execPath,
      [
        join(repository, "scripts", "build-release-manifest.mjs"),
        ...argumentsList,
      ],
      { cwd: repository, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message,
    };
  }
}

async function createManifestFixture(context) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "binlee-release-manifest-"));
  context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  await cp(repositoryPath("package.json"), join(fixtureRoot, "package.json"));
  await cp(repositoryPath("scripts"), join(fixtureRoot, "scripts"), {
    recursive: true,
  });
  await cp(repositoryPath("skills"), join(fixtureRoot, "skills"), {
    recursive: true,
  });
  await mkdir(join(fixtureRoot, "release"));
  return fixtureRoot;
}

test("write mode produces deterministic output", async (context) => {
  // Given an isolated copy of the canonical package and skills
  const fixtureRoot = await createManifestFixture(context);

  // When write mode runs twice
  const firstRun = await runManifest(fixtureRoot, ["--write"]);
  assert.equal(firstRun.code, 0, firstRun.stderr);
  const firstOutput = await readFile(
    join(fixtureRoot, manifestRelativePath),
    "utf8",
  );
  const secondRun = await runManifest(fixtureRoot, ["--write"]);
  assert.equal(secondRun.code, 0, secondRun.stderr);
  const secondOutput = await readFile(
    join(fixtureRoot, manifestRelativePath),
    "utf8",
  );

  // Then the serialized manifest is byte-for-byte stable
  assert.equal(secondOutput, firstOutput);
  assert.ok(firstOutput.endsWith("\n"));
});

test("check mode rejects stale content without rewriting it", async (context) => {
  // Given a generated manifest whose package version later changes
  const fixtureRoot = await createManifestFixture(context);
  const writeRun = await runManifest(fixtureRoot, ["--write"]);
  assert.equal(writeRun.code, 0, writeRun.stderr);
  const manifestPath = join(fixtureRoot, manifestRelativePath);
  const before = await readFile(manifestPath, "utf8");
  const packagePath = join(fixtureRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  await writeFile(
    packagePath,
    `${JSON.stringify({ ...packageJson, version: "9.9.9" }, null, 2)}\n`,
  );

  // When read-only check mode detects the mismatch
  const checkRun = await runManifest(fixtureRoot, ["--check"]);

  // Then it fails and leaves the existing artifact untouched
  assert.equal(checkRun.code, 1);
  assert.match(checkRun.stderr, /Release manifest is stale/);
  assert.equal(await readFile(manifestPath, "utf8"), before);
});

test("check mode accepts the current committed manifest without writing", async () => {
  // Given the committed release manifest
  const manifestPath = repositoryPath(manifestRelativePath);
  const before = await readFile(manifestPath, "utf8");

  // When read-only check mode compares it with canonical skills
  const run = await runManifest(repositoryRoot, ["--check"]);

  // Then equality succeeds and file content is unchanged
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await readFile(manifestPath, "utf8"), before);
});

test("manifest aligns with package version and covers every canonical skill", async () => {
  // Given the package metadata and release manifest
  const packageJson = JSON.parse(
    await readFile(repositoryPath("package.json"), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(repositoryPath(manifestRelativePath), "utf8"),
  );

  // When release identity and skill entries are inspected
  const skillNames = manifest.skills.map((skill) => skill.name);

  // Then version, schema, repository, coverage, and digest are complete
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.version, "1.1.0");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.releaseVersion, packageJson.version);
  assert.equal(
    manifest.repository,
    "https://github.com/sooogooo/binlee-skill-july-2026",
  );
  assert.deepEqual(skillNames, expectedSkillNames);
  const { digest, ...unsignedManifest } = manifest;
  assert.equal(digest, hashJson(unsignedManifest));
});

test("manifest file records use normalized paths, counts, and hashes", async () => {
  // Given the serialized release manifest
  const text = await readFile(repositoryPath(manifestRelativePath), "utf8");
  const manifest = JSON.parse(text);

  // When every generated skill snapshot is inspected
  for (const skill of manifest.skills) {
    const paths = Object.keys(skill.files);
    assert.equal(skill.fileCount, paths.length, skill.name);
    assert.deepEqual(
      paths,
      [...paths].sort((left, right) => left.localeCompare(right, "en")),
    );
    assert.ok(paths.includes("SKILL.md"), skill.name);
    for (const [path, descriptor] of Object.entries(skill.files)) {
      assert.doesNotMatch(path, /\\|^\/|(?:^|\/)\.\.(?:\/|$)/);
      assert.match(descriptor.sha256, /^[a-f0-9]{64}$/);
      assert.ok(["text", "binary"].includes(descriptor.kind));
    }
  }

  // Then no local machine path leaks into the portable artifact
  assert.doesNotMatch(text, /[A-Za-z]:\\|\/(?:Users|home)\//);
});

test("CLI rejects absent, mixed, and unknown modes", async () => {
  // Given invocations that do not select exactly one supported mode
  const invocations = [[], ["--write", "--check"], ["--unknown"]];

  // When each invocation reaches the CLI boundary
  const runs = await Promise.all(
    invocations.map((argumentsList) =>
      runManifest(repositoryRoot, argumentsList),
    ),
  );

  // Then all invalid mode combinations fail with usage guidance
  for (const run of runs) {
    assert.equal(run.code, 1);
    assert.match(run.stderr, /Usage:.*--write\|--check/s);
  }
});
