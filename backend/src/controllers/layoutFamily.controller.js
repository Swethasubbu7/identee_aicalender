const LayoutFamily = require("../models/LayoutFamily");
const { CUT_TYPES, FAMILY_STATUSES } = require("../constants/calendar");

const listFamilies = async (req, res) => {
  try {
    const { cutType, status } = req.query;
    const filter = {
      ...(cutType && { cutType }),
      ...(status && { status }),
    };
    const families = await LayoutFamily.find(filter).sort({ code: 1 });
    res.status(200).json({ message: "Families fetched", families });
  } catch (error) {
    console.error("List families error:", error);
    res.status(500).json({ message: "Failed to fetch layout families" });
  }
};

const createFamily = async (req, res) => {
  try {
    const { code, name, cutType, category, tags, status, notes } = req.body;
    if (!code || !name || !CUT_TYPES.includes(cutType)) {
      return res
        .status(400)
        .json({ message: "code, name and a valid cutType are required" });
    }
    if (status && !FAMILY_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const family = await LayoutFamily.create({
      code,
      name,
      cutType,
      category,
      tags,
      status,
      notes,
      createdBy: req.user.userId,
    });
    res.status(201).json({ message: "Family created", family });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A family with this code exists" });
    }
    console.error("Create family error:", error);
    res.status(400).json({ message: "Failed to create layout family" });
  }
};

const updateFamily = async (req, res) => {
  try {
    const allowed = ["code", "name", "category", "tags", "status", "notes"];
    const update = Object.fromEntries(
      allowed.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]),
    );
    if (update.code !== undefined) {
      update.code = String(update.code).trim();
      if (!update.code) return res.status(400).json({ message: "code cannot be empty" });
    }
    if (update.status && !FAMILY_STATUSES.includes(update.status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const family = await LayoutFamily.findByIdAndUpdate(req.params.id, update, {
      returnDocument: "after",
    });
    if (!family) return res.status(404).json({ message: "Family not found" });
    res.status(200).json({ message: "Family updated", family });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A family with this code exists" });
    }
    console.error("Update family error:", error);
    res.status(400).json({ message: "Failed to update layout family" });
  }
};

module.exports = { listFamilies, createFamily, updateFamily };
