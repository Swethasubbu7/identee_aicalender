// AI must stay OFF unless it is switched on explicitly with a real key, and
// no request may leave the server while it is off.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");

// Loads config + providers fresh with the given environment. The environment
// stays applied until the test ends (keys are also read at call time).
let restoreEnv = null;
test.afterEach(() => {
  if (restoreEnv) restoreEnv();
  restoreEnv = null;
});
const loadWith = (env) => {
  const saved = { ...process.env };
  for (const k of ["AI_IMAGE_PROVIDER", "GEMINI_API_KEY"]) delete process.env[k];
  Object.assign(process.env, env);
  for (const id of Object.keys(require.cache)) {
    if (id.startsWith(SRC)) delete require.cache[id];
  }
  // dotenv must not refill the variables from backend/.env during the test.
  const dotenv = require("dotenv");
  const original = dotenv.config;
  dotenv.config = () => ({ parsed: {} });
  try {
    const config = require(path.join(SRC, "config"));
    const imageAi = require(path.join(SRC, "services/ai/imageAi"));
    const gemini = require(path.join(SRC, "services/ai/imageAi/geminiProvider"));
    return { config, imageAi, gemini };
  } finally {
    dotenv.config = original;
    restoreEnv = () => {
      process.env = saved;
    };
  }
};

test("placeholder keys are not real keys", () => {
  const { config } = loadWith({});
  for (const key of [undefined, "", "  ", "None", "none", "NULL", "undefined", "false", "off", "-"]) {
    assert.equal(config.hasRealApiKey(key), false, String(key));
  }
  assert.equal(config.hasRealApiKey("AIzaSyExampleExampleExample"), true);
});

test("AI is off by default, even with a real-looking key", () => {
  const { config, imageAi } = loadWith({ GEMINI_API_KEY: "AIzaSyExampleExampleExample" });
  assert.equal(config.AI_IMAGE_PROVIDER, "none");
  assert.equal(imageAi.getImageAi().isConfigured(), false);
});

test("AI_IMAGE_PROVIDER=none blocks everything", async () => {
  const { imageAi, gemini } = loadWith({ AI_IMAGE_PROVIDER: "none", GEMINI_API_KEY: "AIzaSyExampleExampleExample" });
  const ai = imageAi.getImageAi();
  assert.equal(ai.name, "none");
  await assert.rejects(ai.editImage({ prompt: "x", images: [] }), { code: "AI_NOT_CONFIGURED" });
  assert.equal(gemini.isConfigured(), false);
});

test("gemini selected but the key is None/empty: blocked before any network call", async () => {
  for (const key of ["None", "", "none"]) {
    if (restoreEnv) restoreEnv();
    const { gemini } = loadWith({ AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: key });
    assert.equal(gemini.isConfigured(), false);
    const realFetch = global.fetch;
    let networkCalls = 0;
    global.fetch = async () => {
      networkCalls += 1;
      throw new Error("network must not be used");
    };
    try {
      await assert.rejects(gemini.editImage({ prompt: "x", images: [] }), { kind: "DISABLED" });
    } finally {
      global.fetch = realFetch;
    }
    assert.equal(networkCalls, 0);
  }
});

test("only an explicit gemini setting plus a real key enables AI", () => {
  const { gemini } = loadWith({ AI_IMAGE_PROVIDER: "gemini", GEMINI_API_KEY: "AIzaSyExampleExampleExample" });
  assert.equal(gemini.isConfigured(), true);
});
