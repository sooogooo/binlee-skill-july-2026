import assert from "node:assert/strict";
import test from "node:test";

import { rankArticles } from "../skills/binlee-source-library/scripts/corpus-search.mjs";
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
  assert.equal(typeof results[0].score, "number");
  assert.deepEqual(results[0].matchedTerms, ["医生", "ip"]);
  assert.equal(typeof results[0].snippet, "string");
  assert.ok(results[0].snippet.length > 0);
  assert.equal("content" in results[0], false);
});

for (const query of ["消费者 面诊", "行业 周期"]) {
  test(`finds and explains multi-term results: ${query}`, async () => {
    const { stdout } = await runNode([searchScript, "--query", query, "5"]);
    const results = JSON.parse(stdout);

    assert.ok(results.length > 0, `expected results for query: ${query}`);
    assert.deepEqual(results[0].matchedTerms, query.split(" "));
    assert.ok(results.every((result, index) => index === 0 || results[index - 1].score >= result.score));
  });
}

test("weights concise fields and all-term matches above body-only hits", () => {
  const articles = [
    corpusFixture({ id: "body", content: "医生正在建设个人IP" }),
    corpusFixture({ id: "title", title: "医生IP方法" }),
    corpusFixture({ id: "single", title: "医生品牌", date: "2026-02-01" }),
  ];

  const results = rankArticles(articles, "医生 IP");

  assert.deepEqual(results.map((result) => result.article.id), ["title", "body", "single"]);
  assert.deepEqual(results[0].matchedTerms, ["医生", "ip"]);
  assert.ok(results[0].score > results[1].score);
  assert.ok(results[1].score > results[2].score);
});

test("uses stable tie breakers when relevance scores are equal", () => {
  const articles = [
    corpusFixture({ id: "b", title: "医生", date: "2026-01-01" }),
    corpusFixture({ id: "c", title: "医生", date: "2026-02-01" }),
    corpusFixture({ id: "a", title: "医生", date: "2026-02-01" }),
  ];

  const firstRun = rankArticles(articles, "医生").map((result) => result.article.id);
  const secondRun = rankArticles([...articles].reverse(), "医生").map((result) => result.article.id);

  assert.deepEqual(firstRun, ["a", "c", "b"]);
  assert.deepEqual(secondRun, firstRun);
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

function corpusFixture(overrides) {
  return {
    id: "fixture",
    title: "",
    date: "2026-01-01",
    category: "",
    summary: "",
    content: "",
    faqs: [],
    originUrl: "https://example.com/article",
    ...overrides,
  };
}
