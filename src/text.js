// Small text helpers shared by the linter, the exporter and the browser page.
export function wordCount(text = "") {
  return String(text).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function charCount(text = "") {
  return [...String(text)].length;
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-phrase, case-insensitive, unicode-aware match ("best" must not match "bestow").
export function phraseRegex(phrase) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, "iu");
}

export function findPhrases(text, phrases) {
  return phrases.filter((p) => phraseRegex(p).test(text));
}
