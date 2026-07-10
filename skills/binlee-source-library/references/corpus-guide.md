# Corpus guide

## Scope

The local corpus contains 582 records extracted from `https://drli.beaucare.org` on 2026-07-10. It covers articles dated from 2018-08-29 through 2026-07-07.

| Site category | Records |
| --- | ---: |
| 临床实践 | 222 |
| 行业洞察 | 218 |
| 机构运营 | 142 |

## Files

- `articles.json`: full preserved records: title, date, category, summary, HTML body, FAQs, image URL, and original article URL.
- `article-index.jsonl`: one lightweight searchable record per article.
- `manifest.json`: source, extraction time, count, date span, bundle URL, and SHA-256 digest.

Use `scripts/search-corpus.mjs` instead of loading the full corpus. Search returns compact metadata; `--id` returns the selected full record.

## Reading order

Search by the decision question first, then read at least two relevant records before making a cross-article claim. A site category is only a navigation label; it is not an evidence rating or a topic taxonomy.

