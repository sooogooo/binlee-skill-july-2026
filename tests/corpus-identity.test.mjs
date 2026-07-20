import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeOriginUrl,
  prepareArticles,
  stableArticleId,
} from "../skills/binlee-source-library/scripts/corpus-artifacts.mjs";
import { readRepositoryJson } from "./helpers/repository.mjs";

const articlesPath = "skills/binlee-source-library/references/articles.json";

test("assigns a unique source-derived identifier to every corpus record", async () => {
  const articles = await readRepositoryJson(articlesPath);
  const identifiers = articles.map((article) => article.id);
  const sourceUrls = articles.map((article) => article.originUrl);

  assert.equal(new Set(identifiers).size, identifiers.length);
  assert.equal(new Set(sourceUrls).size, sourceUrls.length);
  for (const article of articles) {
    assert.equal(article.id, stableArticleId(article.originUrl));
    assert.equal(article.originUrl, canonicalizeOriginUrl(article.originUrl));
  }
});

test("normalizes source URLs and keeps one record for each source", () => {
  const sourceA = "http://mp.weixin.qq.com/s?idx=2&mid=123&__biz=abc#rd";
  const equivalentSourceA = "https://mp.weixin.qq.com/s?__biz=abc&mid=123&idx=2";
  const sourceB = "https://example.com/article?b=2&a=1#section";

  const articles = prepareArticles([
    { id: "legacy-a", title: "preferred", originUrl: sourceA },
    { id: "legacy-a-copy", title: "duplicate", originUrl: equivalentSourceA },
    { id: "legacy-b", title: "fallback", originUrl: sourceB },
  ]);

  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, "preferred");
  assert.equal(articles[0].id, "wechat-123-2");
  assert.equal(
    articles[0].originUrl,
    "https://mp.weixin.qq.com/s?__biz=abc&idx=2&mid=123",
  );
  assert.match(articles[1].id, /^article-[a-f0-9]{16}$/);
  assert.equal(articles[1].originUrl, "https://example.com/article?a=1&b=2");
});
