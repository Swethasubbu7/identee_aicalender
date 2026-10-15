const express = require("express");
const { getSummary, listRecords, reconcileRecord } = require("../controllers/aiUsage.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();
const signedIn = [verifyToken];

router.get("/summary", ...signedIn, getSummary);
router.get("/records", ...signedIn, listRecords);
router.post("/records/:requestId/reconcile", ...signedIn, reconcileRecord);

module.exports = router;
