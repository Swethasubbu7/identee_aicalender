// Local browser-test frontend on port 5174, talking to the test backend on
// port 5001 (backend/scripts/e2eServer.js). Development only.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

process.env.VITE_API_URL = "http://localhost:5001";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({ root, server: { port: 5174, strictPort: true } });
await server.listen();
server.printUrls();
