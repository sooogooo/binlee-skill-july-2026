---
name: binlee-source-library
description: Search, cite, inspect, and refresh the local corpus of Li Bin medical-aesthetics articles from drli.beaucare.org. Use when researching a question covered by the corpus, locating source articles, checking article provenance or age, or updating the stored corpus without repeatedly browsing the source website.
---

# Binlee Source Library

Use the local corpus as a searchable primary-source collection, not as a current clinical, legal, or market-data authority.

## Search

1. Read [references/corpus-guide.md](references/corpus-guide.md) and [references/evidence-policy.md](references/evidence-policy.md).
2. Search titles, summaries, FAQs, and article text with `node scripts/search-corpus.mjs --query "关键词"`.
3. Read a selected record with `node scripts/search-corpus.mjs --id "文章-id"`.
4. Cite every substantive corpus-derived claim with article title, publication date, and original URL.

Do not load `references/articles.json` wholesale. Search first, then open only the relevant records.

## Refresh

Run `bash scripts/refresh-corpus.sh` only when an updated corpus is required. The script downloads the current application bundle once, validates its article wrapper, and replaces the local corpus, index, and manifest together.

Stop and report an extraction error rather than silently producing a partial corpus.

## Output discipline

Label source-derived material as one of: **文章中的观点**, **跨文归纳**, or **需另行核验的当前事实**. Keep the author's claims distinct from your own conclusion.

