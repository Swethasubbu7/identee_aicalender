// There is no admin role: every signed-in designer has full access to all
// features (business decision 2026-10-15). The stored `role` is ignored.
const hasFullAccess = (req) => Boolean(req.user);

// Which production layouts a designer may open and generate from:
//   - ACTIVE and VALIDATED layouts (results from a validated, not yet
//     activated layout are marked as not activated);
//   - reusable layouts saved from a chosen design (DRAFT until validated).
// DRAFT production layouts that fail validation can be opened and checked,
// but never generated from.

const isOwnSavedLayout = (req, variant) =>
  Boolean(variant?.design) && Boolean(req.user?.userId) && String(variant.createdBy) === String(req.user.userId);

const canUseLayout = (req, variant) => {
  if (!variant || variant.status === "ARCHIVED") return false;
  if (variant.status === "ACTIVE") return true;
  if (hasFullAccess(req)) return variant.status === "VALIDATED" || Boolean(variant.design);
  return isOwnSavedLayout(req, variant);
};

module.exports = { canUseLayout, isOwnSavedLayout, hasFullAccess };
