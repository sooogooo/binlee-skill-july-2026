import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildCorpusArtifacts } from "../skills/binlee-source-library/scripts/corpus-artifacts.mjs";
import {
  commitCorpusArtifacts,
  corpusArtifactPaths,
  recoverCorpusTransaction,
} from "../skills/binlee-source-library/scripts/corpus-transaction.mjs";
import {
  articleFixture,
  readArtifacts,
  refreshFixture,
  wrapCorpus,
} from "./helpers/corpus-refresh-fixture.mjs";
import { repositoryPath, runNode } from "./helpers/repository.mjs";

const refreshScript = repositoryPath("skills/binlee-source-library/scripts/refresh-corpus.mjs");
const extractScript = repositoryPath("skills/binlee-source-library/scripts/extract-corpus.mjs");
const normalizeScript = repositoryPath("skills/binlee-source-library/scripts/normalize-corpus.mjs");

test("defaults to check mode and leaves current artifacts unchanged", async (context) => {
  const fixture = await refreshFixture(context);
  const before = await readArtifacts(fixture.referencesDir);

  const { stdout } = await runNode([
    refreshScript,
    "--source-url", fixture.sourceUrl,
    "--reference-dir", fixture.referencesDir,
  ]);
  const result = JSON.parse(stdout);

  assert.equal(result.mode, "check");
  assert.equal(result.applied, false);
  assert.equal(result.changes.previousCount, 1);
  assert.equal(result.changes.nextCount, 1);
  assert.deepEqual(result.changes.added.map((article) => article.title), ["新文章"]);
  assert.deepEqual(await readArtifacts(fixture.referencesDir), before);
});

test("applies a validated corpus and keeps all generated artifacts aligned", async (context) => {
  const fixture = await refreshFixture(context);

  const { stdout } = await runNode([
    refreshScript,
    "--apply",
    "--source-url", fixture.sourceUrl,
    "--reference-dir", fixture.referencesDir,
  ]);
  const result = JSON.parse(stdout);
  const artifacts = await readArtifacts(fixture.referencesDir);
  const articles = JSON.parse(artifacts.articles);
  const manifest = JSON.parse(artifacts.manifest);

  assert.equal(result.applied, true);
  assert.equal(articles[0].title, "新文章");
  assert.equal(manifest.articleCount, articles.length);
  assert.equal(manifest.sha256, createHash("sha256").update(artifacts.articles).digest("hex"));
  assert.match(manifest.bundleSha256, /^[a-f0-9]{64}$/);
  assert.equal(artifacts.index.trim().split("\n").length, articles.length);
});

test("preserves every existing artifact when the downloaded bundle is unsafe", async (context) => {
  const fixture = await refreshFixture(context, {
    bundle: "const value=JSON.parse(`[" + "${process.exit(1)}" + "]`)",
  });
  const before = await readArtifacts(fixture.referencesDir);

  await assert.rejects(
    runNode([
      refreshScript,
      "--apply",
      "--source-url", fixture.sourceUrl,
      "--reference-dir", fixture.referencesDir,
    ]),
    (error) => error.code === 1 && /interpolated/i.test(error.stderr),
  );
  assert.deepEqual(await readArtifacts(fixture.referencesDir), before);
});

test("rejects an oversized bundle before reading its body", async (context) => {
  const fixture = await refreshFixture(context, { declaredLength: 200 * 1024 * 1024 });
  const before = await readArtifacts(fixture.referencesDir);

  await assert.rejects(
    runNode([
      refreshScript,
      "--apply",
      "--source-url", fixture.sourceUrl,
      "--reference-dir", fixture.referencesDir,
    ]),
    (error) => error.code === 1 && /larger than/i.test(error.stderr),
  );
  assert.deepEqual(await readArtifacts(fixture.referencesDir), before);
});

test("stops a streamed homepage once its decoded body exceeds the limit", async (context) => {
  const fixture = await refreshFixture(context, {
    homepage: "x".repeat(5 * 1024 * 1024 + 1),
    streamHomepage: true,
  });
  const before = await readArtifacts(fixture.referencesDir);

  await assert.rejects(
    runNode([
      refreshScript,
      "--apply",
      "--source-url", fixture.sourceUrl,
      "--reference-dir", fixture.referencesDir,
    ]),
    (error) => error.code === 1 && /exceeds/i.test(error.stderr),
  );
  assert.deepEqual(await readArtifacts(fixture.referencesDir), before);
});

test("refuses a cross-origin bundle selected by the source homepage", async (context) => {
  const fixture = await refreshFixture(context, {
    homepage: '<script src="http://127.0.0.1:9/assets/index-private.js"></script>',
  });
  const before = await readArtifacts(fixture.referencesDir);

  await assert.rejects(
    runNode([
      refreshScript,
      "--apply",
      "--source-url", fixture.sourceUrl,
      "--reference-dir", fixture.referencesDir,
    ]),
    (error) => error.code === 1 && /same-origin.*found 0/i.test(error.stderr),
  );
  assert.deepEqual(await readArtifacts(fixture.referencesDir), before);
});

test("rejects misaligned generated artifacts before replacing current files", async (context) => {
  const fixture = await refreshFixture(context);
  const before = await readArtifacts(fixture.referencesDir);
  const artifacts = buildCorpusArtifacts([articleFixture({ title: "待写入文章" })], {
    sourceUrl: fixture.sourceUrl,
    bundleUrl: `${fixture.sourceUrl}/assets/index-test.js`,
  });
  const invalidManifest = { ...artifacts.manifest, articleCount: 2 };

  await assert.rejects(
    commitCorpusArtifacts(
      { ...artifacts, manifestText: `${JSON.stringify(invalidManifest, null, 2)}\n` },
      corpusArtifactPaths(fixture.referencesDir),
    ),
    (error) => error.code === "CORPUS_ARTIFACT_MISMATCH",
  );
  assert.deepEqual(await readArtifacts(fixture.referencesDir), before);
});

test("restores every previous artifact after a mid-install failure", async (context) => {
  const fixture = await refreshFixture(context);
  const before = await readArtifacts(fixture.referencesDir);
  const artifacts = buildCorpusArtifacts([articleFixture({ title: "不应留下的文章" })], {
    sourceUrl: fixture.sourceUrl,
    bundleUrl: `${fixture.sourceUrl}/assets/index-test.js`,
  });

  await assert.rejects(
    commitCorpusArtifacts(artifacts, corpusArtifactPaths(fixture.referencesDir), {
      beforeInstall(key) {
        if (key === "index") throw new Error("Injected index installation failure.");
      },
    }),
    (error) => error.code === "CORPUS_COMMIT",
  );
  assert.deepEqual(await readArtifacts(fixture.referencesDir), before);
  await assert.rejects(readFile(join(fixture.referencesDir, ".corpus-transaction.json"), "utf8"));
});

test("recovers an interrupted transaction from its journal", async (context) => {
  const fixture = await refreshFixture(context);
  const before = await readArtifacts(fixture.referencesDir);
  const paths = corpusArtifactPaths(fixture.referencesDir);
  const transactionId = "00000000-0000-4000-8000-000000000001";
  const stagingDirectory = ".corpus-stage-interrupted";
  await mkdir(join(fixture.referencesDir, stagingDirectory));
  await rename(paths.articles, `${paths.articles}.backup-${transactionId}`);
  await writeFile(paths.articles, JSON.stringify([articleFixture({ title: "中断后的混合文章" })]));
  await writeFile(join(fixture.referencesDir, ".corpus-transaction.json"), `${JSON.stringify({
    version: 1,
    pid: 999_999,
    transactionId,
    stagingDirectory,
    hadTargets: { articles: true, index: true, manifest: true },
  }, null, 2)}\n`);

  assert.equal(await recoverCorpusTransaction(paths), true);
  assert.deepEqual(await readArtifacts(fixture.referencesDir), before);
  await assert.rejects(readFile(join(fixture.referencesDir, ".corpus-transaction.json"), "utf8"));
  await assert.rejects(readFile(join(fixture.referencesDir, stagingDirectory, "articles.json"), "utf8"));
});

test("keeps the local extract and normalize CLIs on the safe transaction path", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "binlee-extract-test-"));
  const referencesDir = join(root, "references");
  const bundlePath = join(root, "bundle.js");
  const paths = corpusArtifactPaths(referencesDir);
  await mkdir(referencesDir);
  await writeFile(bundlePath, wrapCorpus([articleFixture({ title: "本地提取文章" })]));
  context.after(() => rm(root, { recursive: true, force: true }));

  await runNode([
    extractScript,
    bundlePath,
    paths.articles,
    paths.index,
    paths.manifest,
    "https://example.com",
    "https://example.com/assets/index-test.js",
  ]);
  const extracted = await readArtifacts(referencesDir);
  assert.equal(JSON.parse(extracted.articles)[0].title, "本地提取文章");
  assert.match(JSON.parse(extracted.manifest).bundleSha256, /^[a-f0-9]{64}$/);

  await runNode([normalizeScript, paths.articles, paths.index, paths.manifest]);
  assert.deepEqual(await readArtifacts(referencesDir), extracted);
});
