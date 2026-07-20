import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCorpusBundle } from "../skills/binlee-source-library/scripts/corpus-bundle.mjs";
import { repositoryPath } from "./helpers/repository.mjs";

test("parses a static article corpus without evaluating bundle code", () => {
  const article = articleFixture({
    title: "模板 ` 字符",
    content: "第一行\n第二行 ${保持文本}",
  });

  const result = parseCorpusBundle(wrapCorpus([article]));

  assert.deepEqual(result, [article]);
});

test("rejects an interpolated template before parsing JSON", () => {
  const source = "const value=JSON.parse(`[" + "${process.exit(1)}" + "]`)";

  assert.throws(
    () => parseCorpusBundle(source),
    (error) => error.code === "CORPUS_INTERPOLATION",
  );
});

test("rejects legacy octal escapes in corpus templates", () => {
  const source = "const value=JSON.parse(`\\8`)";

  assert.throws(
    () => parseCorpusBundle(source),
    (error) => error.code === "CORPUS_ESCAPE",
  );
});

test("rejects ambiguous bundles containing multiple article corpora", () => {
  const source = `${wrapCorpus([articleFixture({ title: "A" })])}\n${wrapCorpus([articleFixture({ title: "B" })])}`;

  assert.throws(
    () => parseCorpusBundle(source),
    (error) => error.code === "CORPUS_AMBIGUOUS",
  );
});

test("rejects bundles without an article-shaped corpus", () => {
  assert.throws(
    () => parseCorpusBundle('const value=JSON.parse(`{"status":"ok"}`)'),
    (error) => error.code === "CORPUS_NOT_FOUND",
  );
});

test("reports damaged article JSON without executing a fallback", () => {
  assert.throws(
    () => parseCorpusBundle('const value=JSON.parse(`[{"title":}]`)'),
    (error) => error.code === "CORPUS_JSON",
  );
});

test("does not let a valid decoy hide an unsafe corpus candidate", () => {
  const unsafe = "const unsafe=JSON.parse(`[" + "${process.exit(1)}" + "]`)";
  const decoy = wrapCorpus([articleFixture({ title: "诱饵文章" })]);

  assert.throws(
    () => parseCorpusBundle(`${unsafe}\n${decoy}`),
    (error) => error.code === "CORPUS_INTERPOLATION",
  );
});

test("keeps dynamic code execution out of the corpus refresh chain", async () => {
  const scriptNames = [
    "corpus-bundle.mjs",
    "corpus-source.mjs",
    "corpus-transaction.mjs",
    "extract-corpus.mjs",
    "refresh-corpus.mjs",
  ];
  const sources = await Promise.all(scriptNames.map((scriptName) => readFile(
    repositoryPath("skills", "binlee-source-library", "scripts", scriptName),
    "utf8",
  )));

  for (const source of sources) {
    assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(|\bvm\./);
  }
});

function wrapCorpus(articles) {
  const template = JSON.stringify(articles)
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${");
  return `const value=JSON.parse(\`${template}\`)`;
}

function articleFixture(overrides = {}) {
  return {
    id: "legacy-id",
    title: "测试文章",
    date: "2026-07-20",
    category: "行业洞察",
    image: "https://example.com/image.jpg",
    summary: "摘要",
    content: "<p>正文</p>",
    faqs: [{ question: "问题？", answer: "答案。" }],
    originUrl: "https://example.com/article",
    ...overrides,
  };
}
