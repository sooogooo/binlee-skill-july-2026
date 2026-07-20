import assert from "node:assert/strict";
import test from "node:test";

import { readRepositoryJson } from "../tests/helpers/repository.mjs";

test("assigns a unique identifier to every corpus record", async () => {
  // Given the checked-in corpus
  const articles = await readRepositoryJson(
    "skills/binlee-source-library/references/articles.json",
  );

  // When article identifiers are counted
  const identifiers = articles.map((article) => article.id);

  // Then no record is unreachable through an ambiguous identifier
  assert.equal(new Set(identifiers).size, identifiers.length);
});
