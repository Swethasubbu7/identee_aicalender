import axios from "axios";
import { apiUrl, authHeaders } from "../config";

const cache = new Map();

/** Tamil spellings (best first) for one English-letter word, e.g. "sattai" → ["சட்டை", …]. */
export const tamilSuggestions = async (word) => {
  const key = word.toLowerCase();
  if (!cache.has(key)) {
    cache.set(
      key,
      axios
        .get(apiUrl("/api/transliterate/tamil"), { params: { word: key }, headers: authHeaders() })
        .then((r) => r.data.suggestions || [])
        .catch((err) => {
          cache.delete(key);
          throw err;
        }),
    );
  }
  return cache.get(key);
};
