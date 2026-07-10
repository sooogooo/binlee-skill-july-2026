#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

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
const articles = JSON.parse(articleJson);
const dates = articles.map((article) => article.date).filter(Boolean).sort();
const categories = Object.fromEntries(
  Object.entries(articles.reduce((counts, article) => ({ ...counts, [article.category]: (counts[article.category] ?? 0) + 1 }), {})).sort(),
);
const index = articles.map((article) => JSON.stringify({
  id: article.id,
  title: article.title,
  date: article.date,
  category: article.category,
  summary: article.summary,
  faqs: article.faqs ?? [],
  originUrl: article.originUrl,
})).join("\n");
const manifest = {
  sourceUrl,
  bundleUrl,
  fetchedAt: new Date().toISOString(),
  articleCount: articles.length,
  dateRange: { earliest: dates[0], latest: dates.at(-1) },
  categories,
  sha256: createHash("sha256").update(articleJson).digest("hex"),
};

await Promise.all([
  writeFile(articlesPath, JSON.stringify(articles)),
  writeFile(indexPath, `${index}\n`),
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
]);

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

