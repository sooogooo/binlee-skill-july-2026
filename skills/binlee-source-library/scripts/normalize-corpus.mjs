#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCorpusArtifacts } from "./corpus-artifacts.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const referencesDir = join(scriptDir, "..", "references");
const [
  articlesPath = join(referencesDir, "articles.json"),
  indexPath = join(referencesDir, "article-index.jsonl"),
  manifestPath = join(referencesDir, "manifest.json"),
] = process.argv.slice(2);

const [rawArticles, previousManifest] = await Promise.all([
  readFile(articlesPath, "utf8").then(JSON.parse),
  readFile(manifestPath, "utf8").then(JSON.parse),
]);
const artifacts = buildCorpusArtifacts(rawArticles, {
  sourceUrl: previousManifest.sourceUrl,
  bundleUrl: previousManifest.bundleUrl,
  fetchedAt: previousManifest.fetchedAt,
});

await Promise.all([
  writeFile(articlesPath, artifacts.articlesText),
  writeFile(indexPath, artifacts.indexText),
  writeFile(manifestPath, artifacts.manifestText),
]);

process.stdout.write(`${JSON.stringify(artifacts.manifest, null, 2)}\n`);
