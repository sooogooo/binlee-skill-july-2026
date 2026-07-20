import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { readRepositoryJson, readRepositoryText } from "./helpers/repository.mjs";

const articlesPath = "skills/binlee-source-library/references/articles.json";
const indexPath = "skills/binlee-source-library/references/article-index.jsonl";
const manifestPath = "skills/binlee-source-library/references/manifest.json";

test("keeps the corpus count and digest aligned with the manifest", async () => {
  // Given the generated corpus and its manifest
  const [articlesText, manifest] = await Promise.all([
    readRepositoryText(articlesPath),
    readRepositoryJson(manifestPath),
  ]);

  // When the checked-in corpus is parsed and hashed
  const articles = JSON.parse(articlesText);
  const digest = createHash("sha256").update(articlesText).digest("hex");

  // Then the manifest describes the exact checked-in artifact
  assert.equal(articles.length, manifest.articleCount);
  assert.equal(digest, manifest.sha256);
  assert.equal(
    Object.values(manifest.categories).reduce((total, count) => total + count, 0),
    manifest.articleCount,
  );
});

test("keeps the lightweight index aligned with the full corpus", async () => {
  // Given the full corpus and line-oriented index
  const [articles, indexText] = await Promise.all([
    readRepositoryJson(articlesPath),
    readRepositoryText(indexPath),
  ]);

  // When non-empty index records are parsed
  const indexRecords = indexText
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  // Then every article has one searchable index record
  assert.equal(indexRecords.length, articles.length);
});

test("keeps required article fields structurally valid", async () => {
  // Given the checked-in article corpus
  const articles = await readRepositoryJson(articlesPath);

  // When every article record is inspected
  for (const article of articles) {
    // Then the retrieval and citation fields are present
    assert.equal(typeof article.id, "string");
    assert.ok(article.id.length > 0);
    assert.equal(typeof article.title, "string");
    assert.match(article.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(article.originUrl, /^https?:\/\//);
    assert.equal(typeof article.content, "string");
  }
});
