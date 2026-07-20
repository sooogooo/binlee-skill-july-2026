export class CorpusBundleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CorpusBundleError";
    this.code = code;
  }
}

export function parseCorpusBundle(source) {
  if (typeof source !== "string") {
    throw new TypeError("Corpus bundle source must be a string.");
  }

  const marker = "JSON.parse";
  const candidates = [];
  let firstBoundaryError;
  let cursor = 0;

  while (cursor < source.length) {
    const markerIndex = source.indexOf(marker, cursor);
    if (markerIndex === -1) {
      break;
    }

    cursor = markerIndex + marker.length;
    const openingParenthesis = skipWhitespace(source, cursor);
    if (source[openingParenthesis] !== "(") {
      continue;
    }

    const templateStart = skipWhitespace(source, openingParenthesis + 1);
    if (source[templateStart] !== "`") {
      continue;
    }

    try {
      const template = readStaticTemplate(source, templateStart);
      cursor = template.endIndex;
      const closingParenthesis = skipWhitespace(source, template.endIndex);
      if (source[closingParenthesis] !== ")") {
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(template.value);
      } catch (cause) {
        if (template.value.trimStart().startsWith("[")) {
          throw new CorpusBundleError("CORPUS_JSON", `Invalid embedded corpus JSON: ${cause.message}`);
        }
        continue;
      }

      if (isArticleCorpus(parsed)) {
        candidates.push(parsed);
      }
    } catch (error) {
      if (!(error instanceof CorpusBundleError)) {
        throw error;
      }
      firstBoundaryError ??= error;
    }
  }

  if (firstBoundaryError) {
    throw firstBoundaryError;
  }
  if (candidates.length > 1) {
    throw new CorpusBundleError("CORPUS_AMBIGUOUS", "The bundle contains multiple article corpora.");
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  throw new CorpusBundleError("CORPUS_NOT_FOUND", "Unable to locate an article-shaped corpus in the bundle.");
}

function readStaticTemplate(source, startIndex) {
  let value = "";

  for (let index = startIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "`") {
      return { value, endIndex: index + 1 };
    }
    if (character === "$" && source[index + 1] === "{") {
      throw new CorpusBundleError("CORPUS_INTERPOLATION", "Refusing to parse an interpolated corpus template.");
    }
    if (character === "\\") {
      const escape = decodeTemplateEscape(source, index);
      value += escape.value;
      index = escape.endIndex - 1;
      continue;
    }
    if (character === "\r") {
      value += "\n";
      if (source[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }
    value += character;
  }

  throw new CorpusBundleError("CORPUS_TEMPLATE", "The embedded corpus template is not terminated.");
}

function decodeTemplateEscape(source, slashIndex) {
  const escapeIndex = slashIndex + 1;
  const character = source[escapeIndex];
  if (character === undefined) {
    throw new CorpusBundleError("CORPUS_ESCAPE", "The corpus template ends with an incomplete escape.");
  }
  if (character === "\n") {
    return { value: "", endIndex: escapeIndex + 1 };
  }
  if (character === "\r") {
    return { value: "", endIndex: source[escapeIndex + 1] === "\n" ? escapeIndex + 2 : escapeIndex + 1 };
  }

  const simpleEscapes = new Map([
    ["b", "\b"], ["f", "\f"], ["n", "\n"], ["r", "\r"],
    ["t", "\t"], ["v", "\v"], ["0", "\0"],
  ]);
  if (simpleEscapes.has(character)) {
    if (character === "0" && /\d/.test(source[escapeIndex + 1] ?? "")) {
      throw invalidEscape(slashIndex);
    }
    return { value: simpleEscapes.get(character), endIndex: escapeIndex + 1 };
  }
  if (/[1-9]/.test(character)) {
    throw invalidEscape(slashIndex);
  }
  if (character === "x") {
    return decodeFixedHexEscape(source, slashIndex, escapeIndex + 1, 2);
  }
  if (character === "u") {
    return source[escapeIndex + 1] === "{"
      ? decodeCodePointEscape(source, slashIndex, escapeIndex + 2)
      : decodeFixedHexEscape(source, slashIndex, escapeIndex + 1, 4);
  }
  return { value: character, endIndex: escapeIndex + 1 };
}

function decodeFixedHexEscape(source, slashIndex, digitsStart, length) {
  const digits = source.slice(digitsStart, digitsStart + length);
  if (digits.length !== length || !/^[a-f\d]+$/i.test(digits)) {
    throw invalidEscape(slashIndex);
  }
  return { value: String.fromCharCode(Number.parseInt(digits, 16)), endIndex: digitsStart + length };
}

function decodeCodePointEscape(source, slashIndex, digitsStart) {
  const closingBrace = source.indexOf("}", digitsStart);
  const digits = closingBrace === -1 ? "" : source.slice(digitsStart, closingBrace);
  const codePoint = Number.parseInt(digits, 16);
  if (!/^[a-f\d]{1,6}$/i.test(digits) || codePoint > 0x10ffff) {
    throw invalidEscape(slashIndex);
  }
  return { value: String.fromCodePoint(codePoint), endIndex: closingBrace + 1 };
}

function invalidEscape(slashIndex) {
  return new CorpusBundleError(
    "CORPUS_ESCAPE",
    `Invalid corpus template escape at offset ${slashIndex}.`,
  );
}

function skipWhitespace(source, startIndex) {
  let index = startIndex;
  while (/\s/.test(source[index] ?? "")) {
    index += 1;
  }
  return index;
}

function isArticleCorpus(value) {
  return Array.isArray(value) && value.length > 0 && value.every((article) => (
    article !== null
    && typeof article === "object"
    && typeof article.title === "string"
    && typeof article.date === "string"
    && typeof article.category === "string"
    && typeof article.summary === "string"
    && typeof article.content === "string"
    && Array.isArray(article.faqs)
    && typeof article.originUrl === "string"
  ));
}
