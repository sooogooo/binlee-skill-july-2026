import { createHash } from "node:crypto";

const WECHAT_HOST = "mp.weixin.qq.com";

export function canonicalizeOriginUrl(originUrl) {
  let url;
  try {
    url = new URL(originUrl);
  } catch {
    throw new Error(`Invalid article origin URL: ${originUrl}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported article origin URL: ${originUrl}`);
  }

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.port = "";
  url.pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  url.searchParams.sort();
  return url.toString();
}

export function stableArticleId(originUrl) {
  const canonicalUrl = canonicalizeOriginUrl(originUrl);
  const url = new URL(canonicalUrl);
  const mid = url.searchParams.get("mid");
  const idx = url.searchParams.get("idx");

  if (url.hostname === WECHAT_HOST && /^\d+$/.test(mid ?? "") && /^\d+$/.test(idx ?? "")) {
    return `wechat-${mid}-${idx}`;
  }

  return `article-${shortHash(canonicalUrl)}`;
}

export function prepareArticles(rawArticles) {
  if (!Array.isArray(rawArticles)) {
    throw new TypeError("The article corpus must be an array.");
  }

  const sourceKeys = new Set();
  const identifiers = new Map();
  const articles = [];

  for (const article of rawArticles) {
    const originUrl = canonicalizeOriginUrl(article.originUrl);
    const sourceKey = sourceIdentity(originUrl);

    if (sourceKeys.has(sourceKey)) {
      continue;
    }

    const id = stableArticleId(originUrl);
    const conflictingSource = identifiers.get(id);
    if (conflictingSource && conflictingSource !== sourceKey) {
      throw new Error(`Stable article ID collision for ${id}.`);
    }

    sourceKeys.add(sourceKey);
    identifiers.set(id, sourceKey);
    articles.push({ ...article, id, originUrl });
  }

  return articles;
}

export function buildCorpusArtifacts(rawArticles, source = {}) {
  const articles = prepareArticles(rawArticles);
  const articlesText = JSON.stringify(articles);
  const dates = articles.map((article) => article.date).filter(Boolean).sort();
  const categoryCounts = new Map();

  for (const article of articles) {
    categoryCounts.set(article.category, (categoryCounts.get(article.category) ?? 0) + 1);
  }

  const categories = Object.fromEntries([...categoryCounts].sort(([left], [right]) => left.localeCompare(right, "zh-CN")));
  const indexText = `${articles.map((article) => JSON.stringify({
    id: article.id,
    title: article.title,
    date: article.date,
    category: article.category,
    summary: article.summary,
    faqs: article.faqs ?? [],
    originUrl: article.originUrl,
  })).join("\n")}\n`;
  const manifest = {
    sourceUrl: source.sourceUrl,
    bundleUrl: source.bundleUrl,
    ...(source.bundleSha256 ? { bundleSha256: source.bundleSha256 } : {}),
    ...(source.bundleByteLength ? { bundleByteLength: source.bundleByteLength } : {}),
    fetchedAt: source.fetchedAt ?? new Date().toISOString(),
    articleCount: articles.length,
    dateRange: { earliest: dates[0], latest: dates.at(-1) },
    categories,
    sha256: createHash("sha256").update(articlesText).digest("hex"),
  };

  return {
    articles,
    articlesText,
    indexText,
    manifest,
    manifestText: `${JSON.stringify(manifest, null, 2)}\n`,
  };
}

function sourceIdentity(canonicalUrl) {
  const url = new URL(canonicalUrl);
  const mid = url.searchParams.get("mid");
  const idx = url.searchParams.get("idx");

  if (url.hostname === WECHAT_HOST && mid && idx) {
    return [url.hostname, url.searchParams.get("__biz") ?? "", mid, idx].join(":");
  }

  return canonicalUrl;
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
