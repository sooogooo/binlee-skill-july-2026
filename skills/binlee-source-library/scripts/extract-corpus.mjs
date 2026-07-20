#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { buildCorpusArtifacts } from "./corpus-artifacts.mjs";
import { parseCorpusBundle } from "./corpus-bundle.mjs";
import { commitCorpusArtifacts } from "./corpus-transaction.mjs";

const [bundlePath, articlesPath, indexPath, manifestPath, sourceUrl, bundleUrl] = process.argv.slice(2);

if (![bundlePath, articlesPath, indexPath, manifestPath, sourceUrl, bundleUrl].every(Boolean)) {
  process.stderr.write("Usage: node extract-corpus.mjs <bundle> <articles> <index> <manifest> <source-url> <bundle-url>\n");
  process.exit(1);
}

const source = await readFile(bundlePath, "utf8");
const artifacts = buildCorpusArtifacts(parseCorpusBundle(source), {
  sourceUrl,
  bundleUrl,
  bundleSha256: createHash("sha256").update(source).digest("hex"),
  bundleByteLength: Buffer.byteLength(source),
});

await commitCorpusArtifacts(artifacts, {
  articles: articlesPath,
  index: indexPath,
  manifest: manifestPath,
});

process.stdout.write(`${JSON.stringify(artifacts.manifest, null, 2)}\n`);

