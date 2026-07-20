#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

import { buildCorpusArtifacts } from "./corpus-artifacts.mjs";

const [bundlePath, articlesPath, indexPath, manifestPath, sourceUrl, bundleUrl] = process.argv.slice(2);

if (![bundlePath, articlesPath, indexPath, manifestPath, sourceUrl, bundleUrl].every(Boolean)) {
  process.stderr.write("Usage: node extract-corpus.mjs <bundle> <articles> <index> <manifest> <source-url> <bundle-url>\n");
  process.exit(1);
}

const source = await readFile(bundlePath, "utf8");
const prefix = "vc=JSON.parse(`";
const suffix = '`),Sc=$a("articles"';
const start = source.indexOf(prefix);
const end = source.indexOf(suffix, start + prefix.length);

if (start < 0 || end < 0) {
  process.stderr.write("Unable to locate the embedded article corpus.\n");
  process.exit(1);
}

const template = source.slice(start + prefix.length, end);
if (template.includes("${")) {
  process.stderr.write("Refusing to evaluate an interpolated corpus template.\n");
  process.exit(1);
}

const articleJson = Function(`"use strict"; return \`${template}\`;`)();
const artifacts = buildCorpusArtifacts(JSON.parse(articleJson), {
  sourceUrl,
  bundleUrl,
});

await Promise.all([
  writeFile(articlesPath, artifacts.articlesText),
  writeFile(indexPath, artifacts.indexText),
  writeFile(manifestPath, artifacts.manifestText),
]);

process.stdout.write(`${JSON.stringify(artifacts.manifest, null, 2)}\n`);

