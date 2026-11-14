// The signed-in user of the current request, available to helpers (such as
// toPublicUrl) that build file links deep inside controllers.
const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

const runWithUser = (user, fn) => storage.run({ user }, fn);
const currentUser = () => storage.getStore()?.user || null;

module.exports = { runWithUser, currentUser };
