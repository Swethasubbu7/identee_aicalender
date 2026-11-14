// English (phonetic) → Tamil script for the designer's typing, through
// Google's free input tool (the same engine as Google Input Tools): it is
// dictionary-based, so common words come back correctly spelled, with a few
// alternatives to choose from. No API key and no cost. Only the typed word is
// sent — never the designer's account or other content. Answers are cached.
const ENDPOINT = "https://inputtools.google.com/request";
const TIMEOUT_MS = 4000;
const CACHE_MAX = 3000;
const cache = new Map();

const WORD = /^[A-Za-z]{1,40}$/;

/** Up to 5 Tamil spellings for one English-letter word, best first. */
const tamilSuggestions = async (word, { fetchImpl = fetch } = {}) => {
  if (!WORD.test(word || "")) throw Object.assign(new Error("Type one English word (letters only)."), { status: 400 });
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const url = `${ENDPOINT}?text=${encodeURIComponent(key)}&itc=ta-t-i0-und&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8&app=nauticrew`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (!response?.ok) throw Object.assign(new Error("Tamil suggestions are not reachable right now."), { status: 502 });
  const data = await response.json().catch(() => null);
  const list = data?.[0] === "SUCCESS" ? data?.[1]?.[0]?.[1] : null;
  const suggestions = Array.isArray(list) ? [...new Set(list.filter((s) => typeof s === "string" && s.trim()))].slice(0, 5) : [];
  if (!suggestions.length) throw Object.assign(new Error("No Tamil spelling found for this word."), { status: 404 });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, suggestions);
  return suggestions;
};

module.exports = { tamilSuggestions };
