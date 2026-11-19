// /api/staff — staff management for administrators (shop or calendar staff
// panel). Every action is audited.
const express = require("express");
const { listStaff, createStaff, updateRoles, setActive } = require("../controllers/staff.controller");
const { requireAudience } = require("../core/authenticate");
const { P } = require("../core/roles");

const router = express.Router();

// Signed in to either staff panel AND allowed to manage some staff.
const staffAdmin = [
  requireAudience(["calendar-staff", "shop-staff"]),
  (req, res, next) =>
    [P.PLATFORM_STAFF_MANAGE, P.SHOP_STAFF_MANAGE, P.CAL_STAFF_MANAGE].some((p) => req.principal.permissions.includes(p))
      ? next()
      : res.status(403).json({ message: "Your role does not allow managing staff.", code: "FORBIDDEN" }),
];

router.get("/", ...staffAdmin, listStaff);
router.post("/", ...staffAdmin, createStaff);
router.patch("/:id/roles", ...staffAdmin, updateRoles);
router.patch("/:id/active", ...staffAdmin, setActive);

module.exports = router;
