const CalendarDesign = require("../models/CalendarDesign");
const Layout = require("../models/Layout");

const createDraft = async (req, res) => {
  try {
    const { layoutId, canvasData, elements, year, language } = req.body;

    if (!layoutId) {
      return res.status(400).json({ message: "layoutId is required" });
    }

    const layout = await Layout.findById(layoutId);
    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }

    const design = await CalendarDesign.create({
      layoutId,
      createdBy: req.user?.userId,
      canvasData: canvasData || null,
      elements: elements || [],
      year,
      language,
      status: "draft",
    });

    res.status(201).json({ message: "Draft created", design });
  } catch (error) {
    console.error("Create draft error:", error);
    res.status(500).json({ message: "Failed to create draft" });
  }
};

const getDesign = async (req, res) => {
  try {
    const design = await CalendarDesign.findById(req.params.id);
    if (!design) {
      return res.status(404).json({ message: "Design not found" });
    }
    res.status(200).json({ message: "Design fetched", design });
  } catch (error) {
    console.error("Get design error:", error);
    res.status(400).json({ message: "Invalid design ID" });
  }
};

const updateDesign = async (req, res) => {
  try {
    const { canvasData, elements, year, language, status } = req.body;
    const design = await CalendarDesign.findById(req.params.id);
    if (!design) {
      return res.status(404).json({ message: "Design not found" });
    }

    if (canvasData !== undefined) design.canvasData = canvasData;
    if (elements !== undefined) design.elements = elements;
    if (year !== undefined) design.year = year;
    if (language !== undefined) design.language = language;
    if (status !== undefined) design.status = status;

    await design.save();
    res.status(200).json({ message: "Design updated", design });
  } catch (error) {
    console.error("Update design error:", error);
    res.status(400).json({ message: "Failed to update design" });
  }
};

const autosaveDesign = async (req, res) => {
  try {
    const { canvasData, elements, year, language } = req.body;
    const design = await CalendarDesign.findByIdAndUpdate(
      req.params.id,
      {
        ...(canvasData !== undefined && { canvasData }),
        ...(elements !== undefined && { elements }),
        ...(year !== undefined && { year }),
        ...(language !== undefined && { language }),
      },
      { new: true },
    );
    if (!design) {
      return res.status(404).json({ message: "Design not found" });
    }
    res.status(200).json({ message: "Autosaved", updatedAt: design.updatedAt });
  } catch (error) {
    console.error("Autosave error:", error);
    res.status(400).json({ message: "Autosave failed" });
  }
};

module.exports = { createDraft, getDesign, updateDesign, autosaveDesign };
