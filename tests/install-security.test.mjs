import assert from "node:assert/strict";
import {
  access,
  link,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createInstallerFixture,
  runInstaller,
  selectedHelpArguments,
} from "./helpers/installer-fixture.mjs";
import {
  applySelected,
  parseOutput,
  sourceSkill,
  targetSkill,
} from "./helpers/installer-security-fixture.mjs";

test("journal writes ignore a hardlink planted at the old predictable temporary name", async (context) => {
  const fixture = await createInstallerFixture(context);
  const victim = join(fixture.root, "external-victim.txt");
  const planted = join(fixture.stateRoot, "journal.json.next");
  await mkdir(fixture.stateRoot, { recursive: true });
  await writeFile(victim, "victim-must-not-change");
  await link(victim, planted);
  assert.equal((await stat(victim)).nlink, 2);

  const run = await applySelected(fixture);

  assert.equal(run.code, 0);
  assert.equal(await readFile(victim, "utf8"), "victim-must-not-change");
  assert.equal(await readFile(planted, "utf8"), "victim-must-not-change");
});

test("invalid state JSON emits a typed safe error for JSON and human output", async (context) => {
  const fixture = await createInstallerFixture(context);
  const secret = "STATE_SECRET_MUST_NOT_LEAK";
  await mkdir(fixture.stateRoot, { recursive: true });
  await writeFile(fixture.stateFile, `${secret} is not json`);

  const jsonRun = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);
  const humanRun = await runInstaller(fixture, ["--check", ...selectedHelpArguments]);

  assert.equal(jsonRun.code, 1);
  assert.deepEqual(JSON.parse(jsonRun.stderr), {
    error: { code: "INVALID_INSTALL_STATE", message: "Invalid installer state." },
  });
  assert.equal(humanRun.code, 1);
  assert.equal(humanRun.stderr, "Invalid installer state.\n");
  assert.doesNotMatch(`${jsonRun.stderr}${humanRun.stderr}`, new RegExp(secret));
});

test("invalid journal JSON emits a typed safe error for JSON and human output", async (context) => {
  const fixture = await createInstallerFixture(context);
  const secret = "JOURNAL_SECRET_MUST_NOT_LEAK";
  await mkdir(fixture.stateRoot, { recursive: true });
  await writeFile(join(fixture.stateRoot, "journal.json"), `${secret} is not json`);

  const jsonRun = await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  const humanRun = await runInstaller(fixture, ["--apply", ...selectedHelpArguments]);

  assert.equal(jsonRun.code, 1);
  assert.deepEqual(JSON.parse(jsonRun.stderr), {
    error: { code: "INVALID_TRANSACTION_JOURNAL", message: "Invalid installer transaction journal." },
  });
  assert.equal(humanRun.code, 1);
  assert.equal(humanRun.stderr, "Invalid installer transaction journal.\n");
  assert.doesNotMatch(`${jsonRun.stderr}${humanRun.stderr}`, new RegExp(secret));
});

test("successful force output reports the applied transaction and preflight conflict", async (context) => {
  const fixture = await createInstallerFixture(context);
  await applySelected(fixture);
  const target = join(targetSkill(fixture), "SKILL.md");
  await writeFile(target, `${await readFile(target, "utf8")}\nlocal-edit\n`);

  const humanRun = await runInstaller(fixture, ["--force", ...selectedHelpArguments]);
  await writeFile(target, `${await readFile(target, "utf8")}\nsecond-local-edit\n`);
  const jsonRun = await runInstaller(fixture, ["--force", "--json", ...selectedHelpArguments]);

  assert.equal(humanRun.code, 0);
  assert.match(humanRun.stdout, /Forced 1 skill\(s\) in transaction [0-9]+-[0-9a-f-]{36}\./);
  assert.doesNotMatch(humanRun.stdout, /blocked by conflicts/i);
  assert.equal(jsonRun.code, 0);
  assert.equal(parseOutput(jsonRun).applied, true);
  assert.deepEqual(parseOutput(jsonRun).preflightConflicts, ["binlee-help"]);
  assert.equal(await readFile(target, "utf8"), await readFile(join(sourceSkill(fixture), "SKILL.md"), "utf8"));
});

test("install, force, and rollback preserve an existing skills-lock.json byte for byte", async (context) => {
  const fixture = await createInstallerFixture(context);
  const lockFile = join(fixture.project, ".agents", "skills-lock.json");
  const original = Buffer.from([0, 255, 13, 10, 65, 66, 67]);
  await mkdir(join(fixture.project, ".agents"), { recursive: true });
  await writeFile(lockFile, original);
  const apply = await applySelected(fixture);
  const target = join(targetSkill(fixture), "SKILL.md");
  await writeFile(target, `${await readFile(target, "utf8")}\nlocal-edit\n`);
  const force = await runInstaller(fixture, ["--force", "--json", ...selectedHelpArguments]);
  const rollback = await runInstaller(fixture, ["--rollback", "--force", "--json", ...selectedHelpArguments]);

  assert.equal(apply.code, 0);
  assert.equal(force.code, 0);
  assert.equal(rollback.code, 0);
  assert.deepEqual(await readFile(lockFile), original);
  await access(lockFile);
});
