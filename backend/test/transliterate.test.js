// English → Tamil typing: the response of Google's input tool is parsed and
// cached; only English-letter words are accepted. No network (mocked fetch).
const test = require("node:test");
const assert = require("node:assert/strict");
const { tamilSuggestions } = require("../src/services/transliterate");

const reply = (list) => async () => ({ ok: true, json: async () => ["SUCCESS", [["x", list, [], {}]]] });

test("transliterate: best Tamil spellings first, duplicates removed, cached", async () => {
  let calls = 0;
  const fetchImpl = async (...args) => {
    calls += 1;
    return reply(["சட்டை", "சாட்டை", "சட்டை", "ஷாட்டை"])(...args);
  };
  assert.deepEqual(await tamilSuggestions("Sattaitest", { fetchImpl }), ["சட்டை", "சாட்டை", "ஷாட்டை"]);
  assert.deepEqual(await tamilSuggestions("sattaitest", { fetchImpl }), ["சட்டை", "சாட்டை", "ஷாட்டை"]);
  assert.equal(calls, 1);
});

test("transliterate: only one English word; unreachable or empty answers are reported", async () => {
  await assert.rejects(tamilSuggestions("two words"), /one English word/);
  await assert.rejects(tamilSuggestions("சட்டை"), /one English word/);
  await assert.rejects(tamilSuggestions("downword", { fetchImpl: async () => ({ ok: false }) }), /not reachable/);
  await assert.rejects(tamilSuggestions("emptyword", { fetchImpl: reply([]) }), /No Tamil spelling/);
});
