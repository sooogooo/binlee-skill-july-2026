#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const corpusPath = join(scriptDir, "..", "references", "articles.json");
const articles = JSON.parse(await readFile(corpusPath, "utf8"));
const [command, value, limitValue] = process.argv.slice(2);
const limit = Number.parseInt(limitValue ?? "8", 10);

if (command === "--query" && value) {
  const needle = value.toLocaleLowerCase("zh-CN");
  const matches = articles.filter((article) => {
    const haystack = [article.title, article.category, article.summary, article.content, ...(article.faqs ?? []).flatMap((faq) => [faq.question, faq.answer])]
      .join(" ")
      .toLocaleLowerCase("zh-CN");
    return haystack.includes(needle);
  });
  const result = matches.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 8).map((article) => ({
    id: article.id,
    title: article.title,
    date: article.date,
    category: article.category,
    summary: article.summary,
    originUrl: article.originUrl,
  }));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === "--id" && value) {
  const article = articles.find((candidate) => candidate.id === value);
  if (!article) {
    process.stderr.write(`Article not found: ${value}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify(article, null, 2)}\n`);
  }
} else {
  process.stderr.write("Usage: node search-corpus.mjs --query <keyword> [limit] | --id <article-id>\n");
  process.exitCode = 1;
}

