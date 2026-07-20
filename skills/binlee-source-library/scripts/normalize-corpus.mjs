#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCorpusArtifacts } from "./corpus-artifacts.mjs";
import { commitCorpusArtifacts, recoverCorpusTransaction } from "./corpus-transaction.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const referencesDir = join(scriptDir, "..", "references");
const [
  articlesPath = join(referencesDir, "articles.json"),
  indexPath = join(referencesDir, "article-index.jsonl"),
  manifestPath = join(referencesDir, "manifest.json"),
] = process.argv.slice(2);
const artifactPaths = { articles: articlesPath, index: indexPath, manifest: manifestPath };

await recoverCorpusTransaction(artifactPaths);
const [rawArticles, previousManifest] = await Promise.all([
  readFile(articlesPath, "utf8").then(JSON.parse),
  readFile(manifestPath, "utf8").then(JSON.parse),
]);
const artifacts = buildCorpusArtifacts(rawArticles, {
  sourceUrl: previousManifest.sourceUrl,
  bundleUrl: previousManifest.bundleUrl,
  bundleSha256: previousManifest.bundleSha256,
  bundleByteLength: previousManifest.bundleByteLength,
  fetchedAt: previousManifest.fetchedAt,
});

await commitCorpusArtifacts(artifacts, artifactPaths);

process.stdout.write(`${JSON.stringify(artifacts.manifest, null, 2)}\n`);
