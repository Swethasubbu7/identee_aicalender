const express = require("express");
const { getSummary, listRecords, reconcileRecord } = require("../controllers/aiUsage.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { requirePermission } = require("../core/authenticate");
const { P } = require("../core/roles");

const router = express.Router();
const signedIn = [verifyToken, requirePermission(P.CAL_AI_USAGE)];

router.get("/summary", ...signedIn, getSummary);
router.get("/records", ...signedIn, listRecords);
router.post("/records/:requestId/reconcile", ...signedIn, requirePermission(P.CAL_AI_USAGE_MANAGE), reconcileRecord);

module.exports = router;
