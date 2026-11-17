// Deleting drafts never touches generated designs (AiCalendarJob documents
// or their files). No database: the model methods are replaced in memory.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const CalendarDesign = require("../src/models/CalendarDesign");
const AiCalendarJob = require("../src/models/AiCalendarJob");
const { deleteDesign, bulkDeleteDesigns } = require("../src/controllers/calendarDesign.controller");

const USER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbb";
const id = (n) => String(n).padStart(24, "0");

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

// Replaces model/fs methods for one test and records every call.
const withStubs = async ({ drafts, imagesInUse = [] }, run) => {
  const calls = { designDeleteMany: [], jobWrites: 0, unlinked: [], rm: 0 };
  const saved = {
    find: CalendarDesign.find,
    findById: CalendarDesign.findById,
    deleteMany: CalendarDesign.deleteMany,
    designExists: CalendarDesign.exists,
    jobExists: AiCalendarJob.exists,
    jobDeleteMany: AiCalendarJob.deleteMany,
    jobDeleteOne: AiCalendarJob.deleteOne,
    unlink: fs.promises.unlink,
    rm: fs.promises.rm,
  };
  const owned = (filter) =>
    drafts.filter(
      (d) => filter._id.$in.map(String).includes(String(d._id)) && String(d.createdBy) === String(filter.createdBy),
    );
  CalendarDesign.find = async (filter) => owned(filter);
  CalendarDesign.findById = async (x) => drafts.find((d) => String(d._id) === String(x)) || null;
  CalendarDesign.deleteMany = async (filter) => {
    calls.designDeleteMany.push(filter);
    return { deletedCount: owned(filter).length };
  };
  const inUse = async (q) => q.$or.some((c) => imagesInUse.includes(Object.values(c)[0]));
  CalendarDesign.exists = inUse;
  AiCalendarJob.exists = inUse;
  AiCalendarJob.deleteMany = async () => {
    calls.jobWrites += 1;
  };
  AiCalendarJob.deleteOne = async () => {
    calls.jobWrites += 1;
  };
  fs.promises.unlink = async (p) => {
    calls.unlinked.push(p.replace(/\\/g, "/"));
  };
  fs.promises.rm = async () => {
    calls.rm += 1;
  };
  try {
    await run(calls);
  } finally {
    CalendarDesign.find = saved.find;
    CalendarDesign.findById = saved.findById;
    CalendarDesign.deleteMany = saved.deleteMany;
    CalendarDesign.exists = saved.designExists;
    AiCalendarJob.exists = saved.jobExists;
    AiCalendarJob.deleteMany = saved.jobDeleteMany;
    AiCalendarJob.deleteOne = saved.jobDeleteOne;
    fs.promises.unlink = saved.unlink;
    fs.promises.rm = saved.rm;
  }
};

const draft = (n, owner = USER, content = {}) => ({
  _id: id(n),
  createdBy: owner,
  thumbnail: `/uploads/design-content/thumb-${n}.png`,
  content,
});

test("bulk delete: only the user's selected drafts are deleted; generated designs are never touched", async () => {
  const drafts = [
    draft(1, USER, { godImage: "/uploads/design-content/god-shared.png" }),
    draft(2, USER, { godImage: "/uploads/design-content/god-own.png" }),
    draft(3, USER),
    draft(4, OTHER),
  ];
  await withStubs({ drafts, imagesInUse: ["/uploads/design-content/god-shared.png"] }, async (calls) => {
    const res = fakeRes();
    await bulkDeleteDesigns({ body: { ids: [id(1), id(2), id(4), id(9)] }, user: { userId: USER } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.deleted, [id(1), id(2)]);
    assert.deepEqual(res.body.notFound, [id(4), id(9)]); // another user's draft and a missing one
    assert.equal(calls.designDeleteMany.length, 1);
    assert.equal(String(calls.designDeleteMany[0].createdBy), USER);
    assert.deepEqual(calls.designDeleteMany[0]._id.$in.map(String), [id(1), id(2)]);
    assert.equal(calls.jobWrites, 0, "AiCalendarJob must not be modified");
    assert.equal(calls.rm, 0, "no folder (e.g. uploads/ai-calendars) may be removed");
    // An image a generation still uses is kept; the draft's own one goes.
    assert.ok(!calls.unlinked.some((p) => p.endsWith("god-shared.png")));
    assert.ok(calls.unlinked.some((p) => p.endsWith("god-own.png")));
    assert.ok(calls.unlinked.every((p) => p.includes("/uploads/design-content/")));
  });
});

test("bulk delete: bad requests are refused without deleting anything", async () => {
  await withStubs({ drafts: [draft(1)] }, async (calls) => {
    for (const body of [{}, { ids: [] }, { ids: "x" }, { ids: ["not-an-id"] }, { ids: Array.from({ length: 201 }, (_, i) => id(i + 1)) }]) {
      const res = fakeRes();
      await bulkDeleteDesigns({ body, user: { userId: USER } }, res);
      assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 40));
    }
    assert.equal(calls.designDeleteMany.length, 0);
  });
});

test("single delete keeps the draft's generated designs too", async () => {
  await withStubs({ drafts: [draft(5)] }, async (calls) => {
    const res = fakeRes();
    await deleteDesign({ params: { id: id(5) }, user: { userId: USER } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.designDeleteMany.length, 1);
    assert.equal(calls.jobWrites, 0);
    assert.equal(calls.rm, 0);
  });
  await withStubs({ drafts: [draft(6, OTHER)] }, async (calls) => {
    const res = fakeRes();
    await deleteDesign({ params: { id: id(6) }, user: { userId: USER } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(calls.designDeleteMany.length, 0);
  });
});
