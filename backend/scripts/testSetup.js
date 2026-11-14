// Preloaded into every test process by `npm test`. Tests must never make
// paid AI requests, whatever backend/.env says on this computer.
//
// dotenv never overrides a variable that is already set, so these values win
// over backend/.env. Tests that need AI "on" set their own fake values.
process.env.AI_IMAGE_PROVIDER = "none";
process.env.GEMINI_API_KEY = "";
// Tests never write to the shared Atlas database: storage stays local
// (GridFS is tested with an in-memory fake).
process.env.STORAGE_DRIVER = "local";

// Belt and braces: refuse any network request to Google's AI endpoints.
const BLOCKED = /(^|\.)(generativelanguage|aiplatform)\.googleapis\.com$/i;
if (typeof globalThis.fetch === "function") {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    let host = "";
    try {
      host = new URL(typeof input === "string" ? input : input?.url || String(input)).hostname;
    } catch {
      /* not a URL we can read; let fetch decide */
    }
    if (BLOCKED.test(host)) {
      return Promise.reject(new Error(`Blocked AI request to ${host} during tests`));
    }
    return realFetch(input, init);
  };
}
