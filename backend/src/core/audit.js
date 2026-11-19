// Audit log writer. Never throws: a failed audit write is reported in the
// server log but does not break the user's action.
const AuditLog = require("../models/AuditLog");

const SECRET_FIELDS = /pass(word)?|code|token|secret|hash/i;
const scrub = (value) => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrub);
  return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_FIELDS.test(k)).map(([k, v]) => [k, scrub(v)]));
};

/**
 * @param {object} req  the request (actor and address are taken from it), or null
 * @param {{ action: string, module?: string, entity?: string, entityId?: string,
 *           changes?: object, actor?: { type: string, id?: any, audience?: string } }} entry
 */
const audit = async (req, entry) => {
  try {
    const p = req?.principal;
    const actor = entry.actor || (p ? { type: p.kind, id: p.id, audience: p.audience } : { type: "system" });
    await AuditLog.create({
      actorType: actor.type,
      actorId: actor.id || null,
      audience: actor.audience || null,
      action: entry.action,
      module: entry.module || "platform",
      entity: entry.entity || null,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      changes: entry.changes ? scrub(entry.changes) : null,
      ip: req?.ip || null,
      at: new Date(),
    });
  } catch (err) {
    console.error("Audit log write failed:", err.message);
  }
};

module.exports = { audit, scrub };
