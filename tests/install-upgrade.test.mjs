import assert from "node:assert/strict";
import {
  access,
  cp,
  mkdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createInstallerFixture,
  readJson,
  runInstaller,
  selectedHelpArguments,
} from "./helpers/installer-fixture.mjs";

const skillName = "binlee-help";

const parseOutput = (run) => JSON.parse(run.stdout);

const targetSkill = (fixture) => join(fixture.destinationSkills, skillName);

const sourceSkill = (fixture) => join(fixture.sourceSkills, skillName);

test("check reports a missing target without writing", async (context) => {
  // Given a clean project target
  const fixture = await createInstallerFixture(context);

  // When check evaluates the selected skill
  const run = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);

  // Then it reports pending work and leaves the project untouched
  assert.equal(run.code, 2);
  assert.equal(parseOutput(run).skills[0].status, "missing");
  await assert.rejects(access(join(fixture.project, ".agents")));
});

test("apply adopts an identical unmanaged target and records normalized state", async (context) => {
  // Given a canonical target copied without installer state
  const fixture = await createInstallerFixture(context);
  await mkdir(fixture.destinationSkills, { recursive: true });
  await cp(sourceSkill(fixture), targetSkill(fixture), { recursive: true });

  // When check and apply run in sequence
  const check = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);
  await assert.rejects(access(fixture.stateFile));
  const apply = await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  const current = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);

  // Then adoption is explicit and the resulting target is current
  assert.equal(check.code, 2);
  assert.equal(parseOutput(check).skills[0].status, "adoptable");
  assert.equal(apply.code, 0);
  assert.equal(current.code, 0);
  assert.equal(parseOutput(current).skills[0].status, "current");
  const state = await readJson(fixture.stateFile);
  const fixturePackage = await readJson(join(fixture.repository, "package.json"));
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.releaseVersion, fixturePackage.version);
  assert.deepEqual(state.selectedSkills, [skillName]);
  assert.match(state.skills[skillName].files["SKILL.md"].sha256, /^[a-f0-9]{64}$/);
  assert.equal(state.skills[skillName].files["SKILL.md"].kind, "text");
  assert.equal(state.transactions.at(-1).id, parseOutput(apply).transactionId);
});

test("trusted state makes a changed canonical skill upgradeable", async (context) => {
  // Given an installed skill whose canonical source later changes
  const fixture = await createInstallerFixture(context);
  assert.equal((await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments])).code, 0);
  const sourcePath = join(sourceSkill(fixture), "SKILL.md");
  await writeFile(sourcePath, `${await readFile(sourcePath, "utf8")}\ncanonical-v2\n`);

  // When the changed source is checked and applied
  const check = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);
  const apply = await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);

  // Then the trusted old target upgrades to the new canonical content
  assert.equal(check.code, 2);
  assert.equal(parseOutput(check).skills[0].status, "upgradeable");
  assert.equal(apply.code, 0);
  assert.equal(await readFile(join(targetSkill(fixture), "SKILL.md"), "utf8"), await readFile(sourcePath, "utf8"));
});

test("safe apply rejects a local edit without changing target or state", async (context) => {
  // Given a managed target with a local edit
  const fixture = await createInstallerFixture(context);
  await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  const targetPath = join(targetSkill(fixture), "SKILL.md");
  await writeFile(targetPath, `${await readFile(targetPath, "utf8")}\nlocal-edit\n`);
  const stateBefore = await readFile(fixture.stateFile, "utf8");

  // When check and safe apply evaluate the conflict
  const check = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);
  const apply = await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  const legacyApply = await runInstaller(fixture, selectedHelpArguments);

  // Then both report conflict and apply performs zero writes
  assert.equal(check.code, 3);
  assert.equal(parseOutput(check).skills[0].status, "conflict");
  assert.equal(apply.code, 3);
  assert.equal(legacyApply.code, 3);
  assert.match(legacyApply.stdout, /Installation blocked by conflicts\./);
  assert.doesNotMatch(legacyApply.stdout, /Installed 1 skill/);
  assert.match(await readFile(targetPath, "utf8"), /local-edit/);
  assert.equal(await readFile(fixture.stateFile, "utf8"), stateBefore);
});

test("force replaces a conflicted directory and rollback restores its full backup", async (context) => {
  // Given a conflicted managed directory containing an unknown local file
  const fixture = await createInstallerFixture(context);
  await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  const targetPath = join(targetSkill(fixture), "SKILL.md");
  const sourcePath = join(sourceSkill(fixture), "SKILL.md");
  await writeFile(targetPath, `${await readFile(targetPath, "utf8")}\nlocal-edit\n`);
  await writeFile(join(targetSkill(fixture), "local-notes.txt"), "preserve through rollback");
  await writeFile(sourcePath, `${await readFile(sourcePath, "utf8")}\ncanonical-v2\n`);

  // When force applies canonical content and the transaction is rolled back
  const force = await runInstaller(fixture, ["--force", "--json", ...selectedHelpArguments]);
  assert.equal(force.code, 0);
  assert.equal(await readFile(targetPath, "utf8"), await readFile(sourcePath, "utf8"));
  await assert.rejects(access(join(targetSkill(fixture), "local-notes.txt")));
  const rollback = await runInstaller(fixture, [
    "--rollback", parseOutput(force).transactionId,
    "--json",
    ...selectedHelpArguments,
  ]);

  // Then the exact pre-force directory and previous state return
  assert.equal(rollback.code, 0);
  assert.match(await readFile(targetPath, "utf8"), /local-edit/);
  assert.equal(await readFile(join(targetSkill(fixture), "local-notes.txt"), "utf8"), "preserve through rollback");
  assert.equal((await readJson(fixture.stateFile)).transactions.length, 1);
});

test("rollback rejects post-install edits unless forced", async (context) => {
  // Given a completed upgrade followed by another local edit
  const fixture = await createInstallerFixture(context);
  await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  const sourcePath = join(sourceSkill(fixture), "SKILL.md");
  const targetPath = join(targetSkill(fixture), "SKILL.md");
  const original = await readFile(sourcePath, "utf8");
  await writeFile(sourcePath, `${original}\ncanonical-v2\n`);
  await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  await writeFile(targetPath, `${await readFile(targetPath, "utf8")}\nafter-install-edit\n`);
  const stateBefore = await readFile(fixture.stateFile, "utf8");

  // When ordinary rollback and forced rollback run
  const blocked = await runInstaller(fixture, ["--rollback", "--json", ...selectedHelpArguments]);
  assert.equal(blocked.code, 3);
  assert.match(await readFile(targetPath, "utf8"), /after-install-edit/);
  assert.equal(await readFile(fixture.stateFile, "utf8"), stateBefore);
  const forced = await runInstaller(fixture, ["--rollback", "--force", "--json", ...selectedHelpArguments]);

  // Then only the explicit force restores the previous transaction state
  assert.equal(forced.code, 0);
  assert.equal(await readFile(targetPath, "utf8"), original);
});

test("fresh rollback removes only installed skills and preserves unrelated data", async (context) => {
  // Given an unrelated skill beside a fresh Binlee installation
  const fixture = await createInstallerFixture(context);
  const unrelated = join(fixture.destinationSkills, "third-party-skill", "SKILL.md");
  await mkdir(join(fixture.destinationSkills, "third-party-skill"), { recursive: true });
  await writeFile(unrelated, "third-party-data");
  const apply = await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);

  // When the fresh-install transaction is rolled back
  const rollback = await runInstaller(fixture, ["--rollback", "--json", ...selectedHelpArguments]);

  // Then the new Binlee directory is removed while unrelated data survives
  assert.equal(apply.code, 0);
  assert.equal(rollback.code, 0);
  await assert.rejects(access(targetSkill(fixture)));
  assert.equal(await readFile(unrelated, "utf8"), "third-party-data");
  await assert.rejects(access(fixture.stateFile));
});

test("source and target symbolic links are rejected", async (context) => {
  for (const location of ["source", "target"]) {
    await context.test(location, async (subtest) => {
      // Given a skill tree containing a symbolic link
      const fixture = await createInstallerFixture(subtest);
      const root = location === "source" ? sourceSkill(fixture) : targetSkill(fixture);
      if (location === "target") {
        await mkdir(fixture.destinationSkills, { recursive: true });
        await cp(sourceSkill(fixture), root, { recursive: true });
      }
      const realDirectory = join(root, "real-directory");
      await mkdir(realDirectory);
      await writeFile(join(realDirectory, "value.txt"), "real");
      await symlink(realDirectory, join(root, "linked-directory"), "junction");

      // When check scans the tree
      const run = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);

      // Then it fails as a source or IO error without writing state
      assert.equal(run.code, 1);
      assert.match(run.stderr, /symbolic link/i);
      await assert.rejects(access(fixture.stateFile));
    });
  }
});

test("a mid-commit failure restores the prior target and state", async (context) => {
  // Given a trusted installation and a newer canonical source
  const fixture = await createInstallerFixture(context);
  await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  const sourcePath = join(sourceSkill(fixture), "SKILL.md");
  const targetPath = join(targetSkill(fixture), "SKILL.md");
  const targetBefore = await readFile(targetPath, "utf8");
  const stateBefore = await readFile(fixture.stateFile, "utf8");
  await writeFile(sourcePath, `${await readFile(sourcePath, "utf8")}\ncanonical-v2\n`);

  // When failure is injected after backup but before the staged skill is installed
  const run = await runInstaller(
    fixture,
    ["--apply", "--json", ...selectedHelpArguments],
    { env: { BINLEE_INSTALL_TEST_FAIL_AT: "1" } },
  );

  // Then the old target and state are restored and no journal remains
  assert.equal(run.code, 1);
  assert.equal(await readFile(targetPath, "utf8"), targetBefore);
  assert.equal(await readFile(fixture.stateFile, "utf8"), stateBefore);
  await assert.rejects(access(join(fixture.stateRoot, "journal.json")));
});

test("text line endings normalize while binary bytes remain exact", async (context) => {
  // Given a managed skill containing text and binary files
  const fixture = await createInstallerFixture(context);
  const sourceText = join(sourceSkill(fixture), "SKILL.md");
  const sourceBinary = join(sourceSkill(fixture), "asset.bin");
  await writeFile(sourceBinary, Buffer.from([1, 13, 10, 65]));
  await runInstaller(fixture, ["--apply", "--json", ...selectedHelpArguments]);
  const targetText = join(targetSkill(fixture), "SKILL.md");
  const normalizedText = (await readFile(targetText, "utf8")).replaceAll("\r\n", "\n");
  await writeFile(targetText, normalizedText.replaceAll("\n", "\r\n"));

  // When equivalent text and changed binary content are checked
  const equivalentText = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);
  assert.equal(equivalentText.code, 0);
  await writeFile(join(targetSkill(fixture), "asset.bin"), Buffer.from([1, 10, 65]));
  const changedBinary = await runInstaller(fixture, ["--check", "--json", ...selectedHelpArguments]);

  // Then line endings remain current but binary byte changes conflict
  assert.equal(changedBinary.code, 3);
  assert.equal(parseOutput(changedBinary).skills[0].status, "conflict");
});

test("legacy preview and action validation keep their exit contracts", async (context) => {
  // Given a clean target
  const fixture = await createInstallerFixture(context);

  // When legacy preview and incompatible actions are requested
  const preview = await runInstaller(fixture, ["--dry-run", "--json", ...selectedHelpArguments]);
  const invalid = await runInstaller(fixture, ["--check", "--apply", "--json", ...selectedHelpArguments]);

  // Then preview exits zero without writes and mixed actions fail
  assert.equal(preview.code, 0);
  assert.equal(parseOutput(preview).action, "preview");
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /mutually exclusive/i);
  await assert.rejects(access(join(fixture.project, ".agents")));
});
