import { createHash } from "node:crypto";

const MAX_HOMEPAGE_BYTES = 5 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 128 * 1024 * 1024;

export async function downloadCorpusBundle(sourceUrl, explicitBundleUrl) {
  const bundleUrl = explicitBundleUrl ?? await discoverBundleUrl(sourceUrl);
  return downloadText(bundleUrl, MAX_BUNDLE_BYTES, "application bundle");
}

async function discoverBundleUrl(sourceUrl) {
  const homepage = await downloadText(`${sourceUrl}/`, MAX_HOMEPAGE_BYTES, "source homepage");
  const homepageOrigin = new URL(homepage.url).origin;
  const scriptSources = [...homepage.text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], homepage.url))
    .filter((url) => url.origin === homepageOrigin)
    .map((url) => url.toString())
    .filter((url) => /\/assets\/index-[^/]+\.js(?:\?|$)/.test(url));
  const candidates = [...new Set(scriptSources)];
  if (candidates.length !== 1) {
    throw new Error(`Expected one same-origin application bundle URL, found ${candidates.length}.`);
  }
  return candidates[0];
}

async function downloadText(url, maximumBytes, label) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    throw new Error(`Unable to download ${label}: ${cause.message}`, { cause });
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Unable to download ${label}: HTTP ${response.status}.`);
  }

  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel();
    throw new Error(`Refusing ${label} larger than ${maximumBytes} bytes.`);
  }

  let bytes;
  try {
    bytes = await readLimitedBody(response, maximumBytes, label);
  } catch (cause) {
    throw new Error(`Unable to read ${label}: ${cause.message}`, { cause });
  }
  if (bytes.length === 0) {
    throw new Error(`Invalid ${label} size: 0 bytes.`);
  }
  if (Number.isFinite(declaredLength)
    && !response.headers.get("content-encoding")
    && declaredLength !== bytes.length) {
    throw new Error(`Incomplete ${label}: expected ${declaredLength} bytes, received ${bytes.length}.`);
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`Invalid UTF-8 in ${label}.`, { cause });
  }
  return {
    url: response.url,
    text,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function readLimitedBody(response, maximumBytes, label) {
  if (!response.body) {
    throw new Error(`Missing response body for ${label}.`);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new Error(`${label} exceeds ${maximumBytes} bytes.`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, byteLength);
}
