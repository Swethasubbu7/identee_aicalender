const CalendarFormat = require("../models/CalendarFormat");
const { CUT_TYPES, CAKE_STATUS, cakeLabel } = require("../constants/calendar");

// GET /api/calendar-formats?cutType=die-cut
const listFormats = async (req, res) => {
  try {
    const { cutType } = req.query;
    if (cutType && !CUT_TYPES.includes(cutType)) {
      return res.status(400).json({ message: "Unknown cut type" });
    }
    const filter = { active: true, ...(cutType && { cutType }) };
    const formats = await CalendarFormat.find(filter).sort({ sortOrder: 1 });
    res.status(200).json({ message: "Formats fetched", formats });
  } catch (error) {
    console.error("List formats error:", error);
    res.status(500).json({ message: "Failed to fetch formats" });
  }
};

// PUT /api/calendar-formats/:id/cake
// Records a cake size once the business confirms it (e.g. the 30×40 cake).
// Body: { heightIn, widthIn } — named fields, so the H×W convention cannot
// be mixed up.
const confirmCakeSize = async (req, res) => {
  try {
    const widthIn = Number(req.body.widthIn);
    const heightIn = Number(req.body.heightIn);
    if (!(widthIn > 0) || !(heightIn > 0)) {
      return res
        .status(400)
        .json({ message: "widthIn and heightIn must be positive numbers" });
    }
    const format = await CalendarFormat.findByIdAndUpdate(
      req.params.id,
      {
        cake: {
          label: cakeLabel(heightIn, widthIn),
          heightIn,
          widthIn,
          status: CAKE_STATUS.CONFIRMED,
        },
      },
      { returnDocument: "after" },
    );
    if (!format) return res.status(404).json({ message: "Format not found" });
    res.status(200).json({ message: "Cake size confirmed", format });
  } catch (error) {
    console.error("Confirm cake error:", error);
    res.status(400).json({ message: "Failed to update cake size" });
  }
};

module.exports = { listFormats, confirmCakeSize };
