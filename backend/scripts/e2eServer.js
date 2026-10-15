// Local browser-test backend: the normal server on port 5001 with AI forced
// OFF (AI_IMAGE_PROVIDER=none), whatever backend/.env says. Development only.
const path = require("path");
process.chdir(path.join(__dirname, ".."));
process.env.PORT = "5001";
process.env.PUBLIC_BASE_URL = "http://localhost:5001";
process.env.AI_IMAGE_PROVIDER = "none";
require("../src/index.js");
