import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildCorpusArtifacts } from "../../skills/binlee-source-library/scripts/corpus-artifacts.mjs";

export async function refreshFixture(context, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "binlee-refresh-test-"));
  const referencesDir = join(root, "references");
  await mkdir(referencesDir);
  await seedReferences(referencesDir);

  const bundle = overrides.bundle ?? wrapCorpus([articleFixture({
    id: "remote-id",
    title: "新文章",
    originUrl: "https://example.com/new-article",
  })]);
  const homepage = overrides.homepage
    ?? '<script type="module" src="/assets/index-test.js"></script>';
  const server = createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (overrides.streamHomepage) response.write(homepage);
      response.end(overrides.streamHomepage ? undefined : homepage);
      return;
    }
    if (request.url === "/assets/index-test.js") {
      response.writeHead(200, {
        "content-length": overrides.declaredLength ?? Buffer.byteLength(bundle),
        "content-type": "text/javascript; charset=utf-8",
      });
      response.end(bundle);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const sourceUrl = `http://127.0.0.1:${address.port}`;

  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  });
  return { referencesDir, sourceUrl };
}

export async function readArtifacts(referencesDir) {
  const [articles, index, manifest] = await Promise.all([
    readFile(join(referencesDir, "articles.json"), "utf8"),
    readFile(join(referencesDir, "article-index.jsonl"), "utf8"),
    readFile(join(referencesDir, "manifest.json"), "utf8"),
  ]);
  return { articles, index, manifest };
}

export function wrapCorpus(articles) {
  const template = JSON.stringify(articles)
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${");
  return `const value=JSON.parse(\`${template}\`)`;
}

export function articleFixture(overrides = {}) {
  return {
    id: "old-id",
    title: "旧文章",
    date: "2026-07-01",
    category: "行业洞察",
    image: "https://example.com/image.jpg",
    summary: "摘要",
    content: "<p>正文</p>",
    faqs: [],
    originUrl: "https://example.com/old-article",
    ...overrides,
  };
}

async function seedReferences(referencesDir) {
  const artifacts = buildCorpusArtifacts([articleFixture()], {
    sourceUrl: "https://example.com",
    bundleUrl: "https://example.com/assets/index-old.js",
    fetchedAt: "2026-07-10T00:00:00.000Z",
  });
  await Promise.all([
    writeFile(join(referencesDir, "articles.json"), artifacts.articlesText),
    writeFile(join(referencesDir, "article-index.jsonl"), artifacts.indexText),
    writeFile(join(referencesDir, "manifest.json"), artifacts.manifestText),
  ]);
}
