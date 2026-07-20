import assert from "node:assert/strict";
import test from "node:test";

import { runNode } from "./helpers/repository.mjs";

const searchScript = "skills/binlee-source-library/scripts/search-corpus.mjs";

test("searches the corpus and returns compact metadata", async () => {
  // Given a query known to exist in the corpus
  // When the search CLI is invoked through its public surface
  const { stdout } = await runNode([searchScript, "--query", "医生 IP", "3"]);
  const results = JSON.parse(stdout);

  // Then it returns bounded, citable metadata without full article content
  assert.ok(results.length > 0);
  assert.ok(results.length <= 3);
  assert.equal(typeof results[0].id, "string");
  assert.equal(typeof results[0].title, "string");
  assert.equal(typeof results[0].originUrl, "string");
  assert.equal("content" in results[0], false);
});

test("reads a selected article by identifier", async () => {
  // Given a search result returned by the CLI
  const { stdout: searchOutput } = await runNode([searchScript, "--query", "医生 IP", "1"]);
  const [searchResult] = JSON.parse(searchOutput);

  // When the selected identifier is requested
  const { stdout: articleOutput } = await runNode([searchScript, "--id", searchResult.id]);
  const article = JSON.parse(articleOutput);

  // Then the CLI returns the corresponding full record
  assert.equal(article.id, searchResult.id);
  assert.equal(typeof article.content, "string");
  assert.ok(article.content.length > 0);
});
