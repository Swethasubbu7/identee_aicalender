const ProductionProfile = require("../models/ProductionProfile");

const NUMBER_FIELDS = {
  print: ["bleedMm", "safeMarginMm", "minDpi"],
  laser: ["cutlineStrokeWidthMm", "kerfMm", "minFeatureMm"],
};
const STRING_FIELDS = {
  print: ["colorMode", "iccProfileName", "iccProfileFile"],
  laser: ["cutlineSpotName", "cutlineColor"],
};

// Copies only known fields. Empty string / null clears a value back to PENDING.
const pickProfileFields = (body = {}) => {
  const update = {};
  for (const group of ["print", "laser"]) {
    for (const key of NUMBER_FIELDS[group]) {
      if (body[group]?.[key] === undefined) continue;
      const raw = body[group][key];
      const value = raw === null || raw === "" ? null : Number(raw);
      if (value !== null && !(value >= 0)) {
        throw new Error(`${group}.${key} must be a non-negative number`);
      }
      update[`${group}.${key}`] = value;
    }
    for (const key of STRING_FIELDS[group]) {
      if (body[group]?.[key] === undefined) continue;
      update[`${group}.${key}`] = body[group][key] || null;
    }
  }
  if (body.laser?.registrationMarksRequired !== undefined) {
    const v = body.laser.registrationMarksRequired;
    update["laser.registrationMarksRequired"] = v === null ? null : Boolean(v);
  }
  for (const key of ["name", "material"]) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Array.isArray(body.cutTypes)) update.cutTypes = body.cutTypes;
  return update;
};

const listProfiles = async (req, res) => {
  try {
    const profiles = await ProductionProfile.find().sort({ createdAt: 1 });
    res.status(200).json({ message: "Profiles fetched", profiles });
  } catch (error) {
    console.error("List profiles error:", error);
    res.status(500).json({ message: "Failed to fetch profiles" });
  }
};

const createProfile = async (req, res) => {
  try {
    if (!req.body.name) {
      return res.status(400).json({ message: "name is required" });
    }
    const profile = new ProductionProfile({ name: req.body.name });
    profile.set(pickProfileFields(req.body));
    profile.updatedBy = req.user.userId;
    await profile.save();
    res.status(201).json({ message: "Profile created", profile });
  } catch (error) {
    console.error("Create profile error:", error);
    res.status(400).json({ message: error.message || "Failed to create profile" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const profile = await ProductionProfile.findByIdAndUpdate(
      req.params.id,
      { ...pickProfileFields(req.body), updatedBy: req.user.userId },
      { returnDocument: "after", runValidators: true },
    );
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    res.status(200).json({ message: "Profile updated", profile });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(400).json({ message: error.message || "Failed to update profile" });
  }
};

module.exports = { listProfiles, createProfile, updateProfile, pickProfileFields };
