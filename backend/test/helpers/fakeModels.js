// In-memory stand-ins for the Mongoose models used by the Phase 2 auth code.
// Tests never touch MongoDB Atlas. Only the query shapes the code uses are
// supported: equality, null, array-contains, $in; .sort() / .limit() / .lean()
// chains; updateOne / updateMany with $set.
const mongoose = require("mongoose");

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const same = (a, b) => String(a) === String(b);

const matchValue = (actual, expected) => {
  if (expected && typeof expected === "object" && !(expected instanceof Date) && !mongoose.isValidObjectId(expected)) {
    if ("$in" in expected) return expected.$in.some((v) => matchValue(actual, v));
  }
  if (expected === null) return actual === null || actual === undefined;
  if (Array.isArray(actual)) return actual.some((v) => same(v, expected));
  return actual !== undefined && same(actual, expected);
};
const matches = (doc, filter = {}) => Object.entries(filter).every(([k, v]) => matchValue(get(doc, k), v));

class Query {
  constructor(run) {
    this.run = run;
    this.sortSpec = null;
    this.limitN = null;
  }
  sort(spec) {
    this.sortSpec = spec;
    return this;
  }
  limit(n) {
    this.limitN = n;
    return this;
  }
  lean() {
    return this;
  }
  select() {
    return this;
  }
  then(resolve, reject) {
    return Promise.resolve()
      .then(() => this.run(this))
      .then(resolve, reject);
  }
}

const sortDocs = (docs, spec) => {
  if (!spec) return docs;
  const [[key, dir]] = Object.entries(spec);
  return [...docs].sort((a, b) => ((get(a, key) ?? 0) > (get(b, key) ?? 0) ? dir : -dir));
};

/** Replaces the statics of a Mongoose model with an in-memory store. */
const fakeModel = (Model, { defaults = () => ({}) } = {}) => {
  const rows = [];
  let tick = 0;
  const wrap = (row) => {
    Object.defineProperty(row, "save", { value: async () => row, enumerable: false, configurable: true });
    Object.defineProperty(row, "toObject", { value: () => ({ ...row }), enumerable: false, configurable: true });
    return row;
  };
  const find = (filter) => rows.filter((r) => matches(r, filter));
  Model.create = async (doc) => {
    tick += 1;
    const now = new Date(Date.now() + tick); // strictly increasing
    const row = wrap({ _id: new mongoose.Types.ObjectId(), createdAt: now, updatedAt: now, ...defaults(), ...doc });
    rows.push(row);
    return row;
  };
  Model.findOne = (filter) => new Query((q) => sortDocs(find(filter), q.sortSpec)[0] || null);
  Model.findById = (id) => new Query(() => rows.find((r) => same(r._id, id)) || null);
  Model.find = (filter) =>
    new Query((q) => {
      const out = sortDocs(find(filter), q.sortSpec);
      return q.limitN ? out.slice(0, q.limitN) : out;
    });
  Model.countDocuments = async (filter) => find(filter).length;
  const applySet = (row, update) => Object.assign(row, update.$set || {});
  Model.updateOne = async (filter, update) => {
    const row = find(filter)[0];
    if (row) applySet(row, update);
    return { matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0 };
  };
  Model.updateMany = async (filter, update) => {
    const list = find(filter);
    list.forEach((r) => applySet(r, update));
    return { matchedCount: list.length, modifiedCount: list.length };
  };
  Model._rows = rows;
  return rows;
};

module.exports = { fakeModel, matches };
