// Identifies this server process in AI jobs and usage records. Several
// servers (team computers) share one database: a restart may only close the
// jobs and requests of ITS OWN earlier process, never another server's.
const os = require("os");

const HOST = os.hostname();
const RUNNER_ID = `${HOST}:${process.pid}:${Date.now()}`;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex matching runner ids of EARLIER processes on this computer. */
const earlierRunsOfThisHost = () =>
  new RegExp(`^${escapeRegex(HOST)}:(?!${escapeRegex(RUNNER_ID.slice(HOST.length + 1))}$)`);

module.exports = { RUNNER_ID, HOST, earlierRunsOfThisHost };
