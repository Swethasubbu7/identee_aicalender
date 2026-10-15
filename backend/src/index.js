const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();
const config = require("./config");

const authRoutes = require("./routes/auth.routes");
const registerRoutes = require("./routes/register.routes");
const layoutRoutes = require("./routes/layout.routes");
const calendarDesignRoutes = require("./routes/calendarDesign.routes");
const aiGenerationRoutes = require("./routes/aiGeneration.routes");
const calendarFormatRoutes = require("./routes/calendarFormat.routes");
const productionProfileRoutes = require("./routes/productionProfile.routes");
const layoutFamilyRoutes = require("./routes/layoutFamily.routes");
const layoutVariantRoutes = require("./routes/layoutVariant.routes");
const aiCalendarRoutes = require("./routes/aiCalendar.routes");
const aiUsageRoutes = require("./routes/aiUsage.routes");
const { recoverInterruptedJobs } = require("./services/ai/calendarJobRunner");
const path = require("path");
const app = express();

// Content-Disposition is exposed so PDF downloads keep their file names.
app.use(cors({ exposedHeaders: ["Content-Disposition"] }));
app.use(express.json());

// Auth Routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", registerRoutes);

// Layout Routes
app.use("/api/layouts", layoutRoutes);
app.use("/api/calendar-designs", calendarDesignRoutes);
app.use("/api/ai-generate", aiGenerationRoutes);
app.use("/api/calendar-formats", calendarFormatRoutes);
app.use("/api/production-profiles", productionProfileRoutes);
app.use("/api/layout-families", layoutFamilyRoutes);
app.use("/api/layout-variants", layoutVariantRoutes);
app.use("/api/ai-calendars", aiCalendarRoutes);
app.use("/api/ai-usage", aiUsageRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully ✅");
    recoverInterruptedJobs().catch((err) => console.error("AI job recovery failed:", err.message));
  })
  .catch((error) => {
    console.error("MongoDB connection failed ❌", error.message);
  });

// Test Route
app.get("/", (req, res) => {
  res.json({
    message: "AI Calendar Backend is running 🚀",
  });
});

// Server
const { PORT } = config;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
