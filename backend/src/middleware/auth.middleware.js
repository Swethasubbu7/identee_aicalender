// Calendar Tool sign-in check. Since Phase 2 every existing Calendar Tool
// API is for the "calendar-staff" audience only: a shop customer, shop staff
// or calendar customer sign-in is refused here, and so is a staff account
// without a calendar role. Accepts the calendar-staff cookie or a Bearer
// token (including tokens from the pre-Phase-2 /api/auth/login).
const { requireAudience } = require("../core/authenticate");

const verifyToken = requireAudience("calendar-staff");

module.exports = { verifyToken };
