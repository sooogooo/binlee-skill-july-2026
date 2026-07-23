import assert from "node:assert/strict";
import {
  access,
  mkdir,
  readFile,
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
import {
  applyJournal,
  applySelected,
  latestTransaction,
  parseOutput,
  readSkillText,
  skillName,
  sourceSkill,
  targetSkill,
  writeJournal,
} from "./helpers/installer-security-fixture.mjs";

const firstId = "1700000000000-11111111-1111-4111-8111-111111111111";
const secondId = "1700000000001-22222222-2222-4222-8222-222222222222";

test("malformed committed apply journal fails closed and retains its backup", async (context) => {
  const fixture = await createInstallerFixture(context);
  const targetFile = join(targetSkill(fixture), "SKILL.md");
  const backupMarker = join(fixture.stateRoot, "backups", firstId, "keep.txt");
  await mkdir(targetSkill(fixture), { recursive: true });
  await mkdir(join(fixture.stateRoot, "backups", firstId), { recursive: true });
  await writeFile(targetFile, "local-target");
  await writeFile(backupMarker, "retained-backup");
  await writeJournal(fixture, applyJournal(firstId, { phase: "committed", retainRecovery: false }));

  const run = await applySelected(fixture);

  assert.equal(run.code, 1);
  assert.equal(await readFile(targetFile, "utf8"), "local-target");
  assert.equal(await readFile(backupMarker, "utf8"), "retained-backup");
  await access(join(fixture.stateRoot, "journal.json"));
});

test("pending journal paths must belong to one transaction and fail closed on mismatch", async (context) => {
  const fixture = await createInstallerFixture(context);
  const targetFile = join(targetSkill(fixture), "SKILL.md");
  const mismatchedBackup = join(fixture.stateRoot, "backups", secondId);
  const stage = join(fixture.stateRoot, `stage-${firstId}`);
  await mkdir(targetSkill(fixture), { recursive: true });
  await mkdir(join(mismatchedBackup, "skills", skillName), { recursive: true });
  await mkdir(stage, { recursive: true });
  await writeFile(targetFile, "local-target");
  await writeFile(join(mismatchedBackup, "skills", skillName, "SKILL.md"), "wrong-backup");
  await writeFile(join(stage, "keep.txt"), "stage-marker");
  await writeJournal(fixture, applyJournal(firstId, { recoveryDirectory: `backups/${secondId}` }));

  const run = await applySelected(fixture);

  assert.equal(run.code, 1);
  assert.equal(await readFile(targetFile, "utf8"), "local-target");
  assert.equal(await readFile(join(mismatchedBackup, "skills", skillName, "SKILL.md"), "utf8"), "wrong-backup");
  assert.equal(await readFile(join(stage, "keep.txt"), "utf8"), "stage-marker");
});

test("journal traversal paths are rejected without deleting outside data", async (context) => {
  const fixture = await createInstallerFixture(context);
  const outside = join(fixture.root, "outside-backup");
  const marker = join(outside, "keep.txt");
  await mkdir(outside, { recursive: true });
  await writeFile(marker, "outside-data");
  await writeJournal(fixture, applyJournal(firstId, { recoveryDirectory: "../outside-backup" }));

  const run = await applySelected(fixture);

  assert.equal(run.code, 1);
  assert.equal(await readFile(marker, "utf8"), "outside-data");
  await access(join(fixture.stateRoot, "journal.json"));
});

test("recovery of a committed apply removes metadata but keeps rollback backup", async (context) => {
  const fixture = await createInstallerFixture(context);
  const apply = await applySelected(fixture);
  const transactionId = parseOutput(apply).transactionId;
  const transactionFile = join(fixture.stateRoot, "backups", transactionId, "transaction.json");
  const stage = join(fixture.stateRoot, `stage-${transactionId}`);
  await mkdir(stage, { recursive: true });
  await writeFile(join(stage, "stale.txt"), "staging");
  await writeJournal(fixture, applyJournal(transactionId, {
    phase: "committed",
    stateExisted: false,
    skills: [{ name: skillName, existed: false }],
  }));

  const recovery = await applySelected(fixture);

  assert.equal(recovery.code, 0);
  await access(transactionFile);
  await assert.rejects(access(stage));
  await assert.rejects(access(join(fixture.stateRoot, "journal.json")));
});

test("interrupted apply journal restores first, then safely reapplies canonical content", async (context) => {
  const fixture = await createInstallerFixture(context);
  await applySelected(fixture);
  const sourceFile = join(sourceSkill(fixture), "SKILL.md");
  await writeFile(sourceFile, `${await readFile(sourceFile, "utf8")}\ncanonical-v2\n`);
  const secondApply = await applySelected(fixture);
  const interruptedId = parseOutput(secondApply).transactionId;
  const stage = join(fixture.stateRoot, `stage-${interruptedId}`);
  await writeFile(join(targetSkill(fixture), "SKILL.md"), "partial-write");
  await mkdir(stage, { recursive: true });
  await writeFile(join(stage, "stale.txt"), "staging");
  await writeJournal(fixture, applyJournal(interruptedId));

  const recovered = await applySelected(fixture);
  const state = await readJson(fixture.stateFile);

  assert.equal(recovered.code, 0);
  assert.equal(await readSkillText(fixture), await readFile(sourceFile, "utf8"));
  assert.equal(state.transactions.length, 2);
  assert.notEqual((await latestTransaction(fixture)).id, interruptedId);
  await assert.rejects(access(join(fixture.stateRoot, "backups", interruptedId)));
  await assert.rejects(access(stage));
  await assert.rejects(access(join(fixture.stateRoot, "journal.json")));
});

test("rollback rejects an explicit older transaction id by LIFO order", async (context) => {
  const fixture = await createInstallerFixture(context);
  const firstApply = await applySelected(fixture);
  const firstTransactionId = parseOutput(firstApply).transactionId;
  const sourceFile = join(sourceSkill(fixture), "SKILL.md");
  await writeFile(sourceFile, `${await readFile(sourceFile, "utf8")}\ncanonical-v2\n`);
  const secondApply = await applySelected(fixture);
  const stateBefore = await readFile(fixture.stateFile, "utf8");
  const targetBefore = await readSkillText(fixture);

  const rollback = await runInstaller(fixture, [
    "--rollback", firstTransactionId,
    "--json",
    ...selectedHelpArguments,
  ]);

  assert.equal(secondApply.code, 0);
  assert.equal(rollback.code, 1);
  assert.match(rollback.stderr, /latest successful transaction/i);
  assert.equal(await readFile(fixture.stateFile, "utf8"), stateBefore);
  assert.equal(await readSkillText(fixture), targetBefore);
});
