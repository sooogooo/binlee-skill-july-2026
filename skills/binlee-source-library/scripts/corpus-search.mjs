const FIELD_WEIGHTS = {
  title: 8,
  faqs: 5,
  summary: 3,
  category: 1,
  content: 1,
};
const ALL_TERMS_BONUS = 12;
const SNIPPET_LENGTH = 180;

export function rankArticles(articles, query) {
  const terms = parseQuery(query);
  if (terms.length === 0) {
    return [];
  }

  const compactPhrase = terms.length > 1 ? terms.join("") : "";
  const results = [];

  for (const article of articles) {
    const fields = searchableFields(article);
    const matchedTerms = [];
    let score = 0;

    for (const term of terms) {
      let matched = false;
      for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
        if (fields[field].includes(term)) {
          score += weight;
          matched = true;
        }
      }
      if (matched) {
        matchedTerms.push(term);
      }
    }

    if (matchedTerms.length === 0) {
      continue;
    }

    if (matchedTerms.length === terms.length && terms.length > 1) {
      score += ALL_TERMS_BONUS;
    }

    if (compactPhrase) {
      const phraseWeight = Object.entries(FIELD_WEIGHTS)
        .filter(([field]) => fields[field].includes(compactPhrase))
        .reduce((highest, [, weight]) => Math.max(highest, weight), 0);
      score += phraseWeight;
    }

    results.push({
      article,
      score,
      matchedTerms,
      snippet: createSnippet(article, matchedTerms),
    });
  }

  return results.sort(compareRankedResults);
}

export function parseQuery(query) {
  const normalized = normalizeText(query);
  const uniqueTerms = new Set(normalized.split(/\s+/).filter(Boolean));
  return [...uniqueTerms];
}

function searchableFields(article) {
  return {
    title: normalizeText(article.title),
    faqs: normalizeText((article.faqs ?? []).flatMap((faq) => [faq.question, faq.answer]).join(" ")),
    summary: normalizeText(article.summary),
    category: normalizeText(article.category),
    content: normalizeText(toPlainText(article.content)),
  };
}

function createSnippet(article, matchedTerms) {
  const candidates = [
    article.summary,
    ...(article.faqs ?? []).flatMap((faq) => [faq.question, faq.answer]),
    toPlainText(article.content),
    article.title,
  ].map(cleanWhitespace).filter(Boolean);

  let selected = candidates[0] ?? cleanWhitespace(article.title);
  let matchIndex = -1;

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    const indexes = matchedTerms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0);
    if (indexes.length > 0) {
      selected = candidate;
      matchIndex = Math.min(...indexes);
      break;
    }
  }

  if (selected.length <= SNIPPET_LENGTH) {
    return selected;
  }

  const start = matchIndex > 45 ? matchIndex - 45 : 0;
  const end = Math.min(start + SNIPPET_LENGTH, selected.length);
  return `${start > 0 ? "..." : ""}${selected.slice(start, end)}${end < selected.length ? "..." : ""}`;
}

function compareRankedResults(left, right) {
  return right.score - left.score
    || right.matchedTerms.length - left.matchedTerms.length
    || String(right.article.date ?? "").localeCompare(String(left.article.date ?? ""), "en")
    || String(left.article.id).localeCompare(String(right.article.id), "en");
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function cleanWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toPlainText(value) {
  return cleanWhitespace(String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'"));
}
