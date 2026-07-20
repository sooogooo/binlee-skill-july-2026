#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCorpusArtifacts } from "./corpus-artifacts.mjs";
import { parseCorpusBundle } from "./corpus-bundle.mjs";
import { downloadCorpusBundle } from "./corpus-source.mjs";
import {
  commitCorpusArtifacts,
  corpusArtifactPaths,
  recoverCorpusTransaction,
} from "./corpus-transaction.mjs";

const DEFAULT_SOURCE_URL = "https://drli.beaucare.org";

try {
  const options = parseOptions(process.argv.slice(2));
  const result = await refreshCorpus(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.name ?? "Error"}: ${error.message}\n`);
  process.exitCode = 1;
}

async function refreshCorpus(options) {
  const paths = corpusArtifactPaths(options.referenceDir);
  await recoverCorpusTransaction(paths);
  const currentArticles = JSON.parse(await readFile(paths.articles, "utf8"));
  const bundle = await downloadCorpusBundle(options.sourceUrl, options.bundleUrl);
  const rawArticles = parseCorpusBundle(bundle.text);
  const artifacts = buildCorpusArtifacts(rawArticles, {
    sourceUrl: options.sourceUrl,
    bundleUrl: bundle.url,
    bundleSha256: bundle.sha256,
    bundleByteLength: bundle.byteLength,
  });
  const changes = summarizeChanges(currentArticles, artifacts.articles);

  if (options.mode === "apply") {
    await commitCorpusArtifacts(artifacts, paths);
  }

  return {
    mode: options.mode,
    applied: options.mode === "apply",
    sourceUrl: options.sourceUrl,
    bundleUrl: bundle.url,
    bundleSha256: bundle.sha256,
    bundleByteLength: bundle.byteLength,
    changes,
    nextManifest: artifacts.manifest,
  };
}

function parseOptions(argumentsList) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const options = {
    mode: "check",
    sourceUrl: DEFAULT_SOURCE_URL,
    referenceDir: resolve(scriptDir, "..", "references"),
  };
  let selectedMode;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--check" || argument === "--apply") {
      const mode = argument.slice(2);
      if (selectedMode && selectedMode !== mode) {
        throw new Error("Choose either --check or --apply, not both.");
      }
      selectedMode = mode;
      options.mode = mode;
      continue;
    }
    if (["--source-url", "--bundle-url", "--reference-dir"].includes(argument)) {
      const value = argumentsList[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${argument}.`);
      }
      index += 1;
      if (argument === "--source-url") options.sourceUrl = normalizeHttpUrl(value);
      if (argument === "--bundle-url") options.bundleUrl = normalizeHttpUrl(value);
      if (argument === "--reference-dir") options.referenceDir = resolve(value);
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  options.sourceUrl = normalizeHttpUrl(options.sourceUrl).replace(/\/$/, "");
  return options;
}

function summarizeChanges(previousArticles, nextArticles) {
  const previous = new Map(previousArticles.map((article) => [article.id, article]));
  const next = new Map(nextArticles.map((article) => [article.id, article]));
  const added = nextArticles.filter((article) => !previous.has(article.id));
  const removed = previousArticles.filter((article) => !next.has(article.id));
  const changed = nextArticles.filter((article) => (
    previous.has(article.id)
    && JSON.stringify(previous.get(article.id)) !== JSON.stringify(article)
  ));
  return {
    previousCount: previousArticles.length,
    nextCount: nextArticles.length,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    wouldChange: added.length + removed.length + changed.length > 0,
    added: added.slice(0, 10).map(articleSummary),
    removed: removed.slice(0, 10).map(articleSummary),
    changed: changed.slice(0, 10).map(articleSummary),
    categoryDelta: categoryDelta(previousArticles, nextArticles),
  };
}

function categoryDelta(previousArticles, nextArticles) {
  const previous = countCategories(previousArticles);
  const next = countCategories(nextArticles);
  return Object.fromEntries([...new Set([...previous.keys(), ...next.keys()])]
    .sort((left, right) => left.localeCompare(right, "zh-CN"))
    .map((category) => [category, (next.get(category) ?? 0) - (previous.get(category) ?? 0)]));
}

function countCategories(articles) {
  const counts = new Map();
  for (const article of articles) counts.set(article.category, (counts.get(article.category) ?? 0) + 1);
  return counts;
}

function articleSummary(article) {
  return { id: article.id, title: article.title, date: article.date, category: article.category };
}

function normalizeHttpUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  return url.toString();
}
