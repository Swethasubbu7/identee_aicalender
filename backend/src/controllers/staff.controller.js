// Staff management (Phase 2). No public staff sign-up: an administrator
// creates the account and the new member sets their own password with an
// e-mailed code.
//
// Who may manage whom:
//   Super Admin (platform.staff.manage) — everyone, every role, platform role
//   E-commerce Admin (shop.staff.manage) — shop roles only
//   Calendar Admin (calendar.staff.manage) — calendar roles only
// A member who belongs to both modules can only be deactivated by someone
// who may manage both. Nobody can deactivate themselves or change their own
// platform role (no accidental lock-out).
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const { P, rolesOf, isValidModuleRole, ROLE_LABELS } = require("../core/roles");
const { issueOtp } = require("../core/otp");
const mailer = require("../core/mailer");
const { audit } = require("../core/audit");
const { notify } = require("../core/notify");
const { revokeAllSessions } = require("../core/sessions");

const MODULES = ["platform", "shop", "calendar"];
const MANAGE = { platform: P.PLATFORM_STAFF_MANAGE, shop: P.SHOP_STAFF_MANAGE, calendar: P.CAL_STAFF_MANAGE };

const can = (principal, perm) => principal.permissions.includes(perm);
const canManageModule = (principal, module) => can(principal, P.PLATFORM_STAFF_MANAGE) || (module !== "platform" && can(principal, MANAGE[module]));
const membership = (roles) => MODULES.filter((m) => roles[m]);
const canSee = (principal, roles) =>
  can(principal, P.PLATFORM_STAFF_MANAGE) || membership(roles).some((m) => m !== "platform" && canManageModule(principal, m));

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const view = (u) => {
  const roles = rolesOf(u);
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    roles,
    roleLabels: Object.fromEntries(Object.entries(roles).map(([m, r]) => [m, r ? ROLE_LABELS[r] : null])),
    legacyRoles: !["platform", "shop", "calendar"].some((m) => u.roles?.[m]),
    active: u.active !== false,
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt || null,
  };
};

/** Validates a { platform?, shop?, calendar? } change against the actor's rights. */
const checkRoleChange = (principal, change) => {
  const out = {};
  for (const [module, role] of Object.entries(change || {})) {
    if (!MODULES.includes(module)) return { error: `Unknown module ${module}.` };
    const value = role === "" || role === undefined ? null : role;
    if (!isValidModuleRole(module, value)) return { error: `${value} is not a ${module} role.` };
    if (!canManageModule(principal, module)) return { error: `You cannot assign ${module} roles.`, status: 403 };
    out[module] = value;
  }
  return { roles: out };
};

// GET /api/staff
const listStaff = async (req, res) => {
  try {
    const users = await User.find({}).sort({ name: 1 }).lean();
    res.json({ staff: users.map(view).filter((s) => canSee(req.principal, s.roles)) });
  } catch (err) {
    console.error("List staff error:", err);
    res.status(500).json({ message: "Failed to load staff." });
  }
};

// POST /api/staff { name, email, roles: { shop?, calendar?, platform? } }
const createStaff = async (req, res) => {
  try {
    const name = str(req.body?.name, 120);
    const email = str(req.body?.email, 254).toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Name and a valid e-mail are required." });
    const checked = checkRoleChange(req.principal, req.body?.roles);
    if (checked.error) return res.status(checked.status || 400).json({ message: checked.error });
    const roles = { platform: null, shop: null, calendar: null, ...checked.roles };
    if (!membership(roles).length) return res.status(400).json({ message: "Give the new member at least one role." });
    if (await User.findOne({ email })) return res.status(409).json({ message: "A staff account with this e-mail already exists." });

    const user = await User.create({
      name,
      email,
      // Unusable random password: the member sets their own with the code.
      password: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12),
      role: roles.platform === "SUPER_ADMIN" ? "ADMIN" : "STAFF",
      roles,
      createdBy: req.principal.id,
    });
    const audience = roles.calendar || (roles.platform && !roles.shop) ? "calendar-staff" : "shop-staff";
    let mailed = true;
    try {
      const code = await issueOtp({ purpose: "reset-password", audience, subjectType: "staff", subjectId: user._id });
      const loginPath = audience === "calendar-staff" ? "/calendar/staff/reset-password" : "/shop/staff/reset-password";
      await mailer.sendMail({
        to: email,
        subject: "Your Nauticrew staff account",
        text:
          `Hello ${name},\n\nA Nauticrew staff account was created for you.\n\n` +
          `Set your password on the page ${loginPath} with this code: ${code}\nThe code is valid for 15 minutes; ` +
          `after that use "Forgot password" on the sign-in page.\n\nNauticrew`,
      });
    } catch (err) {
      mailed = false;
      console.error("Staff invitation e-mail failed:", err.message);
    }
    await audit(req, { action: "staff.create", module: membership(roles).includes("shop") ? "shop" : "calendar", entity: "staff", entityId: user._id, changes: { name, email, roles } });
    res.status(201).json({
      message: mailed
        ? "Staff account created. An e-mail with a set-password code was sent."
        : "Staff account created, but the e-mail could not be sent. Ask the member to use “Forgot password” on the sign-in page.",
      staff: view(user),
    });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: "A staff account with this e-mail already exists." });
    console.error("Create staff error:", err);
    res.status(500).json({ message: "Failed to create the staff account." });
  }
};

const loadTarget = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ message: "Staff member not found." });
    return null;
  }
  const user = await User.findById(req.params.id);
  // Someone the actor may not manage is reported as not found.
  if (!user || !canSee(req.principal, rolesOf(user))) {
    res.status(404).json({ message: "Staff member not found." });
    return null;
  }
  return user;
};

// PATCH /api/staff/:id/roles { platform?, shop?, calendar? }
const updateRoles = async (req, res) => {
  try {
    const user = await loadTarget(req, res);
    if (!user) return;
    const checked = checkRoleChange(req.principal, req.body);
    if (checked.error) return res.status(checked.status || 400).json({ message: checked.error });
    if (String(user._id) === req.principal.id && "platform" in checked.roles) {
      return res.status(400).json({ message: "You cannot change your own platform role." });
    }
    const before = rolesOf(user);
    const after = { ...before, ...checked.roles };
    if (!membership(after).length) return res.status(400).json({ message: "A staff member needs at least one role. Deactivate the account instead." });
    user.roles = after;
    user.role = after.platform === "SUPER_ADMIN" ? "ADMIN" : "STAFF";
    user.tokenVersion = (user.tokenVersion || 0) + 1; // new rights apply at once
    await user.save();
    await audit(req, { action: "staff.roles.update", module: "platform", entity: "staff", entityId: user._id, changes: { before, after } });
    await notify({
      recipientType: "staff",
      recipientId: user._id,
      audience: after.calendar ? "calendar-staff" : "shop-staff",
      type: "staff.roles.changed",
      title: "Your access was updated",
      body: "Sign in again to use your new access.",
    });
    res.json({ message: "Roles updated. The member must sign in again.", staff: view(user) });
  } catch (err) {
    console.error("Update roles error:", err);
    res.status(500).json({ message: "Failed to update roles." });
  }
};

// PATCH /api/staff/:id/active { active: boolean }
const setActive = async (req, res) => {
  try {
    const user = await loadTarget(req, res);
    if (!user) return;
    const active = req.body?.active === true;
    if (String(user._id) === req.principal.id) return res.status(400).json({ message: "You cannot deactivate your own account." });
    const modules = membership(rolesOf(user));
    if (!modules.every((m) => canManageModule(req.principal, m))) {
      return res.status(403).json({ message: "This member also works in another module; ask a Super Admin." });
    }
    user.active = active;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    if (!active) await revokeAllSessions(user._id, "deactivated");
    await audit(req, { action: active ? "staff.activate" : "staff.deactivate", module: "platform", entity: "staff", entityId: user._id });
    res.json({ message: active ? "Account activated." : "Account deactivated and signed out everywhere.", staff: view(user) });
  } catch (err) {
    console.error("Set active error:", err);
    res.status(500).json({ message: "Failed to change the account." });
  }
};

module.exports = { listStaff, createStaff, updateRoles, setActive, checkRoleChange, canManageModule };
