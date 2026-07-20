import assert from "node:assert/strict";
import test from "node:test";

import { runNode } from "../tests/helpers/repository.mjs";

const searchScript = "skills/binlee-source-library/scripts/search-corpus.mjs";

for (const query of ["消费者 面诊", "行业 周期"]) {
  test(`finds relevant records for the multi-term query: ${query}`, async () => {
    // Given a multi-term query documented for real usage
    // When the search CLI evaluates the terms
    const { stdout } = await runNode([searchScript, "--query", query, "5"]);
    const results = JSON.parse(stdout);

    // Then at least one relevant candidate remains available for ranking
    assert.ok(results.length > 0, `expected results for query: ${query}`);
  });
}
