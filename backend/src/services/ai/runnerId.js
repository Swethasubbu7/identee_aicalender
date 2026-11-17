// Identifies this server process in AI jobs and usage records. Several
// servers (team computers) share one database: a restart may only close the
// jobs and requests of ITS OWN earlier process, never another server's.
// A server is its computer AND port: two servers can run on one computer at
// the same time (e.g. on ports 5000 and 5001), but only one per port — so a
// new process on a port is the restart of the previous one on that port.
const os = require("os");
const { PORT } = require("../../config");

const HOST = os.hostname();
const SERVER = `${HOST}:${PORT}`;
const RUNNER_ID = `${SERVER}:${process.pid}:${Date.now()}`;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex matching runner ids of EARLIER processes of this server (computer + port). */
const earlierRunsOfThisHost = () =>
  new RegExp(`^${escapeRegex(SERVER)}:(?!${escapeRegex(RUNNER_ID.slice(SERVER.length + 1))}$)`);

module.exports = { RUNNER_ID, HOST, SERVER, earlierRunsOfThisHost };
